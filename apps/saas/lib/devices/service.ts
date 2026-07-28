import crypto from "crypto";
import { prisma } from "@/lib/db";
import { generateUniqueShortCode } from "@/lib/id/short-code";
import { getConfigInt } from "@/lib/config";
import { SlotLimitExceeded, InvalidPrinterType, DeviceNotFound } from "./errors";
import type { Device, Prisma } from "@prisma/client";

export const PRINTER_TYPES = ["bambu", "moonraker"] as const;
export type PrinterType = (typeof PRINTER_TYPES)[number];

function assertValidPrinterType(value: string): asserts value is PrinterType {
  if (!(PRINTER_TYPES as readonly string[]).includes(value)) {
    throw new InvalidPrinterType(value);
  }
}

export async function listDevices(userId: string): Promise<Device[]> {
  return prisma.device.findMany({ where: { userId } });
}

/**
 * Row-lock (FOR UPDATE) pada baris Entitlement user sebelum COUNT+create — mencegah 2 request
 * paralel sama-sama lolos di slot terakhir. Transaksi interaktif Prisma default READ COMMITTED,
 * TIDAK cukup sendirian (2 transaksi paralel sama-sama lihat COUNT lama) — lock eksplisit yang
 * benar-benar menutup race-nya (lihat spec §"Race condition").
 *
 * Catatan dari code review (mutation-testing), tiga lapis, WAJIB dipertahankan urutan &
 * caranya persis begini — dua pendekatan lain sudah dicoba & TERBUKTI gagal di Postgres asli:
 * - `SELECT ... FOR UPDATE` pada 0 baris TIDAK mengunci apa pun. User baru/Free-tier sering
 *   belum punya baris Entitlement (dibuat best-effort & di-catch-swallow di lib/auth.ts /
 *   lib/wa/session.ts) — jadi pastikan dulu barisnya ADA sebelum ambil lock.
 * - PERCOBAAN 1 (`tx.entitlement.upsert(...)`) GAGAL: dibuktikan lewat query-log Prisma bahwa di
 *   dalam interactive transaction, `upsert()` dikompilasi ke SELECT lalu INSERT/UPDATE terpisah
 *   di client, BUKAN satu `INSERT ... ON CONFLICT` atomik — dua transaksi paralel sama-sama lolos
 *   SELECT-nya (baris belum ada) lalu sama-sama INSERT → salah satu dapat unique-constraint error
 *   mentah. Reproduksi nyata: `PrismaClientKnownRequestError: Unique constraint failed on the
 *   fields: ("userId")`.
 * - PERCOBAAN 2 (`tx.entitlement.create()` polos + try/catch P2002) JUGA GAGAL, dengan gejala
 *   BERBEDA: Postgres meng-abort SELURUH transaksi begitu satu statement di dalamnya error —
 *   nge-catch exception-nya di JS TIDAK meng-un-abort transaksi Postgres itu sendiri (perlu
 *   SAVEPOINT buat itu, yang tak dipakai di sini). Statement berikutnya (row-lock) langsung gagal
 *   dengan `25P02: current transaction is aborted, commands ignored until end of transaction
 *   block` — dikonfirmasi lewat integration test asli terhadap Postgres, bukan cuma dugaan.
 * - FIX YANG BENAR: raw SQL `INSERT ... ON CONFLICT ("userId") DO NOTHING` — satu statement,
 *   atomik di level DB, dan TIDAK PERNAH error walau konflik (makanya tak butuh try/catch atau
 *   SAVEPOINT sama sekali). `id`/`updatedAt` disuplai manual (dicek langsung ke
 *   information_schema: keduanya NOT NULL tanpa DB-level default — kolom lain punya default jadi
 *   aman diabaikan).
 * - `getConfigInt` dipanggil SEBELUM transaksi dibuka, bukan di dalamnya — supaya query ke
 *   Config (koneksi terpisah dari tx) tidak menahan diri di belakang FOR UPDATE lock; request
 *   lain yang antre di lock bisa kena connection-pool starvation atau P2028 (interactive
 *   transaction timeout) kalau query config itu lambat.
 */
export async function createDevice(
  userId: string,
  input: { label: string; printerType: string }
): Promise<Device> {
  assertValidPrinterType(input.printerType);

  const fallbackLimit = await getConfigInt("printer.defaultSlots", 1);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "Entitlement" ("id", "userId", "updatedAt") VALUES (${crypto.randomUUID()}, ${userId}, now()) ON CONFLICT ("userId") DO NOTHING`;
    await tx.$queryRaw`SELECT 1 FROM "Entitlement" WHERE "userId" = ${userId} FOR UPDATE`;
    const entitlement = await tx.entitlement.findUnique({ where: { userId } });
    const limit = entitlement?.printerSlots ?? fallbackLimit;
    const count = await tx.device.count({ where: { userId } });
    if (count >= limit) throw new SlotLimitExceeded(limit);

    const shortCode = await generateUniqueShortCode();
    return tx.device.create({
      data: { userId, label: input.label, printerType: input.printerType, shortCode },
    });
  });
}

export async function updateDevice(
  userId: string,
  id: string,
  input: { label?: string; printerType?: string }
): Promise<Device> {
  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new DeviceNotFound();
  if (input.printerType !== undefined) assertValidPrinterType(input.printerType);
  return prisma.device.update({
    where: { id },
    data: { ...(input.label !== undefined && { label: input.label }), ...(input.printerType !== undefined && { printerType: input.printerType }) },
  });
}

/** Hapus device + drop cell layout yang mereferensikan shortCode-nya, dalam 1 transaksi (cegah race vs PUT /api/cyd-layout). */
export async function deleteDevice(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const device = await tx.device.findUnique({ where: { id } });
    if (!device || device.userId !== userId) throw new DeviceNotFound();

    await tx.device.delete({ where: { id } });

    const layout = await tx.cydLayout.findUnique({ where: { userId } });
    if (!layout) return;
    const config = layout.config as { schemaVersion: 1; pages: Array<{ cells: Array<Record<string, unknown>> }> };
    const cleaned = {
      ...config,
      pages: config.pages.map((p) => ({
        ...p,
        cells: p.cells.filter((c) => (c as { printer?: string }).printer !== device.shortCode),
      })),
    };
    await tx.cydLayout.update({ where: { userId }, data: { config: cleaned as Prisma.InputJsonValue } });
  });
}
