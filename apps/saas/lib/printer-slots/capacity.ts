import { prisma } from "@/lib/db";
import { getConfigInt } from "@/lib/config";
import type { Device, Prisma } from "@prisma/client";

/** Client Prisma yang cukup buat fungsi di file ini -- `prisma` global ATAU `tx` interactive transaction. */
type SlotGrantDbClient = Pick<Prisma.TransactionClient, "slotGrant" | "device">;

/**
 * Discriminated union, bukan shape optional-semua: kalau `client` dikasih (dipanggil di dalam
 * transaksi/row-lock), `baseline` WAJIB ikut dipassing juga -- lihat createDevice di
 * lib/devices/service.ts. Query Config lewat client `prisma` global di dalam window row-lock
 * berisiko starvation connection-pool, alasan yang sama persis kenapa getConfigInt di sana
 * dipanggil SEBELUM $transaction dibuka. Union ini menjadikannya compile error kalau caller masa
 * depan mem-passing `client` tanpa `baseline`.
 */
type CapacityOpts =
  | { client?: undefined; baseline?: number }
  | { client: SlotGrantDbClient; baseline: number };

async function resolveBaseline(opts: CapacityOpts): Promise<number> {
  if (opts.baseline !== undefined) return opts.baseline;
  return getConfigInt("printer.defaultSlots", 1);
}

export async function getCapacity(userId: string, opts: CapacityOpts = {}): Promise<number> {
  const client = opts.client ?? prisma;
  const now = new Date();
  const baseline = await resolveBaseline(opts);
  const grants = await client.slotGrant.findMany({
    where: {
      userId,
      active: true,
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }],
    },
  });
  return baseline + grants.reduce((sum, g) => sum + g.quantity, 0);
}

export async function getEligibleDevices(userId: string, opts: CapacityOpts = {}): Promise<Device[]> {
  const client = opts.client ?? prisma;
  const capacity = await getCapacity(userId, opts);
  const devices = await client.device.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return devices.slice(0, Math.max(0, capacity));
}

export async function getEligibleShortCodes(userId: string, opts: CapacityOpts = {}): Promise<Set<string>> {
  const client = opts.client ?? prisma;
  const capacity = await getCapacity(userId, opts);
  const devices = await client.device.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { shortCode: true },
  });
  return new Set(devices.slice(0, Math.max(0, capacity)).map((d) => d.shortCode));
}
