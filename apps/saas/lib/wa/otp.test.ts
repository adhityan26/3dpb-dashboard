import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { waOtp: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn(), update: vi.fn() } },
}));
import { prisma } from "@/lib/db";
import { issueOtp, verifyOtp, canSend } from "@/lib/wa/otp";
import crypto from "crypto";

const hash = (phone: string, code: string) => crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
const NOW = new Date("2026-07-18T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("issueOtp", () => {
  it("upsert kode 6 digit + hash + sentCount 1 saat baris baru", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue(null);
    const { code } = await issueOtp("628111", NOW);
    expect(code).toMatch(/^\d{6}$/);
    const arg = (prisma.waOtp.upsert as any).mock.calls[0][0];
    expect(arg.where).toEqual({ phone: "628111" });
    expect(arg.create.codeHash).toBe(hash("628111", code));
    expect(arg.create.sentCount).toBe(1);
  });
  it("issueOtp dalam window — sentCount++, windowStart preserved", async () => {
    const existingWindowStart = new Date(NOW.getTime() - 10 * 60_000); // 10 min ago
    (prisma.waOtp.findUnique as any).mockResolvedValue({
      phone: "628111",
      windowStart: existingWindowStart,
      sentCount: 2,
    });
    await issueOtp("628111", NOW);
    const arg = (prisma.waOtp.upsert as any).mock.calls[0][0];
    expect(arg.update.sentCount).toBe(3);
    expect(arg.update.windowStart).toBe(existingWindowStart);
  });
  it("issueOtp past window — sentCount reset ke 1, windowStart = now", async () => {
    const oldWindowStart = new Date(NOW.getTime() - 2 * 60 * 60_000); // 2 hours ago
    (prisma.waOtp.findUnique as any).mockResolvedValue({
      phone: "628111",
      windowStart: oldWindowStart,
      sentCount: 5,
    });
    await issueOtp("628111", NOW);
    const arg = (prisma.waOtp.upsert as any).mock.calls[0][0];
    expect(arg.update.sentCount).toBe(1);
    expect(arg.update.windowStart).toBe(NOW);
  });
});

describe("verifyOtp", () => {
  it("kode cocok → ok + hapus row", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: hash("628111", "123456"), expires: new Date(NOW.getTime() + 60000), attempts: 0 });
    expect(await verifyOtp("628111", "123456", NOW)).toBe("ok");
    expect(prisma.waOtp.delete).toHaveBeenCalledWith({ where: { phone: "628111" } });
  });
  it("kode salah → invalid + attempts++", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: hash("628111", "123456"), expires: new Date(NOW.getTime() + 60000), attempts: 1 });
    expect(await verifyOtp("628111", "000000", NOW)).toBe("invalid");
    expect(prisma.waOtp.update).toHaveBeenCalledWith({ where: { phone: "628111" }, data: { attempts: 2 } });
  });
  it("expired", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: "x", expires: new Date(NOW.getTime() - 1), attempts: 0 });
    expect(await verifyOtp("628111", "123456", NOW)).toBe("expired");
  });
  it("tak ada row → expired", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue(null);
    expect(await verifyOtp("628111", "123456", NOW)).toBe("expired");
  });
  it(">=5 attempts → locked", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: "x", expires: new Date(NOW.getTime() + 60000), attempts: 5 });
    expect(await verifyOtp("628111", "123456", NOW)).toBe("locked");
  });
});

describe("canSend", () => {
  it("tak ada row → boleh", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue(null);
    expect(await canSend("628111", NOW)).toEqual({ ok: true });
  });
  it("dalam cooldown 60s → tolak + waitSec", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ lastSentAt: new Date(NOW.getTime() - 30000), sentCount: 1, windowStart: NOW });
    const r = await canSend("628111", NOW);
    expect(r.ok).toBe(false); expect(r.waitSec).toBe(30);
  });
  it("kuota 5/jam habis → tolak", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ lastSentAt: new Date(NOW.getTime() - 120000), sentCount: 5, windowStart: new Date(NOW.getTime() - 600000) });
    expect((await canSend("628111", NOW)).ok).toBe(false);
  });
  it("cooldown lewat & kuota belum habis → boleh", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ lastSentAt: new Date(NOW.getTime() - 120000), sentCount: 2, windowStart: new Date(NOW.getTime() - 600000) });
    expect((await canSend("628111", NOW)).ok).toBe(true);
  });
  it("canSend stale window (>1h) + cooldown lewat — boleh meski sentCount=5", async () => {
    const staleWindowStart = new Date(NOW.getTime() - 2 * 60 * 60_000); // 2 hours ago
    const lastSentAt = new Date(NOW.getTime() - 120_000); // 2 min ago (past 60s cooldown)
    (prisma.waOtp.findUnique as any).mockResolvedValue({
      phone: "628111",
      windowStart: staleWindowStart,
      sentCount: 5,
      lastSentAt,
    });
    expect((await canSend("628111", NOW)).ok).toBe(true);
  });
});
