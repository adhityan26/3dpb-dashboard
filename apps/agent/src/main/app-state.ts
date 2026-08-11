import os from "node:os";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

let engine: Engine | null = null;
let brokerPort: number | null = null;
let brokerPin: string | null = null;
// MqttReporter(s) yang dibuat startEngine() bareng Engine yang lagi aktif. Engine.stop()
// (packages/printer-monitor-core) CUMA stop connector+timer, tidak pernah nutup reporter-nya
// sendiri -- jadi siapa pun yang ganti Engine (agent:sync) WAJIB juga nutup reporter lama
// lewat state ini, kalau tidak tiap restart bikin 1 koneksi MQTT baru yang gak pernah
// ditutup (leak, lihat Task 13 review post-fix-wave).
let reporters: MqttReporter[] = [];

export function setEngine(e: Engine | null): void { engine = e; }
export function getEngine(): Engine | null { return engine; }
export function setBrokerPort(port: number | null): void { brokerPort = port; }
export function getBrokerPort(): number | null { return brokerPort; }
export function setBrokerPin(pin: string | null): void { brokerPin = pin; }
export function getBrokerPin(): string | null { return brokerPin; }
export function setReporters(r: MqttReporter[]): void { reporters = r; }
export function getReporters(): MqttReporter[] { return reporters; }

// Adapter virtual/VPN. IP-nya non-internal & IPv4 juga, jadi lolos filter naif "ambil yang
// pertama" — dan di Windows dengan Hyper-V/WSL2 (`vEthernet (WSL)`), VirtualBox, atau VPN
// aktif, adapter-adapter ini SERING muncul sebelum adapter LAN asli. Akibatnya user
// mengetik IP yang tak bisa dijangkau CYD ke captive portal, dengan gejala ("CYD gak
// pernah konek padahal IP-nya kelihatan benar") yang nyaris mustahil didiagnosis dari
// percakapan support dan gampang tertukar dengan masalah Windows Firewall.
const VIRTUAL_IFACE_PATTERNS: RegExp[] = [
  /^vEthernet/i, // Hyper-V / WSL2 (Windows)
  /hyper-?v/i,
  /virtualbox|vboxnet/i,
  /vmware|^vmnet/i,
  /tailscale/i,
  /zerotier/i,
  /^wg\d/i, // WireGuard
  /^ppp\d/i, // dial-up / beberapa client VPN
  /^utun\d/i, // VPN tunnel macOS
  /^tun\d|^tap\d/i, // OpenVPN dsb.
  /^docker|^br-|^veth/i, // bridge Docker
  /loopback/i,
  /bluetooth/i,
  /virtual/i,
];

function isVirtualIface(name: string): boolean {
  return VIRTUAL_IFACE_PATTERNS.some((re) => re.test(name));
}

/**
 * Semua IPv4 non-internal, diurutkan: adapter fisik dulu, adapter virtual/VPN belakangan.
 * Dipisah dari `getLocalIp()` supaya bisa dites dengan `os.networkInterfaces()` palsu dan
 * supaya startup bisa mencatat SEMUA kandidat (jejak diagnostik kalau tebakan utama salah).
 */
export function pickLocalIpCandidates(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
): string[] {
  const real: string[] = [];
  const virtual: string[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const iface of addrs ?? []) {
      if (!iface || iface.family !== "IPv4" || iface.internal) continue;
      (isVirtualIface(name) ? virtual : real).push(iface.address);
    }
  }
  return [...real, ...virtual];
}

export function listLocalIpCandidates(): string[] {
  return pickLocalIpCandidates(os.networkInterfaces());
}

export function getLocalIp(): string {
  return listLocalIpCandidates()[0] ?? "127.0.0.1";
}
