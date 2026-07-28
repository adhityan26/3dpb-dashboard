import crypto from "crypto";
import { prisma } from "@/lib/db";
import { generateUniqueShortCode } from "@/lib/id/short-code";
import { getConfigInt } from "@/lib/config";
import { SlotLimitExceeded, InvalidPrinterType, DeviceNotFound } from "./errors";
import { PRINTER_TYPES, type PrinterType } from "./printer-types";
import type { Device, Prisma } from "@prisma/client";

// Definisinya pindah ke ./printer-types (bebas Prisma) supaya bisa dipakai komponen client juga;
// di-re-export di sini agar import lama dari "@/lib/devices/service" tak perlu diubah.
export { PRINTER_TYPES };
export type { PrinterType };

function assertValidPrinterType(value: string): asserts value is PrinterType {
  if (!(PRINTER_TYPES as readonly string[]).includes(value)) {
    throw new InvalidPrinterType(value);
  }
}

export async function listDevices(userId: string): Promise<Device[]> {
  return prisma.device.findMany({ where: { userId } });
}

/**
 * Batas slot printer efektif user — SATU sumber kebenaran, dipakai GET /api/devices (buat tampilan
 * "X/Y slot terpakai") supaya rumusnya tak diduplikasi dari createDevice. TIDAK dipakai createDevice
 * itu sendiri: di sana pembacaan Entitlement harus terjadi di dalam transaksi & di belakang row-lock
 * (lihat komentar panjang di bawah), bukan lewat koneksi terpisah seperti helper read-only ini.
 */
export async function getDeviceLimit(userId: string): Promise<number> {
  const entitlement = await prisma.entitlement.findUnique({ where: { userId } });
  return entitlement?.printerSlots ?? (await getConfigInt("printer.defaultSlots", 1));
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
 * - `generateUniqueShortCode(tx)` — alasan SAMA dengan poin getConfigInt di atas, tapi solusinya
 *   beda karena query-nya memang harus lihat data terkini: query cek-collision-nya dijalankan di
 *   `tx` (koneksi yang SAMA), bukan lewat client global. Kalau pakai client global, tiap transaksi
 *   yang sedang memegang row-lock ikut men-checkout koneksi kedua dari pool → di bawah konkurensi
 *   semua transaksi in-flight saling menunggu slot pool yang dipegang transaksi yang juga menunggu.
 * - RESIDUAL RISK (diterima sadar, bukan kelewat): kalau `tx.device.create` di bawah tetap kena
 *   P2002 pada `shortCode` (ada transaksi lain commit shortCode yang sama persis di sela pre-check
 *   dan INSERT), transaksinya abort total (gejala 25P02 seperti PERCOBAAN 2 di atas) dan request
 *   balas 500 — TIDAK di-retry. Sengaja: keyspace 36^10 ≈ 3.6e15 dengan pre-check di transaksi yang
 *   sama membuat peluangnya praktis nol, sedangkan retry harus mengulang SELURUH transaksi
 *   (termasuk ambil ulang row-lock) sehingga menambah jalur konkurensi baru yang justru lebih
 *   berisiko daripada masalah yang ditutupnya.
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

    const shortCode = await generateUniqueShortCode(tx);
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
