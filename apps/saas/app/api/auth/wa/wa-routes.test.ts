import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wa/client", () => ({ waEnabled: vi.fn(() => true), sendWA: vi.fn() }));
vi.mock("@/lib/wa/otp", () => ({ canSend: vi.fn(), issueOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/wa/session", () => ({ upsertUserByPhone: vi.fn(), createUserSession: vi.fn() }));
vi.mock("@/lib/wa/abuse-guard", () => ({
  canSendFromIp: vi.fn(),
  recordIpSent: vi.fn(),
  canSendGlobal: vi.fn(),
  recordGlobalSent: vi.fn(),
  getClientIp: vi.fn(() => "203.0.113.5"),
}));

import { waEnabled, sendWA } from "@/lib/wa/client";
import { canSend, issueOtp, verifyOtp } from "@/lib/wa/otp";
import { upsertUserByPhone, createUserSession } from "@/lib/wa/session";
import { canSendFromIp, recordIpSent, canSendGlobal, recordGlobalSent, getClientIp } from "@/lib/wa/abuse-guard";
import { POST as startPOST } from "@/app/api/auth/wa/start/route";
import { POST as verifyPOST } from "@/app/api/auth/wa/verify/route";

const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  (waEnabled as any).mockReturnValue(true);
  (canSendFromIp as any).mockResolvedValue({ ok: true });
  (canSendGlobal as any).mockResolvedValue({ ok: true });
});

describe("wa/start", () => {
  it("env absen → 503 wa_disabled", async () => {
    (waEnabled as any).mockReturnValue(false);
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(503);
  });
  it("nomor invalid → 400", async () => {
    const res = await startPOST(req({ input: "abc" }));
    expect(res.status).toBe(400);
  });
  it("rate-limited (per-nomor) → 429 + waitSec", async () => {
    (canSend as any).mockResolvedValue({ ok: false, waitSec: 42 });
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(429);
    expect((await res.json()).waitSec).toBe(42);
  });
  it("rate-limited (per-IP) → 429, TIDAK sampai cek nomor/canSend sama sekali", async () => {
    (canSendFromIp as any).mockResolvedValue({ ok: false, waitSec: 900 });
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(429);
    expect((await res.json()).waitSec).toBe(900);
    expect(canSend).not.toHaveBeenCalled();
  });
  it("rate-limited (global, circuit-breaker) → 429, TIDAK sampai cek IP/nomor sama sekali", async () => {
    (canSendGlobal as any).mockResolvedValue({ ok: false });
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(429);
    expect(canSendFromIp).not.toHaveBeenCalled();
    expect(canSend).not.toHaveBeenCalled();
  });
  it("sukses → kirim WA + 200, catat IP+global sent SEBELUM kirim (bukan cuma saat sukses kirim)", async () => {
    (canSend as any).mockResolvedValue({ ok: true });
    (issueOtp as any).mockResolvedValue({ code: "123456" });
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(200);
    expect(sendWA).toHaveBeenCalledWith("628123456789", expect.stringContaining("123456"));
    expect(getClientIp).toHaveBeenCalled();
    expect(recordIpSent).toHaveBeenCalledWith("203.0.113.5");
    expect(recordGlobalSent).toHaveBeenCalled();
  });
  it("WA gagal → 502", async () => {
    (canSend as any).mockResolvedValue({ ok: true });
    (issueOtp as any).mockResolvedValue({ code: "123456" });
    (sendWA as any).mockRejectedValue(new Error("down"));
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(502);
  });
});

describe("wa/verify", () => {
  it("kode salah → 401", async () => {
    (verifyOtp as any).mockResolvedValue("invalid");
    const res = await verifyPOST(req({ input: "08123456789", code: "000000" }));
    expect(res.status).toBe(401);
  });
  it("sukses → buat sesi + 200", async () => {
    (verifyOtp as any).mockResolvedValue("ok");
    (upsertUserByPhone as any).mockResolvedValue({ id: "u1" });
    const res = await verifyPOST(req({ input: "08123456789", code: "123456" }));
    expect(res.status).toBe(200);
    expect(createUserSession).toHaveBeenCalledWith("u1");
  });
  it("format code salah → 400", async () => {
    const res = await verifyPOST(req({ input: "08123456789", code: "12" }));
    expect(res.status).toBe(400);
  });
});
