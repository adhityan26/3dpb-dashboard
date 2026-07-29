import Aedes from "aedes";
import net from "node:net";

export type BrokerStartResult = { ok: true; port: number } | { ok: false; reason: "port_in_use" };

let server: net.Server | null = null;
let aedesInstance: Aedes | null = null;

export function startBroker(port = 1883): Promise<BrokerStartResult> {
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
    if (!server) return resolve();
    server.close(() => {
      server = null;
      aedesInstance = null;
      resolve();
    });
  });
}
