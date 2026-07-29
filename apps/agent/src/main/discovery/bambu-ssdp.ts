import dgram from "node:dgram";

export interface DiscoveredBambuPrinter {
  ip: string;
  serial: string;
  model: string;
  name: string;
}

export type ScanResult =
  | { ok: true; printers: DiscoveredBambuPrinter[] }
  | { ok: false; reason: "port_in_use" };

const PORTS = [2021, 1900];

export function parseSsdpPacket(buf: Buffer, sourceIp: string): DiscoveredBambuPrinter | null {
  const text = buf.toString("utf8");
  const lines = text.split("\r\n").filter(Boolean);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const isBambu = Object.keys(headers).some((k) => k.toLowerCase().includes("bambu"));
  if (!isBambu) return null;
  return {
    ip: sourceIp,
    serial: headers["USN"] ?? "",
    model: headers["DevModel.bambu.com"] ?? "",
    name: headers["DevName.bambu.com"] ?? "",
  };
}

/** Scan broadcast SSDP Bambu selama `durationMs`. Coba SEMUA port sekaligus (reuseAddr:true —
 * sering bisa koeksis dengan BambuStudio di Windows); kalau SEMUA gagal bind EADDRINUSE, balikin
 * ok:false supaya UI bisa tampilkan pesan "Tutup BambuStudio dulu" (bukan diam-diam kosong). */
export function scanBambu(durationMs = 20_000): Promise<ScanResult> {
  return new Promise((resolve) => {
    const seen = new Map<string, DiscoveredBambuPrinter>();
    const sockets: ReturnType<typeof dgram.createSocket>[] = [];
    let boundCount = 0;
    let errorCount = 0;
    let settled = false;

    function finish(result: ScanResult) {
      if (settled) return;
      settled = true;
      for (const s of sockets) s.close();
      resolve(result);
    }

    for (const port of PORTS) {
      const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
      sockets.push(sock);
      sock.on("error", () => {
        errorCount++;
        if (errorCount === PORTS.length && boundCount === 0) {
          finish({ ok: false, reason: "port_in_use" });
        }
      });
      sock.on("message", (msg, rinfo) => {
        const parsed = parseSsdpPacket(msg, rinfo.address);
        if (!parsed) return;
        seen.set(parsed.serial || parsed.ip, parsed);
      });
      sock.bind(port, () => {
        boundCount++;
      });
    }

    setTimeout(() => finish({ ok: true, printers: [...seen.values()] }), durationMs);
  });
}
