import { describe, it, expect, vi, beforeEach } from "vitest";
import dgram from "node:dgram";

vi.mock("node:dgram", () => ({
  default: { createSocket: vi.fn() },
}));

import { parseSsdpPacket, scanBambu } from "./bambu-ssdp";

describe("parseSsdpPacket", () => {
  it("parse packet NOTIFY Bambu jadi DiscoveredBambuPrinter", () => {
    const raw = [
      "NOTIFY * HTTP/1.1",
      "HOST: 239.255.255.250:1900",
      "Server: UPnP/1.0",
      "Location: 192.168.88.22",
      "NT: urn:bambulab-com:device:3dprinter:1",
      "USN: 00M09D562001206",
      "DevModel.bambu.com: BL-P001",
      "DevName.bambu.com: Jupiter",
      "",
    ].join("\r\n");
    const parsed = parseSsdpPacket(Buffer.from(raw), "192.168.88.22");
    expect(parsed).toEqual({ ip: "192.168.88.22", serial: "00M09D562001206", model: "BL-P001", name: "Jupiter" });
  });

  it("balikin null kalau bukan packet Bambu (gak ada header bambu)", () => {
    const raw = "NOTIFY * HTTP/1.1\r\nHOST: x\r\n";
    expect(parseSsdpPacket(Buffer.from(raw), "1.2.3.4")).toBeNull();
  });
});

describe("scanBambu", () => {
  let onMessageCb: ((msg: Buffer, rinfo: { address: string }) => void) | null = null;
  let onErrorCb: ((err: NodeJS.ErrnoException) => void) | null = null;

  function mockSocket() {
    onMessageCb = null;
    onErrorCb = null;
    return {
      on: vi.fn((event: string, cb: any) => {
        if (event === "message") onMessageCb = cb;
        if (event === "error") onErrorCb = cb;
      }),
      bind: vi.fn((_port: number, cb: () => void) => cb()),
      close: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("kumpulkan printer dari beberapa packet dalam durasi scan", async () => {
    const sockets = [mockSocket(), mockSocket()];
    (dgram.createSocket as any).mockImplementation(() => sockets.shift());

    const promise = scanBambu(10);
    // Simulasikan 1 packet masuk di socket pertama (port 2021) setelah bind
    const raw = ["NOTIFY * HTTP/1.1", "NT: urn:bambulab-com:device:3dprinter:1", "USN: SERIAL1", "DevModel.bambu.com: C12", "DevName.bambu.com: Neptune", ""].join("\r\n");
    onMessageCb?.(Buffer.from(raw), { address: "192.168.88.106" });

    const result = await promise;
    expect(result).toEqual({ ok: true, printers: [{ ip: "192.168.88.106", serial: "SERIAL1", model: "C12", name: "Neptune" }] });
  });

  it("kalau SEMUA socket gagal bind EADDRINUSE, balikin ok:false reason:port_in_use", async () => {
    const sockets = [mockSocket(), mockSocket()];
    sockets.forEach((s) => { s.bind = vi.fn(); }); // bind tak pernah panggil cb sukses
    (dgram.createSocket as any).mockImplementation(() => sockets.shift());

    const promise = scanBambu(10);
    const err = new Error("bind EADDRINUSE") as NodeJS.ErrnoException;
    err.code = "EADDRINUSE";
    onErrorCb?.(err);
    onErrorCb?.(err);

    const result = await promise;
    expect(result).toEqual({ ok: false, reason: "port_in_use" });
  });
});
