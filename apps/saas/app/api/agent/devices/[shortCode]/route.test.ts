import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ updateDeviceModelByShortCode: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { updateDeviceModelByShortCode } from "@/lib/devices/service";
import { DeviceNotFound, InvalidDeviceModel } from "@/lib/devices/errors";
import { PATCH } from "./route";

beforeEach(() => vi.clearAllMocks());

function ctx(shortCode: string) {
  return { params: Promise.resolve({ shortCode }) };
}

function req(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { Authorization: "Bearer slz_x" } });
}

describe("PATCH /api/agent/devices/[shortCode]", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await PATCH(req({ model: "P1S" }), ctx("abc1234567"));
    expect(res.status).toBe(401);
    expect(updateDeviceModelByShortCode).not.toHaveBeenCalled();
  });

  it("400 kalau body.model bukan string", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await PATCH(req({ model: 123 }), ctx("abc1234567"));
    expect(res.status).toBe(400);
    expect(updateDeviceModelByShortCode).not.toHaveBeenCalled();
  });

  it("404 kalau shortCode bukan milik user", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (updateDeviceModelByShortCode as any).mockRejectedValue(new DeviceNotFound());
    const res = await PATCH(req({ model: "P1S" }), ctx("abc1234567"));
    expect(res.status).toBe(404);
  });

  it("400 kalau InvalidDeviceModel", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (updateDeviceModelByShortCode as any).mockRejectedValue(new InvalidDeviceModel("x".repeat(12)));
    const res = await PATCH(req({ model: "x".repeat(12) }), ctx("abc1234567"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_device_model");
  });

  it("200 kalau sukses, field selain model diabaikan", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (updateDeviceModelByShortCode as any).mockResolvedValue({ id: "d1", model: "P1S" });
    const res = await PATCH(req({ model: "P1S", label: "harus diabaikan" }), ctx("abc1234567"));
    expect(res.status).toBe(200);
    expect(updateDeviceModelByShortCode).toHaveBeenCalledWith("u1", "abc1234567", "P1S");
  });
});
