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
 */
export async function createDevice(
  userId: string,
  input: { label: string; printerType: string }
): Promise<Device> {
  assertValidPrinterType(input.printerType);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Entitlement" WHERE "userId" = ${userId} FOR UPDATE`;
    const entitlement = await tx.entitlement.findUnique({ where: { userId } });
    const limit = entitlement?.printerSlots ?? (await getConfigInt("printer.defaultSlots", 1));
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
