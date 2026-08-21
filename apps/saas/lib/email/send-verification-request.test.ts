import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./rate-limit", () => ({
  canSendMagicLink: vi.fn(),
  recordMagicLinkSent: vi.fn(),
}));
import { canSendMagicLink, recordMagicLinkSent } from "./rate-limit";
import { sendVerificationRequest } from "./send-verification-request";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).fetch = fetchMock;
});

const baseParams = {
  identifier: "user@example.com",
  url: "https://slizebiz.com/api/auth/callback/resend?token=abc",
  expires: new Date("2026-07-19T10:00:00Z"),
  provider: { id: "resend", type: "email" as const, name: "Resend", apiKey: "re_test", from: "no-reply@slizebiz.com", sendVerificationRequest: vi.fn() },
  token: "abc",
  theme: {},
  request: new Request("https://slizebiz.com"),
};

describe("sendVerificationRequest", () => {
  it("rate limit ok -> record send lalu POST ke Resend API dengan apiKey/from dari provider", async () => {
    (canSendMagicLink as any).mockResolvedValue({ ok: true });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await sendVerificationRequest(baseParams as any);

    expect(canSendMagicLink).toHaveBeenCalledWith("user@example.com");
    expect(recordMagicLinkSent).toHaveBeenCalledWith("user@example.com");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toBe("no-reply@slizebiz.com");
    expect(body.to).toBe("user@example.com");
    expect(body.html).toContain(baseParams.url);
  });

  it("kena rate limit -> throw, TIDAK panggil recordMagicLinkSent atau fetch", async () => {
    (canSendMagicLink as any).mockResolvedValue({ ok: false, waitSec: 45 });

    await expect(sendVerificationRequest(baseParams as any)).rejects.toThrow();

    expect(recordMagicLinkSent).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Resend API balikin error -> throw (record sudah terlanjur jalan, konsisten dengan WA OTP: issue lalu kirim, gagal kirim tetap tercatat sebagai percobaan)", async () => {
    (canSendMagicLink as any).mockResolvedValue({ ok: true });
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "invalid from" }) });

    await expect(sendVerificationRequest(baseParams as any)).rejects.toThrow();
    expect(recordMagicLinkSent).toHaveBeenCalled();
  });
});
