import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    slotGrant: { findMany: vi.fn(), count: vi.fn() },
    device: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/config", () => ({ getConfigInt: vi.fn() }));

import { prisma } from "@/lib/db";
import { getConfigInt } from "@/lib/config";
import { getCapacity, getEligibleDevices, getEligibleShortCodes, hasActiveSlotGrant } from "./capacity";

const mockPrisma = prisma as unknown as {
  slotGrant: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  device: { findMany: ReturnType<typeof vi.fn> };
};
const mockGetConfigInt = getConfigInt as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfigInt.mockResolvedValue(1);
});

describe("getCapacity", () => {
  it("returns just the baseline when no grants exist", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    await expect(getCapacity("u1")).resolves.toBe(1);
  });

  it("sums multiple active grants on top of the baseline", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([{ quantity: 10 }, { quantity: 2 }]);
    await expect(getCapacity("u1")).resolves.toBe(13);
  });

  it("uses a passed-in baseline instead of querying Config", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([{ quantity: 5 }]);
    await expect(getCapacity("u1", { baseline: 1 })).resolves.toBe(6);
    expect(mockGetConfigInt).not.toHaveBeenCalled();
  });

  it("excludes expired grants from the query window (validUntil in the past)", async () => {
    // The Prisma where-clause itself does this filtering; this test verifies
    // getCapacity passes a validUntil filter referencing "now" to findMany.
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    await getCapacity("u1");
    const where = mockPrisma.slotGrant.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.OR).toEqual(
      expect.arrayContaining([{ validUntil: null }, expect.objectContaining({ validUntil: expect.any(Object) })])
    );
  });

  it("excludes future-dated grants from the query window (validFrom not yet started)", async () => {
    // The Prisma where-clause itself does this filtering; this test verifies
    // getCapacity passes a validFrom filter referencing "now" to findMany.
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    await getCapacity("u1");
    const where = mockPrisma.slotGrant.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([{ validFrom: null }, expect.objectContaining({ validFrom: expect.any(Object) })])
        })
      ])
    );
  });
});

describe("hasActiveSlotGrant", () => {
  it("returns true when prisma.slotGrant.count resolves to a number > 0", async () => {
    mockPrisma.slotGrant.count.mockResolvedValue(2);
    await expect(hasActiveSlotGrant("u1")).resolves.toBe(true);
  });

  it("returns false when prisma.slotGrant.count resolves to 0", async () => {
    mockPrisma.slotGrant.count.mockResolvedValue(0);
    await expect(hasActiveSlotGrant("u1")).resolves.toBe(false);
  });

  it("passes the same active + validity-window where clause shape as getCapacity", async () => {
    mockPrisma.slotGrant.count.mockResolvedValue(0);
    await hasActiveSlotGrant("u1");
    const where = mockPrisma.slotGrant.count.mock.calls[0][0].where;
    expect(where.userId).toBe("u1");
    expect(where.active).toBe(true);
    expect(where.OR).toEqual(
      expect.arrayContaining([{ validUntil: null }, expect.objectContaining({ validUntil: expect.any(Object) })])
    );
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([{ validFrom: null }, expect.objectContaining({ validFrom: expect.any(Object) })])
        })
      ])
    );
  });
});

describe("getEligibleDevices", () => {
  const devices = [
    { id: "d1", createdAt: new Date("2026-01-01") },
    { id: "d2", createdAt: new Date("2026-02-01") },
    { id: "d3", createdAt: new Date("2026-03-01") },
  ];

  it("returns all devices when under capacity", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([{ quantity: 5 }]);
    mockPrisma.device.findMany.mockResolvedValue(devices);
    const result = await getEligibleDevices("u1");
    expect(result.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
  });

  it("keeps only the oldest N devices when over capacity (FIFO)", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]); // capacity = baseline = 1
    mockPrisma.device.findMany.mockResolvedValue(devices);
    const result = await getEligibleDevices("u1");
    expect(result.map((d) => d.id)).toEqual(["d1"]);
  });

  it("orders the device query oldest-first", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    mockPrisma.device.findMany.mockResolvedValue([]);
    await getEligibleDevices("u1");
    expect(mockPrisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } })
    );
  });
});

describe("getEligibleShortCodes", () => {
  const devices = [
    { shortCode: "sc1", createdAt: new Date("2026-01-01") },
    { shortCode: "sc2", createdAt: new Date("2026-02-01") },
    { shortCode: "sc3", createdAt: new Date("2026-03-01") },
  ];

  it("returns all shortCodes when under capacity", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([{ quantity: 5 }]);
    mockPrisma.device.findMany.mockResolvedValue(devices);
    const result = await getEligibleShortCodes("u1");
    expect(result).toEqual(new Set(["sc1", "sc2", "sc3"]));
  });

  it("keeps only the oldest N devices' shortCodes when over capacity (FIFO)", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]); // capacity = baseline = 1
    mockPrisma.device.findMany.mockResolvedValue(devices);
    const result = await getEligibleShortCodes("u1");
    expect(result).toEqual(new Set(["sc1"]));
  });

  it("orders the device query oldest-first", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    mockPrisma.device.findMany.mockResolvedValue([]);
    await getEligibleShortCodes("u1");
    expect(mockPrisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" }, select: { shortCode: true } })
    );
  });
});
