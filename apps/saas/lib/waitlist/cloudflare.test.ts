import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWaitlist, toCSV, type WaitlistRow } from "@/lib/waitlist/cloudflare";

const rows: WaitlistRow[] = [
  { id: "1", email: "a@x.com", interest: "beli", created_at: "2026-07-18T00:00:00Z" },
  { id: "2", email: "b@x.com", interest: "subscribe", created_at: "2026-07-18T01:00:00Z" },
];

describe("toCSV", () => {
  it("header + baris", () => {
    const csv = toCSV(rows);
    expect(csv.split("\n")[0]).toBe("id,email,interest,created_at");
    expect(csv).toContain("a@x.com");
  });
  it("escape koma/kutip di field", () => {
    const csv = toCSV([{ id: "1", email: 'x,"y"@z.com', interest: "beli", created_at: "t" }]);
    expect(csv).toContain('"x,""y""@z.com"');
  });
});

describe("fetchWaitlist", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
  });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("token absen → throw", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    await expect(fetchWaitlist()).rejects.toThrow(/token/i);
  });

  it("panggil CF API & kembalikan rows", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: [{ results: rows }] }),
    } as Response);
    const out = await fetchWaitlist();
    expect(out).toEqual(rows);
    const url = (spy.mock.calls[0][0] as string);
    expect(url).toContain("/accounts/acct/d1/database/fc76ff99-d167-4570-a8ae-58923ab31e4d/query");
  });

  it("response gagal → throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    await expect(fetchWaitlist()).rejects.toThrow();
  });
});
