import Aedes from "aedes";
import net from "node:net";

export type BrokerStartResult =
  | { ok: true; port: number }
  | { ok: false; reason: "port_in_use" | "listen_error" };

let server: net.Server | null = null;
let aedesInstance: Aedes | null = null;

/**
 * Jaring pengaman kalau `listen()` tak pernah memanggil callback DAN tak pernah emit
 * "error" (secara teori tak terjadi, tapi murah). Tanpa ini, satu skenario aneh saja bikin
 * `bootstrap()` menggantung selamanya — dan promise yang tak pernah settle TIDAK bisa
 * ditangkap try/catch/finally di main/index.ts, jadi window pun tak pernah dibuat.
 */
const LISTEN_TIMEOUT_MS = 10_000;

export async function startBroker(port = 1883): Promise<BrokerStartResult> {
  // Idempotent: starting twice without an intervening stop would otherwise
  // leak the previous net.Server + Aedes instance (and its client sockets).
  await stopBroker();

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const settle = (result: BrokerStartResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    aedesInstance = new Aedes();
    const srv = net.createServer(aedesInstance.handle);
    server = srv;
    // WAJIB settle untuk SEMUA kode error, bukan cuma EADDRINUSE. EACCES (port di rentang
    // excluded Hyper-V/WSL di Windows), EADDRNOTAVAIL, dsb. dulu bikin promise ini tak
    // pernah settle -> `await startBroker()` di bootstrap() menggantung -> crash-guard
    // try/catch/finally Task 10 terlewati total (proses hidup, tanpa window, tanpa IPC).
    srv.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        settle({ ok: false, reason: "port_in_use" });
        return;
      }
      console.error("[broker] gagal listen (bukan EADDRINUSE)", err);
      settle({ ok: false, reason: "listen_error" });
    });
    timer = setTimeout(() => {
      console.error(`[broker] listen tak merespons dalam ${LISTEN_TIMEOUT_MS}ms — dianggap gagal`);
      settle({ ok: false, reason: "listen_error" });
    }, LISTEN_TIMEOUT_MS);
    // Timer tak boleh menahan event loop kalau app mau keluar duluan.
    timer.unref?.();
    srv.listen(port, () => {
      // Port aktual dari OS, bukan yang diminta — port 0 (ephemeral, dipakai test supaya
      // hermetis) baru ketahuan nomornya di sini.
      const addr = srv.address();
      settle({ ok: true, port: typeof addr === "object" && addr !== null ? addr.port : port });
    });
  });
}

export function stopBroker(): Promise<void> {
  return new Promise((resolve) => {
    if (!server || !aedesInstance) {
      server = null;
      aedesInstance = null;
      resolve();
      return;
    }
    const srv = server;
    const instance = aedesInstance;
    server = null;
    aedesInstance = null;

    // aedesInstance.close() terminates all connected MQTT client sockets
    // (and clears its internal heartbeat/will-clearing timers). Closing the
    // bare net.Server first would hang: net.Server#close()'s callback only
    // fires once ALL existing TCP connections have ended, and nothing but
    // Aedes itself ends them.
    instance.close(() => {
      srv.close(() => resolve());
    });
  });
}
