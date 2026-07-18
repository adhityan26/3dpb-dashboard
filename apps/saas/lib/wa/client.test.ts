import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWA, waEnabled } from "@/lib/wa/client";

const ENV = { ...process.env };
beforeEach(() => {
  process.env.WA_OMNI_URL = "http://wa.local:3020";
  process.env.WA_OMNI_TOKEN = "tok";
  process.env.WA_OMNI_ACCOUNT_ID = "1";
});
afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });

describe("waEnabled", () => {
  it("true saat env lengkap", () => { expect(waEnabled()).toBe(true); });
  it("false saat token absen", () => { delete process.env.WA_OMNI_TOKEN; expect(waEnabled()).toBe(false); });
});

describe("sendWA", () => {
  it("POST /api/send dengan body & Bearer benar", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await sendWA("628123456789", "halo");
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://wa.local:3020/api/send");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(opts.body as string)).toEqual({ phone: "628123456789", body: "halo", account_id: 1 });
  });
  it("env absen → throw", async () => {
    delete process.env.WA_OMNI_URL;
    await expect(sendWA("628123456789", "x")).rejects.toThrow();
  });
  it("non-2xx → throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(sendWA("628123456789", "x")).rejects.toThrow(/500/);
  });
});
