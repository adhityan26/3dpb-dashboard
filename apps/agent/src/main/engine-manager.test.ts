import { describe, it, expect, vi } from "vitest";

const connectMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@3pb/printer-monitor-core", async () => {
  const actual = await vi.importActual<any>("@3pb/printer-monitor-core");
  return {
    ...actual,
    MqttReporter: vi.fn().mockImplementation((opts) => ({ ...opts, connect: connectMock, publishStatus: vi.fn(), emitEvent: vi.fn(), close: vi.fn() })),
    // Real connectors dial real network (BambuMqttConnector via mqtt.connect,
    // MoonrakerConnector via `await fetch(...)` di start()) — di sandbox tanpa rute
    // ke IP privat itu fetch bisa menggantung (bukan langsung ECONNREFUSED), yang
    // membuat test ini non-deterministik/lambat. Stub keduanya jadi no-op sinkron
    // (pola sama seperti packages/printer-monitor-core/src/__tests__/engine.test.ts
    // yang pakai connector in-memory, bukan koneksi network asli).
    BambuMqttConnector: vi.fn().mockImplementation((device: any) => ({ deviceId: device.id, start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) })),
    MoonrakerConnector: vi.fn().mockImplementation((device: any) => ({ deviceId: device.id, start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) })),
    // Spy on HmsLookup's constructor so we can assert it's invoked with the explicit
    // table (hms-table.ts), not the zero-arg default that triggers the library's
    // fragile readFileSync(new URL(...)) bundling gotcha (see engine-manager.ts).
    HmsLookup: vi.fn().mockImplementation(() => ({ translate: vi.fn().mockReturnValue([]) })),
  };
});

import { startEngine } from "./engine-manager";
import { MqttReporter, HmsLookup } from "@3pb/printer-monitor-core";
import { hmsTable } from "./hms-table";

describe("startEngine", () => {
  it("bikin DeviceConfig dengan id = shortCode (BUKAN label/serial lain)", async () => {
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "SER1", accessCode: "1234" } }];
    const engine = await startEngine(paired, 1883);
    const snapshot = engine.snapshot();
    expect(snapshot.payload[0].id).toBe("abc1234567");
  });

  it("override statusTopic ke 3dpb/printers (BUKAN default 3dpb/printers-v2)", async () => {
    await startEngine([{ shortCode: "x", label: "L", printerType: "moonraker", secret: { ip: "10.0.0.5", serial: "", accessCode: "" } }], 1883);
    expect(MqttReporter).toHaveBeenCalledWith(expect.objectContaining({ statusTopic: "3dpb/printers" }));
  });

  it("printerType tak dikenal di-skip (bukan crash seluruh Engine)", async () => {
    const paired = [
      { shortCode: "a", label: "A", printerType: "bambu", secret: { ip: "1.1.1.1", serial: "S", accessCode: "C" } },
      { shortCode: "b", label: "B", printerType: "prusa-tak-didukung", secret: { ip: "2.2.2.2", serial: "", accessCode: "" } },
    ];
    const engine = await startEngine(paired, 1883);
    expect(engine.snapshot().payload.map((p) => p.id)).toEqual(["a"]);
  });

  it("HmsLookup diisi table eksplisit dari hms-table.ts (BUKAN default zero-arg readFileSync)", async () => {
    await startEngine([{ shortCode: "h", label: "H", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S", accessCode: "C" } }], 1883);
    expect(HmsLookup).toHaveBeenCalledWith(hmsTable);
  });
});
