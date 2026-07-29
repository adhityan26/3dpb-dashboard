import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./credential-store", () => ({ loadCredentials: vi.fn() }));
vi.mock("./device-cache", () => ({ loadDeviceCache: vi.fn(), saveDeviceCache: vi.fn() }));
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn() }));

import { loadCredentials } from "./credential-store";
import { loadDeviceCache, saveDeviceCache } from "./device-cache";
import { fetchDevices } from "./saas-client";
import { buildPairedDevices } from "./startup";

beforeEach(() => vi.clearAllMocks());

describe("buildPairedDevices", () => {
  it("SaaS reachable: pakai data fresh, DAN update device-cache biar tersedia offline nanti", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({
      ok: true,
      data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A (fresh)", printerType: "bambu", createdAt: "x", updatedAt: "y" }],
    });

    const paired = await buildPairedDevices();

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (fresh)", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).toHaveBeenCalledWith([{ shortCode: "abc1234567", label: "Printer A (fresh)", printerType: "bambu" }]);
  });

  it("SaaS unreachable (network_error): fallback pakai device-cache lokal, TETAP jalan (bukan kosong)", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu" }]);

    const paired = await buildPairedDevices();

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).not.toHaveBeenCalled();
  });

  it("belum ada token tersimpan (belum pernah aktivasi): balikin [] tanpa panggil fetchDevices", async () => {
    (loadCredentials as any).mockResolvedValue({ agentToken: null, devices: {} });
    const paired = await buildPairedDevices();
    expect(paired).toEqual([]);
    expect(fetchDevices).not.toHaveBeenCalled();
  });

  it("device ada di cache/fresh-fetch tapi kredensialnya (IP/serial/accessCode) belum di-pairing -> di-skip, bukan crash", async () => {
    (loadCredentials as any).mockResolvedValue({ agentToken: "slz_ok", devices: {} }); // belum ada device di-pairing
    (fetchDevices as any).mockResolvedValue({ ok: true, data: [{ id: "d1", shortCode: "belum-dipasangkan", userId: "u1", label: "B", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    const paired = await buildPairedDevices();
    expect(paired).toEqual([]);
  });
});
