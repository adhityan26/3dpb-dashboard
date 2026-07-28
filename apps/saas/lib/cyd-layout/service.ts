import { prisma } from "@/lib/db";
import { validateLayoutConfig } from "@3pb/cyd-layout-schema";
import type { LayoutConfigOut } from "@3pb/cyd-layout-schema";
import type { Prisma } from "@prisma/client";

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

export async function saveLayout(userId: string, input: unknown, ownedShortCodes: string[]): Promise<LayoutConfigOut> {
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
  await prisma.cydLayout.upsert({
    where: { userId },
    create: { userId, config },
    update: { config },
  });
  return result.config;
}
