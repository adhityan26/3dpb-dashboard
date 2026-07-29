import { describe, it, expect, vi } from "vitest";

const handlers: Record<string, (...args: any[]) => any> = {};
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, fn: any) => { handlers[channel] = fn; }) },
}));
vi.mock("./credential-store", () => ({ loadCredentials: vi.fn().mockResolvedValue({ agentToken: null, devices: {} }), saveCredentials: vi.fn() }));
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }), fetchLayout: vi.fn() }));
vi.mock("./discovery/bambu-ssdp", () => ({ scanBambu: vi.fn().mockResolvedValue({ ok: true, printers: [] }) }));
vi.mock("./discovery/moonraker-mdns", () => ({ scanMoonraker: vi.fn().mockResolvedValue([]) }));

import { registerIpcHandlers } from "./ipc";
import { ipcMain } from "electron";
import { fetchDevices } from "./saas-client";

describe("registerIpcHandlers", () => {
  it("daftarkan handler 'agent:activate'", () => {
    registerIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:activate", expect.any(Function));
  });

  it("'agent:activate' panggil fetchDevices dengan token yang dioper", async () => {
    registerIpcHandlers();
    await handlers["agent:activate"]({}, "slz_test_token");
    expect(fetchDevices).toHaveBeenCalledWith("slz_test_token");
  });

  it("daftarkan handler 'agent:scan-lan'", () => {
    registerIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:scan-lan", expect.any(Function));
  });
});
