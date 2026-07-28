import { prisma } from "@/lib/db";
import { validateLayoutConfig } from "@3pb/cyd-layout-schema";
import type { LayoutConfigOut } from "@3pb/cyd-layout-schema";
import type { Prisma } from "@prisma/client";

/** Client Prisma yang cukup buat saveLayout — `prisma` global ATAU `tx` interactive transaction. */
type LayoutDbClient = Pick<Prisma.TransactionClient, "cydLayout" | "device">;

export class InvalidLayoutConfig extends Error {
  status = 400;
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidLayoutConfig";
  }
}

/** Default SaaS — grid kecil (2x2), sesuai skala customer 1-3 printer, BUKAN copy grid 10x8 rak internal dashboard. */
export function defaultSaasLayout(): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }],
  };
}

export async function getLayout(userId: string): Promise<LayoutConfigOut> {
  const row = await prisma.cydLayout.findUnique({ where: { userId } });
  if (!row) return defaultSaasLayout();
  return row.config as unknown as LayoutConfigOut;
}

/** null = belum ada layout tersimpan (dipakai Task 10 buat Agent, beda semantik dari getLayout di atas). */
export async function getLayoutOrNull(userId: string): Promise<LayoutConfigOut | null> {
  const row = await prisma.cydLayout.findUnique({ where: { userId } });
  return row ? (row.config as unknown as LayoutConfigOut) : null;
}

export async function saveLayout(
  userId: string,
  input: unknown,
  ownedShortCodes: string[],
  client: LayoutDbClient = prisma
): Promise<LayoutConfigOut> {
  const result = validateLayoutConfig(input);
  if (!result.valid) throw new InvalidLayoutConfig(result.error);

  const owned = new Set(ownedShortCodes);
  for (const page of result.config.pages) {
    for (const cell of page.cells) {
      if (!("type" in cell) && !owned.has(cell.printer)) {
        throw new InvalidLayoutConfig(`printer "${cell.printer}" bukan milik user ini`);
      }
    }
  }

  const config = result.config as unknown as Prisma.InputJsonValue;
  await client.cydLayout.upsert({
    where: { userId },
    create: { userId, config },
    update: { config },
  });
  return result.config;
}

/**
 * Cek-kepemilikan + upsert dalam SATU transaksi. Sebelumnya route memanggil `listDevices()` lalu
 * `saveLayout()` terpisah: di sela keduanya, `deleteDevice` paralel (tombol Hapus di DeviceList)
 * bisa menghapus device yang shortCode-nya masih direferensikan layout yang sedang disimpan —
 * hasilnya layout tersimpan menunjuk device yang sudah tak ada. Daftar device dibaca DI DALAM
 * transaksi supaya validasi & upsert melihat snapshot yang konsisten.
 */
export async function saveLayoutForUser(userId: string, input: unknown): Promise<LayoutConfigOut> {
  return prisma.$transaction(async (tx) => {
    const devices = await tx.device.findMany({ where: { userId }, select: { shortCode: true } });
    return saveLayout(
      userId,
      input,
      devices.map((d) => d.shortCode),
      tx
    );
  });
}
