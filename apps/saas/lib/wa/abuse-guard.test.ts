import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    waOtpIpLimit: { findUnique: vi.fn(), upsert: vi.fn() },
    waOtpGlobalLimit: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
import { prisma } from "@/lib/db";
import { canSendFromIp, recordIpSent, canSendGlobal, recordGlobalSent, getClientIp } from "@/lib/wa/abuse-guard";

const NOW = new Date("2026-07-18T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("canSendFromIp", () => {
  it("IP belum pernah kirim (row null) -> ok:true", async () => {
    (prisma.waOtpIpLimit.findUnique as any).mockResolvedValue(null);
    expect(await canSendFromIp("1.2.3.4", NOW)).toEqual({ ok: true });
  });

  it("di bawah cap 20/jam -> ok:true", async () => {
    (prisma.waOtpIpLimit.findUnique as any).mockResolvedValue({
      ip: "1.2.3.4", sentCount: 10, windowStart: new Date(NOW.getTime() - 30 * 60_000),
    });
    expect(await canSendFromIp("1.2.3.4", NOW)).toEqual({ ok: true });
  });

  it("sudah 20x dalam jam berjalan -> ok:false + waitSec sampai window abis", async () => {
    (prisma.waOtpIpLimit.findUnique as any).mockResolvedValue({
      ip: "1.2.3.4", sentCount: 20, windowStart: new Date(NOW.getTime() - 30 * 60_000),
    });
    const result = await canSendFromIp("1.2.3.4", NOW);
    expect(result.ok).toBe(false);
    expect(result.waitSec).toBe(30 * 60);
  });

  it("window lama sudah lewat 1 jam -> cap direset, ok:true meski sentCount lama >= 20", async () => {
    (prisma.waOtpIpLimit.findUnique as any).mockResolvedValue({
      ip: "1.2.3.4", sentCount: 20, windowStart: new Date(NOW.getTime() - 2 * 60 * 60_000),
    });
    expect(await canSendFromIp("1.2.3.4", NOW)).toEqual({ ok: true });
  });
});

describe("recordIpSent", () => {
  it("belum pernah kirim -> upsert create sentCount 1", async () => {
    (prisma.waOtpIpLimit.findUnique as any).mockResolvedValue(null);
    await recordIpSent("1.2.3.4", NOW);
    const arg = (prisma.waOtpIpLimit.upsert as any).mock.calls[0][0];
    expect(arg.where).toEqual({ ip: "1.2.3.4" });
    expect(arg.create).toEqual({ ip: "1.2.3.4", sentCount: 1, windowStart: NOW });
  });

  it("dalam window yang sama -> sentCount++, windowStart dipertahankan", async () => {
    const existingWindowStart = new Date(NOW.getTime() - 10 * 60_000);
    (prisma.waOtpIpLimit.findUnique as any).mockResolvedValue({ ip: "1.2.3.4", sentCount: 4, windowStart: existingWindowStart });
    await recordIpSent("1.2.3.4", NOW);
    const arg = (prisma.waOtpIpLimit.upsert as any).mock.calls[0][0];
    expect(arg.update.sentCount).toBe(5);
    expect(arg.update.windowStart).toBe(existingWindowStart);
  });
});

describe("canSendGlobal", () => {
  it("belum ada row -> ok:true", async () => {
    (prisma.waOtpGlobalLimit.findUnique as any).mockResolvedValue(null);
    expect(await canSendGlobal(NOW)).toEqual({ ok: true });
  });

  it("di bawah cap 100/jam -> ok:true", async () => {
    (prisma.waOtpGlobalLimit.findUnique as any).mockResolvedValue({ id: "global", sentCount: 50, windowStart: new Date(NOW.getTime() - 20 * 60_000) });
    expect(await canSendGlobal(NOW)).toEqual({ ok: true });
  });

  it("sudah 100x dalam jam berjalan -> ok:false, sirkuit terputus", async () => {
    (prisma.waOtpGlobalLimit.findUnique as any).mockResolvedValue({ id: "global", sentCount: 100, windowStart: new Date(NOW.getTime() - 20 * 60_000) });
    const result = await canSendGlobal(NOW);
    expect(result.ok).toBe(false);
  });
});

describe("recordGlobalSent", () => {
  it("selalu pakai id tetap 'global', pola window/sentCount sama seperti IP limiter", async () => {
    (prisma.waOtpGlobalLimit.findUnique as any).mockResolvedValue(null);
    await recordGlobalSent(NOW);
    const arg = (prisma.waOtpGlobalLimit.upsert as any).mock.calls[0][0];
    expect(arg.where).toEqual({ id: "global" });
    expect(arg.create).toEqual({ id: "global", sentCount: 1, windowStart: NOW });
  });
});

describe("getClientIp", () => {
  it("baca IP pertama dari header x-forwarded-for (client asli, bukan proxy)", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("header tunggal tanpa koma -> dipakai apa adanya", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.5" } });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("header absen (dev/test tanpa proxy) -> fallback 'unknown', bukan throw", () => {
    const req = new Request("http://x");
    expect(getClientIp(req)).toBe("unknown");
  });
});
