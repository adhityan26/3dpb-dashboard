import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/wa/client", () => ({ sendWA: vi.fn() }));
import { sendWA } from "@/lib/wa/client";
import { notifyActivated } from "@/lib/payment/notify";

const ENV = { ...process.env };
beforeEach(() => { vi.clearAllMocks(); process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "Slizebiz <halo@slizebiz.com>"; });
afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });

describe("notifyActivated", () => {
  it("punya phone → sendWA (bukan email)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await notifyActivated({ phone: "628111", email: null }, { productType: "BELI", quantity: null });
    expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("aktif"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("tanpa phone tapi ada email → Resend REST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await notifyActivated({ phone: null, email: "a@b.com" }, { productType: "BELI", quantity: null });
    expect(sendWA).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.subject).toBe("Akun Slizebiz aktif");
  });
  it("tanpa phone, productType SLOT_PURCHASE → subject email sebut slot, bukan 'akun aktif'", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await notifyActivated({ phone: null, email: "a@b.com" }, { productType: "SLOT_PURCHASE", quantity: 4 });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.subject).toBe("Slot printer bertambah");
    expect(body.text).toContain("4 slot");
  });
  it("kegagalan notif tak dilempar (best-effort)", async () => {
    (sendWA as any).mockRejectedValue(new Error("down"));
    await expect(notifyActivated({ phone: "628111", email: null }, { productType: "BELI", quantity: null })).resolves.toBeUndefined();
  });
  it("productType SLOT_PURCHASE → pesan sebut jumlah slot, bukan 'akun aktif'", async () => {
    await notifyActivated({ phone: "628111", email: null }, { productType: "SLOT_PURCHASE", quantity: 4 });
    expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("4 slot"));
    expect(sendWA).toHaveBeenCalledWith("628111", expect.not.stringContaining("akun Slizebiz kamu sudah aktif"));
  });
});
