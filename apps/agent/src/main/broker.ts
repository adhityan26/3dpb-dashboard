import Aedes from "aedes";
import net from "node:net";

export type BrokerStartResult = { ok: true; port: number } | { ok: false; reason: "port_in_use" };

let server: net.Server | null = null;
let aedesInstance: Aedes | null = null;

export async function startBroker(port = 1883): Promise<BrokerStartResult> {
  // Idempotent: starting twice without an intervening stop would otherwise
  // leak the previous net.Server + Aedes instance (and its client sockets).
  await stopBroker();

  return new Promise((resolve) => {
    aedesInstance = new Aedes();
    server = net.createServer(aedesInstance.handle);
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve({ ok: false, reason: "port_in_use" });
    });
    server.listen(port, () => resolve({ ok: true, port }));
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
