import { describe, it, expect } from "vitest";
import type os from "node:os";
import { pickLocalIpCandidates } from "./local-network";

type Ifaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

function ipv4(address: string, internal = false): os.NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  } as os.NetworkInterfaceInfo;
}

describe("pickLocalIpCandidates", () => {
  it("adapter virtual Windows (vEthernet WSL/Hyper-V) yang muncul DULUAN tetap kalah dari adapter LAN asli", () => {
    // Urutan iterasi persis seperti mesin Windows ber-WSL2: vEthernet duluan. Sebelum fix,
    // 'ambil IPv4 non-internal pertama' mengembalikan 172.20.x.x yang tak bisa dijangkau CYD.
    const ifaces: Ifaces = {
      "vEthernet (WSL)": [ipv4("172.20.112.1")],
      "vEthernet (Default Switch)": [ipv4("172.31.0.1")],
      Ethernet: [ipv4("192.168.1.50")],
      "Loopback Pseudo-Interface 1": [ipv4("127.0.0.1", true)],
    };
    expect(pickLocalIpCandidates(ifaces)[0]).toBe("192.168.1.50");
  });

  it("adapter VPN (utun macOS, Tailscale, VirtualBox) juga dideprioritaskan", () => {
    const ifaces: Ifaces = {
      utun3: [ipv4("10.99.0.2")],
      tailscale0: [ipv4("100.101.102.103")],
      vboxnet0: [ipv4("192.168.56.1")],
      en0: [ipv4("192.168.88.211")],
    };
    expect(pickLocalIpCandidates(ifaces)[0]).toBe("192.168.88.211");
  });

  it("kandidat virtual TIDAK dibuang, cuma diturunkan prioritasnya (tetap jadi jejak diagnostik)", () => {
    const ifaces: Ifaces = {
      "vEthernet (WSL)": [ipv4("172.20.112.1")],
      Ethernet: [ipv4("192.168.1.50")],
    };
    expect(pickLocalIpCandidates(ifaces)).toEqual(["192.168.1.50", "172.20.112.1"]);
  });

  it("cuma ada adapter virtual -> tetap dipakai (lebih baik daripada tak ada alamat sama sekali)", () => {
    const ifaces: Ifaces = { "vEthernet (WSL)": [ipv4("172.20.112.1")] };
    expect(pickLocalIpCandidates(ifaces)).toEqual(["172.20.112.1"]);
  });

  it("abaikan loopback/internal dan IPv6", () => {
    const ifaces: Ifaces = {
      lo0: [ipv4("127.0.0.1", true)],
      en0: [
        { ...ipv4("192.168.1.50"), family: "IPv6", address: "fe80::1" } as os.NetworkInterfaceInfo,
        ipv4("192.168.1.50"),
      ],
    };
    expect(pickLocalIpCandidates(ifaces)).toEqual(["192.168.1.50"]);
  });

  it("tak ada interface sama sekali -> daftar kosong (getLocalIp yang jatuh ke 127.0.0.1)", () => {
    expect(pickLocalIpCandidates({})).toEqual([]);
    expect(pickLocalIpCandidates({ en0: undefined })).toEqual([]);
  });
});
