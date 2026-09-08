import { describe, it, expect, vi } from "vitest";

const mockBrowser = { on: vi.fn(), stop: vi.fn() };
const mockBonjourInstance = { find: vi.fn(() => mockBrowser), destroy: vi.fn() };
vi.mock("bonjour-service", () => ({ Bonjour: vi.fn(() => mockBonjourInstance) }));

import { scanMoonraker } from "./moonraker-mdns";

describe("scanMoonraker", () => {
  it("kumpulkan service yang ditemukan dalam durasi scan", async () => {
    mockBrowser.on.mockImplementation((event: string, cb: any) => {
      if (event === "up") {
        setTimeout(() => cb({ name: "Ganymede", addresses: ["192.168.88.40", "fe80::1"], port: 7125 }), 5);
      }
    });
    const result = await scanMoonraker(20);
    expect(result).toEqual([{ ip: "192.168.88.40", name: "Ganymede" }]);
    expect(mockBonjourInstance.find).toHaveBeenCalledWith({ type: "moonraker", protocol: "tcp" });
  });

  it("pilih alamat IPv4 pertama, skip IPv6", async () => {
    mockBrowser.on.mockImplementation((event: string, cb: any) => {
      if (event === "up") setTimeout(() => cb({ name: "X", addresses: ["fe80::1", "10.0.0.5"], port: 7125 }), 5);
    });
    const result = await scanMoonraker(20);
    expect(result).toEqual([{ ip: "10.0.0.5", name: "X" }]);
  });
});
