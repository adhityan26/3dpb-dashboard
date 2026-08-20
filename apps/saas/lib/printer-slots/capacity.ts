import { prisma } from "@/lib/db";
import { getConfigInt } from "@/lib/config";
import type { Device, Prisma } from "@prisma/client";

/** Client Prisma yang cukup buat fungsi di file ini -- `prisma` global ATAU `tx` interactive transaction. */
type SlotGrantDbClient = Pick<Prisma.TransactionClient, "slotGrant" | "device">;

interface CapacityOpts {
  client?: SlotGrantDbClient;
  /**
   * Kalau dikasih, dipakai apa adanya TANPA query Config lagi -- WAJIB dipassing oleh caller
   * yang manggil ini di dalam transaksi/row-lock (lihat createDevice di lib/devices/service.ts):
   * query Config lewat client `prisma` global di dalam window row-lock berisiko starvation
   * connection-pool, alasan yang sama persis kenapa getConfigInt di sana dipanggil SEBELUM
   * $transaction dibuka.
   */
  baseline?: number;
}

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
  return devices.slice(0, capacity);
}
