import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ listDevices: vi.fn() }));
vi.mock("@/lib/cyd-layout/service", () => ({ getLayout: vi.fn(), saveLayout: vi.fn(), InvalidLayoutConfig: class extends Error { status = 400 } }));

import { auth } from "@/lib/auth";
import { listDevices } from "@/lib/devices/service";
import { getLayout, saveLayout } from "@/lib/cyd-layout/service";
import { GET, PUT } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cyd-layout", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("200 + layout (default kalau belum pernah simpan)", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getLayout as any).mockResolvedValue({ schemaVersion: 1, pages: [] });
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/cyd-layout", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400 kalau saveLayout throw InvalidLayoutConfig", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listDevices as any).mockResolvedValue([]);
    const { InvalidLayoutConfig } = await import("@/lib/cyd-layout/service");
    (saveLayout as any).mockRejectedValue(new InvalidLayoutConfig("bad"));
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("200 kalau sukses", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listDevices as any).mockResolvedValue([{ shortCode: "abc1234567" }]);
    (saveLayout as any).mockResolvedValue({ schemaVersion: 1, pages: [] });
    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ schemaVersion: 1, pages: [] }) }));
    expect(res.status).toBe(200);
  });
});
