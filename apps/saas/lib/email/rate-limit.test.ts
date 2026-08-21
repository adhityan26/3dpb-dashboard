import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { magicLinkRequest: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
import { prisma } from "@/lib/db";
import { canSendMagicLink, recordMagicLinkSent } from "@/lib/email/rate-limit";

const NOW = new Date("2026-07-18T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("canSendMagicLink", () => {
  it("belum pernah kirim (row null) -> ok:true", async () => {
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue(null);
    expect(await canSendMagicLink("a@b.com", NOW)).toEqual({ ok: true });
  });

  it("dalam cooldown 60 detik -> ok:false + waitSec", async () => {
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue({
      email: "a@b.com",
      lastSentAt: new Date(NOW.getTime() - 30_000),
      sentCount: 1,
      windowStart: NOW,
    });
    const result = await canSendMagicLink("a@b.com", NOW);
    expect(result.ok).toBe(false);
    expect(result.waitSec).toBe(30);
  });

  it("cooldown sudah lewat, di bawah cap 5/jam -> ok:true", async () => {
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue({
      email: "a@b.com",
      lastSentAt: new Date(NOW.getTime() - 61_000),
      sentCount: 3,
      windowStart: new Date(NOW.getTime() - 30 * 60_000),
    });
    expect(await canSendMagicLink("a@b.com", NOW)).toEqual({ ok: true });
  });

  it("cooldown lewat TAPI sudah 5x dalam jam berjalan -> ok:false + waitSec sampai window abis", async () => {
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue({
      email: "a@b.com",
      lastSentAt: new Date(NOW.getTime() - 61_000),
      sentCount: 5,
      windowStart: new Date(NOW.getTime() - 30 * 60_000),
    });
    const result = await canSendMagicLink("a@b.com", NOW);
    expect(result.ok).toBe(false);
    expect(result.waitSec).toBe(30 * 60);
  });

  it("window lama sudah lewat 1 jam -> cap direset, ok:true meski sentCount lama >= 5", async () => {
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue({
      email: "a@b.com",
      lastSentAt: new Date(NOW.getTime() - 2 * 60 * 60_000),
      sentCount: 5,
      windowStart: new Date(NOW.getTime() - 2 * 60 * 60_000),
    });
    expect(await canSendMagicLink("a@b.com", NOW)).toEqual({ ok: true });
  });
});

describe("recordMagicLinkSent", () => {
  it("belum pernah kirim -> upsert create dengan sentCount 1, windowStart = now", async () => {
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue(null);
    await recordMagicLinkSent("a@b.com", NOW);
    const arg = (prisma.magicLinkRequest.upsert as any).mock.calls[0][0];
    expect(arg.where).toEqual({ email: "a@b.com" });
    expect(arg.create).toEqual({ email: "a@b.com", lastSentAt: NOW, sentCount: 1, windowStart: NOW });
  });

  it("dalam window yang sama -> sentCount++, windowStart dipertahankan", async () => {
    const existingWindowStart = new Date(NOW.getTime() - 10 * 60_000);
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue({
      email: "a@b.com",
      windowStart: existingWindowStart,
      sentCount: 2,
    });
    await recordMagicLinkSent("a@b.com", NOW);
    const arg = (prisma.magicLinkRequest.upsert as any).mock.calls[0][0];
    expect(arg.update.sentCount).toBe(3);
    expect(arg.update.windowStart).toBe(existingWindowStart);
  });

  it("window lama sudah lewat 1 jam -> sentCount reset ke 1, windowStart = now", async () => {
    const oldWindowStart = new Date(NOW.getTime() - 2 * 60 * 60_000);
    (prisma.magicLinkRequest.findUnique as any).mockResolvedValue({
      email: "a@b.com",
      windowStart: oldWindowStart,
      sentCount: 5,
    });
    await recordMagicLinkSent("a@b.com", NOW);
    const arg = (prisma.magicLinkRequest.upsert as any).mock.calls[0][0];
    expect(arg.update.sentCount).toBe(1);
    expect(arg.update.windowStart).toBe(NOW);
  });
});
