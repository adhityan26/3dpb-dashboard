import { describe, it, expect, afterEach, vi } from "vitest";
import net from "node:net";
import { EventEmitter } from "node:events";
import { startBroker, stopBroker } from "./broker";

/**
 * Encode a minimal MQTT 3.1.1 CONNECT packet by hand (no `mqtt`/`mqtt-packet`
 * dependency needed — those aren't hoisted into apps/agent's node_modules).
 * Protocol name "MQTT", level 4, clean-session flag, 60s keep-alive, and a
 * single-character client id.
 */
function buildMqttConnectPacket(clientId: string): Buffer {
  const protocolName = Buffer.from("MQTT", "utf8");
  const clientIdBuf = Buffer.from(clientId, "utf8");

  const variableHeader = Buffer.concat([
    Buffer.from([0x00, protocolName.length]),
    protocolName,
    Buffer.from([0x04]), // protocol level (3.1.1)
    Buffer.from([0x02]), // connect flags: clean session
    Buffer.from([0x00, 0x3c]), // keep alive: 60s
  ]);
  const payload = Buffer.concat([Buffer.from([0x00, clientIdBuf.length]), clientIdBuf]);

  const remainingLength = variableHeader.length + payload.length;
  return Buffer.concat([Buffer.from([0x10, remainingLength]), variableHeader, payload]);
}

/** Connect a raw TCP client and complete an MQTT CONNECT/CONNACK handshake. */
function connectMqttClient(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
      socket.write(buildMqttConnectPacket("t"));
    });
    socket.once("error", reject);
    socket.once("data", (data) => {
      // Expect a CONNACK (packet type 0x20) confirming aedes registered the client.
      if (data[0] === 0x20) {
        resolve(socket);
      } else {
        reject(new Error(`expected CONNACK, got byte ${data[0]}`));
      }
    });
  });
}

describe("startBroker", () => {
  afterEach(async () => {
    await stopBroker();
  });

  it("berhasil listen di port default 1883, balikin ok:true+port", async () => {
    const result = await startBroker();
    expect(result).toEqual({ ok: true, port: 1883 });
  });

  it("balikin ok:false reason:port_in_use kalau port sudah dipakai proses lain", async () => {
    const first = await startBroker(18830);
    expect(first.ok).toBe(true);
    // startBroker kedua di port SAMA tanpa stop dulu, dari instance server net terpisah — simulasikan EADDRINUSE
    const net = await import("node:net");
    const blocker = net.createServer();
    await new Promise<void>((res) => blocker.listen(18831, res));
    const second = await startBroker(18831);
    expect(second).toEqual({ ok: false, reason: "port_in_use" });
    blocker.close();
  });

  it("listen error SELAIN EADDRINUSE (mis. EACCES) tetap resolve — bukan promise yang tak pernah settle", async () => {
    // EACCES nyata di Windows saat port jatuh di rentang excluded Hyper-V/WSL. Dulu handler
    // error cuma menangani EADDRINUSE, jadi startBroker() menggantung selamanya -> await-nya
    // di bootstrap() ikut menggantung -> crash-guard try/catch/finally Task 10 terlewati
    // (promise yang tak pernah settle tak bisa ditangkap try/catch) -> proses hidup tanpa
    // window dan tanpa IPC.
    const fakeServer = new EventEmitter() as unknown as net.Server & EventEmitter;
    (fakeServer as unknown as { listen: unknown }).listen = () => {
      setImmediate(() => {
        const err: NodeJS.ErrnoException = new Error("permission denied");
        err.code = "EACCES";
        fakeServer.emit("error", err);
      });
      return fakeServer;
    };
    (fakeServer as unknown as { close: unknown }).close = (cb?: () => void) => {
      cb?.();
      return fakeServer;
    };
    const spy = vi.spyOn(net, "createServer").mockReturnValue(fakeServer);

    try {
      const timedOut = Symbol("timed-out");
      const result = await Promise.race([
        startBroker(18834),
        new Promise((resolve) => setTimeout(() => resolve(timedOut), 2000)),
      ]);
      expect(result).toEqual({ ok: false, reason: "listen_error" });
    } finally {
      spy.mockRestore();
    }
  });

  it("stopBroker() resolve walau ada client MQTT yang masih konek (bukan hang nunggu socket close sendiri)", async () => {
    const started = await startBroker(18832);
    expect(started.ok).toBe(true);

    const client = await connectMqttClient(18832);
    expect(client.destroyed).toBe(false);

    const TIMEOUT_MS = 2000;
    const timedOut = Symbol("timed-out");
    const raceResult = await Promise.race([
      stopBroker().then(() => "resolved" as const),
      new Promise((resolve) => setTimeout(() => resolve(timedOut), TIMEOUT_MS)),
    ]);

    expect(raceResult).toBe("resolved");
    client.destroy();
  });
});
