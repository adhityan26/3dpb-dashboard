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
    // Meniru validasi ASLI BambuMqttConnector (throw kalau serial/accessCode kosong) --
    // dibutuhkan buat test isolasi-kegagalan (satu device gagal construct tak boleh
    // menjatuhkan device lain), bukan cuma stub selalu-sukses.
    BambuMqttConnector: vi.fn().mockImplementation((device: any) => {
      if (!device.serial || !device.accessCode) throw new Error(`bambu device ${device.id} butuh serial+accessCode`);
      return { deviceId: device.id, start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) };
    }),
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
    const { engine } = await startEngine(paired, 1883);
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
    const { engine } = await startEngine(paired, 1883);
    expect(engine.snapshot().payload.map((p) => p.id)).toEqual(["a"]);
  });

  it("HmsLookup diisi table eksplisit dari hms-table.ts (BUKAN default zero-arg readFileSync)", async () => {
    await startEngine([{ shortCode: "h", label: "H", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S", accessCode: "C" } }], 1883);
    expect(HmsLookup).toHaveBeenCalledWith(hmsTable);
  });

  it("balikin reporter yang dibikin bareng Engine -- caller (agent:sync) WAJIB bisa nutupnya pas ganti Engine (Task 13 review: MqttReporter leak)", async () => {
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "SER1", accessCode: "1234" } }];
    const { reporters } = await startEngine(paired, 1883);
    expect(reporters).toHaveLength(1);
    expect(reporters[0].close).toBeDefined();

    await reporters[0].close();
    // Instance MqttReporter yang sama yang dioper ke Engine ({reporters:[reporter]} di
    // engine-manager.ts) HARUS persis instance yang dibalikin lewat StartedEngine.reporters --
    // makanya close() di sini semestinya sama seperti manggil close() di reporter internal Engine.
    expect((reporters[0] as any).close).toHaveBeenCalledTimes(1);
  });

  it("isi DeviceConfig.type dari PairedDevice.model kalau ada", async () => {
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", model: "P1S", secret: { ip: "1.1.1.1", serial: "S", accessCode: "C" } }];
    const { engine } = await startEngine(paired, 1883);
    expect(engine.snapshot().payload[0].type).toBe("P1S");
  });

  it("satu device bambu dengan secret salah (serial/accessCode kosong) gagal construct -> device LAIN (bambu+moonraker valid) TETAP termonitor, startEngine() tidak throw", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const paired = [
      { shortCode: "good-bambu", label: "Printer Baik", printerType: "bambu", secret: { ip: "1.1.1.1", serial: "SER1", accessCode: "1234" } },
      // Skenario nyata: device slot ber-type "bambu" dipasangkan dengan info yang salah
      // (mis. printer Klipper, serial dikosongkan) -- BambuMqttConnector menolak ini.
      { shortCode: "bad-bambu", label: "Printer Salah Pasang", printerType: "bambu", secret: { ip: "2.2.2.2", serial: "", accessCode: "" } },
      { shortCode: "good-moonraker", label: "Printer Klipper", printerType: "moonraker", secret: { ip: "3.3.3.3", serial: "", accessCode: "" } },
    ];

    const { engine } = await startEngine(paired, 1883);

    // Device yang gagal construct TETAP muncul di snapshot (kelihatan di dashboard, bukan
    // hilang diam-diam) -- cuma tanpa data status karena tak pernah termonitor.
    const ids = engine.snapshot().payload.map((p) => p.id);
    expect(ids).toEqual(["good-bambu", "bad-bambu", "good-moonraker"]);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("bad-bambu"), expect.any(Error));
    errSpy.mockRestore();
  });

  it("model null/kosong/whitespace -> fallback CYD_TYPE_FALLBACK per printerType", async () => {
    const paired = [
      { shortCode: "a", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", serial: "S", accessCode: "C" } },
      { shortCode: "b", label: "B", printerType: "bambu", model: "   ", secret: { ip: "1.1.1.2", serial: "S", accessCode: "C" } },
      { shortCode: "c", label: "C", printerType: "moonraker", model: undefined, secret: { ip: "1.1.1.3", serial: "", accessCode: "" } },
    ];
    const { engine } = await startEngine(paired, 1883);
    const byId = Object.fromEntries(engine.snapshot().payload.map((p) => [p.id, p.type]));
    expect(byId.a).toBe("Bambu Lab");
    expect(byId.b).toBe("Bambu Lab");
    expect(byId.c).toBe("Klipper");
  });
});
