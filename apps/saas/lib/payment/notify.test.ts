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
    await notifyActivated({ phone: "628111", email: null });
    expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("aktif"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("tanpa phone tapi ada email → Resend REST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await notifyActivated({ phone: null, email: "a@b.com" });
    expect(sendWA).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  });
  it("kegagalan notif tak dilempar (best-effort)", async () => {
    (sendWA as any).mockRejectedValue(new Error("down"));
    await expect(notifyActivated({ phone: "628111", email: null })).resolves.toBeUndefined();
  });
});
