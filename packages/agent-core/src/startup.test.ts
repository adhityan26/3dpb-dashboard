import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CredentialStore, PathProvider, BuildInfo, Logger } from "./interfaces";
import type { CredentialBlob } from "./credential-store";

vi.mock("./credential-store", () => ({ loadCredentials: vi.fn() }));
vi.mock("./device-cache", () => ({ loadDeviceCache: vi.fn(), saveDeviceCache: vi.fn() }));
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn() }));

import { loadCredentials } from "./credential-store";
import { loadDeviceCache, saveDeviceCache } from "./device-cache";
import { fetchDevices } from "./saas-client";
import { buildPairedDevices, reconcileDevices } from "./startup";

beforeEach(() => {
  vi.clearAllMocks();
});

const baseUrl = "https://app.slizebiz.com";
const store = {} as CredentialStore<CredentialBlob>;
const pathProvider = {} as PathProvider;
const buildInfo: BuildInfo = { version: "1.0.0", commitHash: "abc123" };
const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

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

    const paired = await buildPairedDevices(baseUrl, store, pathProvider, buildInfo, logger);

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (fresh)", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).toHaveBeenCalledWith(pathProvider, [{ shortCode: "abc1234567", label: "Printer A (fresh)", printerType: "bambu" }]);
  });

  it("SaaS unreachable (network_error): fallback pakai device-cache lokal, TETAP jalan (bukan kosong)", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu" }]);

    const paired = await buildPairedDevices(baseUrl, store, pathProvider, buildInfo, logger);

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).not.toHaveBeenCalled();
  });

  it("belum ada token tersimpan (belum pernah aktivasi): balikin [] tanpa panggil fetchDevices", async () => {
    (loadCredentials as any).mockResolvedValue({ agentToken: null, devices: {} });
    const paired = await buildPairedDevices(baseUrl, store, pathProvider, buildInfo, logger);
    expect(paired).toEqual([]);
    expect(fetchDevices).not.toHaveBeenCalled();
  });

  it("device ada di cache/fresh-fetch tapi kredensialnya (IP/serial/accessCode) belum di-pairing -> di-skip, bukan crash", async () => {
    (loadCredentials as any).mockResolvedValue({ agentToken: "slz_ok", devices: {} }); // belum ada device di-pairing
    (fetchDevices as any).mockResolvedValue({ ok: true, data: [{ id: "d1", shortCode: "belum-dipasangkan", userId: "u1", label: "B", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    const paired = await buildPairedDevices(baseUrl, store, pathProvider, buildInfo, logger);
    expect(paired).toEqual([]);
  });

  it("model ikut mengalir dari fetch fresh SaaS ke PairedDevice", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({
      ok: true,
      data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: "P1S", createdAt: "x", updatedAt: "y" }],
    });

    const paired = await buildPairedDevices(baseUrl, store, pathProvider, buildInfo, logger);

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", model: "P1S", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).toHaveBeenCalledWith(pathProvider, [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", model: "P1S" }]);
  });
});

describe("reconcileDevices", () => {
  it("balikin fetchResult + devices (dari SaaS) + paired -- dipakai bareng agent:sync & agent:get-activation-state (Task 13 review Finding 1 & 2)", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    const fresh = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" }];
    (fetchDevices as any).mockResolvedValue({ ok: true, data: fresh });

    const result = await reconcileDevices(baseUrl, store, pathProvider, "slz_ok", buildInfo, logger);

    expect(result.fetchResult).toEqual({ ok: true, data: fresh });
    expect(result.devices).toEqual(fresh); // fresh dari SaaS -> devices SAMA PERSIS, bukan dipetakan ulang
    expect(result.paired).toEqual([{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
  });

  it("SaaS unreachable -> devices dipetakan dari device-cache (field non-esensial default kosong), paired tetap dari cache", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu" }]);

    const result = await reconcileDevices(baseUrl, store, pathProvider, "slz_ok", buildInfo, logger);

    expect(result.fetchResult).toEqual({ ok: false, kind: "network_error" });
    expect(result.devices).toEqual([
      { id: "abc1234567", shortCode: "abc1234567", userId: "", label: "Printer A (cache)", printerType: "bambu", model: null, createdAt: "", updatedAt: "" },
    ]);
    expect(result.paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
  });

  it("SaaS unreachable -> model ikut dipetakan dari device-cache (bukan undefined)", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", model: "P1S" }]);

    const result = await reconcileDevices(baseUrl, store, pathProvider, "slz_ok", buildInfo, logger);

    expect(result.devices).toEqual([
      { id: "abc1234567", shortCode: "abc1234567", userId: "", label: "Printer A (cache)", printerType: "bambu", model: "P1S", createdAt: "", updatedAt: "" },
    ]);
    expect(result.paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", model: "P1S", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
  });

  it("cache lama tanpa field model (versi Agent sebelum fitur ini) -> tetap terbaca, model undefined bukan crash", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache lama)", printerType: "bambu" }]);

    const result = await reconcileDevices(baseUrl, store, pathProvider, "slz_ok", buildInfo, logger);

    expect(result.paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache lama)", printerType: "bambu", model: undefined, secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
  });
});
