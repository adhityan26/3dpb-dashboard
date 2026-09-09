import os from "node:os";

// Adapter virtual/VPN. IP-nya non-internal & IPv4 juga, jadi lolos filter naif "ambil yang
// pertama" — dan di Windows dengan Hyper-V/WSL2 (`vEthernet (WSL)`), VirtualBox, atau VPN
// aktif, adapter-adapter ini SERING muncul sebelum adapter LAN asli. Akibatnya user
// mengetik IP yang tak bisa dijangkau CYD ke captive portal, dengan gejala ("CYD gak
// pernah konek padahal IP-nya kelihatan benar") yang nyaris mustahil didiagnosis dari
// percakapan support dan gampang tertukar dengan masalah Windows Firewall.
const VIRTUAL_IFACE_PATTERNS: RegExp[] = [
  /^vEthernet/i,
  /hyper-?v/i,
  /virtualbox|vboxnet/i,
  /vmware|^vmnet/i,
  /tailscale/i,
  /zerotier/i,
  /^wg\d/i,
  /^ppp\d/i,
  /^utun\d/i,
  /^tun\d|^tap\d/i,
  /^docker|^br-|^veth/i,
  /loopback/i,
  /bluetooth/i,
  /virtual/i,
];

function isVirtualIface(name: string): boolean {
  return VIRTUAL_IFACE_PATTERNS.some((re) => re.test(name));
}

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
