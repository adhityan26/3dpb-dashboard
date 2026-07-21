import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/owner", () => ({ isOwner: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({
  createOrReuseCheckout: vi.fn(), markPaid: vi.fn(), activate: vi.fn(), cancel: vi.fn(), deactivate: vi.fn(),
  findClaimablePayment: vi.fn(),
}));
vi.mock("@/lib/payment/notify", () => ({ notifyActivated: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/storage/r2", () => ({ putProof: vi.fn(), R2NotConfigured: class R2NotConfigured extends Error {} }));

import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import {
  createOrReuseCheckout,
  activate,
  markPaid as markPaidFn,
  findClaimablePayment as findClaimablePaymentFn,
} from "@/lib/payment/service";
import { notifyActivated } from "@/lib/payment/notify";
import { prisma } from "@/lib/db";
import { AlreadyOwned, QrisNotSet } from "@/lib/payment/errors";
import { putProof, R2NotConfigured } from "@/lib/storage/r2";
import { POST as checkoutPOST } from "@/app/api/beli/checkout/route";
import { PUT as activatePUT } from "@/app/api/admin/payment/[id]/activate/route";
import { POST as markPaidPOST } from "@/app/api/beli/[id]/mark-paid/route";

const req = (body?: unknown) => new Request("http://x", { method: "POST", body: body ? JSON.stringify(body) : undefined });
beforeEach(() => vi.clearAllMocks());

describe("checkout", () => {
  it("anon → 401", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await checkoutPOST(req())).status).toBe(401);
  });
  it("sukses → 200 payload", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockResolvedValue({ id: "p1", amount: 149347, qrPayload: "Q", displayPrice: 150000 });
    const res = await checkoutPOST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).amount).toBe(149347);
  });
  it("AlreadyOwned → 200 {owned:true}", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockRejectedValue(new AlreadyOwned());
    const res = await checkoutPOST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).owned).toBe(true);
  });
  it("QrisNotSet → 503", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockRejectedValue(new QrisNotSet());
    expect((await checkoutPOST(req())).status).toBe(503);
  });
});

describe("admin activate", () => {
  const ctx = { params: Promise.resolve({ id: "p1" }) };
  it("non-owner → 403", async () => {
    (auth as any).mockResolvedValue({ user: { email: "x@y.com" } });
    (isOwner as any).mockReturnValue(false);
    expect((await activatePUT(req(), ctx)).status).toBe(403);
  });
  it("owner → activate + notif + 200", async () => {
    (auth as any).mockResolvedValue({ user: { email: "owner@x.com" } });
    (isOwner as any).mockReturnValue(true);
    (activate as any).mockResolvedValue({ id: "p1", userId: "u1" });
    (prisma.user.findUnique as any).mockResolvedValue({ phone: "628111", email: null });
    const res = await activatePUT(req(), ctx);
    expect(res.status).toBe(200);
    expect(notifyActivated).toHaveBeenCalledWith({ phone: "628111", email: null });
  });
});

describe("1c-2 mark-paid wajib bukti", () => {
  const markPaidMock = markPaidFn as any;
  const putProofMock = putProof as any;
  const findClaimablePaymentMock = findClaimablePaymentFn as any;
  const fd = (file?: File) => { const f = new FormData(); if (file) f.append("bukti", file); return f; };
  const reqFormData = (f: FormData) => ({ formData: async () => f }) as unknown as Request;
  const ctx = { params: Promise.resolve({ id: "p1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    findClaimablePaymentMock.mockResolvedValue({ id: "p1", userId: "u1", status: "PENDING" });
  });

  it("tanpa file → 400 bukti_wajib, markPaid tak dipanggil", async () => {
    const res = await markPaidPOST(reqFormData(fd()), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bukti_wajib" });
    expect(markPaidMock).not.toHaveBeenCalled();
  });

  it("mime bukan gambar → 400", async () => {
    const res = await markPaidPOST(reqFormData(fd(new File(["x"], "a.txt", { type: "text/plain" }))), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "tipe_tidak_didukung" });
    expect(putProofMock).not.toHaveBeenCalled();
  });

  it("file > 5MB → 400 file_terlalu_besar, putProof tak dipanggil", async () => {
    const big = new File(["x"], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    const res = await markPaidPOST(reqFormData(fd(big)), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "file_terlalu_besar" });
    expect(putProofMock).not.toHaveBeenCalled();
  });

  it("sukses → putProof lalu markPaid", async () => {
    putProofMock.mockResolvedValueOnce(undefined);
    const res = await markPaidPOST(reqFormData(fd(new File(["x"], "a.jpg", { type: "image/jpeg" }))), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(putProofMock).toHaveBeenCalledWith("proofs/p1.jpg", expect.any(ArrayBuffer), "image/jpeg");
    expect(markPaidMock).toHaveBeenCalledWith("p1", "u1", { proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
  });

  it("R2 belum dikonfigurasi → 503 dan markPaid TAK dipanggil", async () => {
    putProofMock.mockRejectedValueOnce(new R2NotConfigured());
    const res = await markPaidPOST(reqFormData(fd(new File(["x"], "a.jpg", { type: "image/jpeg" }))), ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "upload_belum_aktif" });
    expect(markPaidMock).not.toHaveBeenCalled();
  });

  it("payment bukan milik user (pre-check gagal) → 404, putProof & markPaid TAK dipanggil", async () => {
    findClaimablePaymentMock.mockResolvedValue(null);
    const res = await markPaidPOST(reqFormData(fd(new File(["x"], "a.jpg", { type: "image/jpeg" }))), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(putProofMock).not.toHaveBeenCalled();
    expect(markPaidMock).not.toHaveBeenCalled();
  });

  it("id malformed (path traversal) → 404, putProof TAK dipanggil, pre-check tak dijalankan", async () => {
    const badCtx = { params: Promise.resolve({ id: "../../etc/passwd" }) };
    const res = await markPaidPOST(reqFormData(fd(new File(["x"], "a.jpg", { type: "image/jpeg" }))), badCtx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(putProofMock).not.toHaveBeenCalled();
    expect(findClaimablePaymentMock).not.toHaveBeenCalled();
  });

  it("id dengan slash → 404, putProof TAK dipanggil", async () => {
    const badCtx = { params: Promise.resolve({ id: "a/b" }) };
    const res = await markPaidPOST(reqFormData(fd(new File(["x"], "a.jpg", { type: "image/jpeg" }))), badCtx);
    expect(res.status).toBe(404);
    expect(putProofMock).not.toHaveBeenCalled();
  });
});
