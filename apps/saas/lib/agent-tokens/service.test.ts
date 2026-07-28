import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    agentToken: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { generateToken, listTokens, revokeToken, resolveToken } from "./service";

beforeEach(() => vi.clearAllMocks());

describe("generateToken", () => {
  it("hasilnya diawali slz_, dan tokenHash yang disimpan BUKAN token mentah", async () => {
    (prisma.agentToken.create as any).mockImplementation(({ data }: any) => Promise.resolve({ id: "t1", ...data }));
    const { rawToken } = await generateToken("u1");
    expect(rawToken.startsWith("slz_")).toBe(true);
    const createCall = (prisma.agentToken.create as any).mock.calls[0][0];
    expect(createCall.data.tokenHash).not.toBe(rawToken);
    expect(createCall.data.tokenHash).toHaveLength(64); // hex SHA-256
  });
});

describe("listTokens", () => {
  it("tak pernah balikin tokenHash (cuma metadata)", async () => {
    (prisma.agentToken.findMany as any).mockResolvedValue([{ id: "t1", tokenHash: "secret", createdAt: new Date(), revokedAt: null, lastUsedAt: null }]);
    const list = await listTokens("u1");
    expect(list[0]).not.toHaveProperty("tokenHash");
  });
});

describe("revokeToken", () => {
  it("set revokedAt, bukan hard-delete", async () => {
    await revokeToken("u1", "t1");
    expect(prisma.agentToken.update).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("resolveToken", () => {
  it("null kalau token tak ketemu", async () => {
    (prisma.agentToken.findUnique as any).mockResolvedValue(null);
    expect(await resolveToken("slz_invalid")).toBeNull();
  });

  it("null kalau token sudah revoked", async () => {
    (prisma.agentToken.findUnique as any).mockResolvedValue({ userId: "u1", revokedAt: new Date() });
    expect(await resolveToken("slz_valid")).toBeNull();
  });

  it("balikin userId + update lastUsedAt kalau valid", async () => {
    (prisma.agentToken.findUnique as any).mockResolvedValue({ id: "t1", userId: "u1", revokedAt: null });
    const result = await resolveToken("slz_valid");
    expect(result).toEqual({ userId: "u1" });
    expect(prisma.agentToken.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { lastUsedAt: expect.any(Date) } });
  });
});
