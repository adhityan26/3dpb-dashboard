import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ putLog: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { putLog } from "@/lib/storage/r2";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

function makeRequest(body: string, contentLength?: number): Request {
  const bytes = new TextEncoder().encode(body);
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  return new Request("http://x", { method: "POST", body: bytes, headers });
}

describe("POST /api/agent/logs", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await POST(makeRequest("log content", 11));
    expect(res.status).toBe(401);
    expect(putLog).not.toHaveBeenCalled();
  });

  it("Content-Length header menyatakan > 5MB -> 413, DITOLAK SEBELUM baca body (putLog tak dipanggil)", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await POST(makeRequest("x", 6 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "log_too_large" });
    expect(putLog).not.toHaveBeenCalled();
  });

  it("body sungguhan > 5MB tapi Content-Length hilang/understated -> tetap 413 (post-buffer check)", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const bigBody = "x".repeat(6 * 1024 * 1024);
    const res = await POST(makeRequest(bigBody)); // no content-length header at all
    expect(res.status).toBe(413);
    expect(putLog).not.toHaveBeenCalled();
  });

  it("200 + putLog dipanggil dengan key agent-logs/<userId>/<timestamp>.log", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (putLog as any).mockResolvedValue(undefined);
    const res = await POST(makeRequest("log content", 11));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(putLog).toHaveBeenCalledTimes(1);
    const [key] = (putLog as any).mock.calls[0];
    expect(key).toMatch(/^agent-logs\/u1\/\d+\.log$/);
  });

  it("putLog throw (R2 down) -> 503 storage_unavailable", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (putLog as any).mockRejectedValue(new Error("r2 down"));
    const res = await POST(makeRequest("log content", 11));
    expect(res.status).toBe(503);
  });
});
