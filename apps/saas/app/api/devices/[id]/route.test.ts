import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ updateDevice: vi.fn(), deleteDevice: vi.fn() }));

import { auth } from "@/lib/auth";
import { updateDevice, deleteDevice } from "@/lib/devices/service";
import { DeviceNotFound, InvalidPrinterType } from "@/lib/devices/errors";
import { PATCH, DELETE } from "./route";

beforeEach(() => vi.clearAllMocks());

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/devices/[id]", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: "{}" }), ctx("d1"));
    expect(res.status).toBe(401);
  });

  it("404 kalau device bukan milik user", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (updateDevice as any).mockRejectedValue(new DeviceNotFound());
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ label: "Baru" }) }), ctx("d1"));
    expect(res.status).toBe(404);
  });

  it("400 kalau printerType invalid", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (updateDevice as any).mockRejectedValue(new InvalidPrinterType("x"));
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ printerType: "x" }) }), ctx("d1"));
    expect(res.status).toBe(400);
  });

  it("200 kalau sukses", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (updateDevice as any).mockResolvedValue({ id: "d1", label: "Baru" });
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ label: "Baru" }) }), ctx("d1"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/devices/[id]", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("d1"));
    expect(res.status).toBe(401);
  });

  it("204 kalau sukses", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (deleteDevice as any).mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("d1"));
    expect(res.status).toBe(204);
  });

  it("404 kalau device bukan milik user", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (deleteDevice as any).mockRejectedValue(new DeviceNotFound());
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("d1"));
    expect(res.status).toBe(404);
  });
});
