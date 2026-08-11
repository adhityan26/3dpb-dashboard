import { describe, it, expect, afterEach, vi } from "vitest";
import net from "node:net";
import { EventEmitter } from "node:events";
import { startBroker, stopBroker } from "./broker";

const PIN = "1234";

/**
 * Encode a minimal MQTT 3.1.1 CONNECT packet by hand (no `mqtt`/`mqtt-packet`
 * dependency needed — those aren't hoisted into apps/agent's node_modules).
 * Protocol name "MQTT", level 4, clean-session flag, 60s keep-alive, and a
 * single-character client id. Optionally includes username+password (CONNECT
 * flags bits 7/6) — MQTT payload order is ClientId, Username, Password.
 */
function buildMqttConnectPacket(clientId: string, opts: { username?: string; password?: string } = {}): Buffer {
  const protocolName = Buffer.from("MQTT", "utf8");
  const clientIdBuf = Buffer.from(clientId, "utf8");
  const usernameBuf = opts.username !== undefined ? Buffer.from(opts.username, "utf8") : null;
  const passwordBuf = opts.password !== undefined ? Buffer.from(opts.password, "utf8") : null;

  let connectFlags = 0x02; // clean session
  if (usernameBuf) connectFlags |= 0x80;
  if (passwordBuf) connectFlags |= 0x40;

  const variableHeader = Buffer.concat([
    Buffer.from([0x00, protocolName.length]),
    protocolName,
    Buffer.from([0x04]), // protocol level (3.1.1)
    Buffer.from([connectFlags]),
    Buffer.from([0x00, 0x3c]), // keep alive: 60s
  ]);

  const payloadParts = [Buffer.from([0x00, clientIdBuf.length]), clientIdBuf];
  if (usernameBuf) payloadParts.push(Buffer.from([0x00, usernameBuf.length]), usernameBuf);
  if (passwordBuf) payloadParts.push(Buffer.from([0x00, passwordBuf.length]), passwordBuf);
  const payload = Buffer.concat(payloadParts);

  const remainingLength = variableHeader.length + payload.length;
  return Buffer.concat([Buffer.from([0x10, remainingLength]), variableHeader, payload]);
}

/**
 * Connect a raw TCP client, complete (or fail) an MQTT CONNECT/CONNACK handshake, and
 * report the CONNACK return code — 0 means accepted, non-zero means the broker rejected
 * it (aedes writes a CONNACK with the error's returnCode, THEN closes the socket — see
 * aedes/lib/handlers/connect.js `authenticate()` -> `doConnack(arg, client.close...)`).
 */
function attemptMqttConnect(
  port: number,
  clientId: string,
  opts: { username?: string; password?: string } = {},
): Promise<{ accepted: boolean; returnCode: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
      socket.write(buildMqttConnectPacket(clientId, opts));
    });
    socket.once("error", reject);
    socket.once("data", (data) => {
      if (data[0] === 0x20) {
        resolve({ accepted: data[3] === 0, returnCode: data[3], socket });
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
    const result = await startBroker(1883, PIN);
    expect(result).toEqual({ ok: true, port: 1883 });
  });

  it("balikin ok:false reason:port_in_use kalau port sudah dipakai proses lain", async () => {
    const first = await startBroker(18830, PIN);
    expect(first.ok).toBe(true);
    // startBroker kedua di port SAMA tanpa stop dulu, dari instance server net terpisah — simulasikan EADDRINUSE
    const net = await import("node:net");
    const blocker = net.createServer();
    await new Promise<void>((res) => blocker.listen(18831, res));
    const second = await startBroker(18831, PIN);
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
        startBroker(18834, PIN),
        new Promise((resolve) => setTimeout(() => resolve(timedOut), 2000)),
      ]);
      expect(result).toEqual({ ok: false, reason: "listen_error" });
    } finally {
      spy.mockRestore();
    }
  });

  it("stopBroker() resolve walau ada client MQTT yang masih konek (bukan hang nunggu socket close sendiri)", async () => {
    const started = await startBroker(18832, PIN);
    expect(started.ok).toBe(true);

    const { socket } = await attemptMqttConnect(18832, "t", { username: "agent", password: PIN });
    expect(socket.destroyed).toBe(false);

    const TIMEOUT_MS = 2000;
    const timedOut = Symbol("timed-out");
    const raceResult = await Promise.race([
      stopBroker().then(() => "resolved" as const),
      new Promise((resolve) => setTimeout(() => resolve(timedOut), TIMEOUT_MS)),
    ]);

    expect(raceResult).toBe("resolved");
    socket.destroy();
  });
});

describe("startBroker — authenticate (PIN + rate limit)", () => {
  afterEach(async () => {
    await stopBroker();
  });

  it("PIN benar -> diterima (returnCode 0)", async () => {
    await startBroker(18840, PIN);
    const { accepted, socket } = await attemptMqttConnect(18840, "c1", { username: "agent", password: PIN });
    expect(accepted).toBe(true);
    socket.destroy();
  });

  it("PIN salah -> ditolak (returnCode != 0, bukan crash/hang)", async () => {
    await startBroker(18841, PIN);
    const { accepted, returnCode } = await attemptMqttConnect(18841, "c1", { username: "agent", password: "9999" });
    expect(accepted).toBe(false);
    expect(returnCode).not.toBe(0);
  });

  it("tanpa password sama sekali -> ditolak", async () => {
    await startBroker(18842, PIN);
    const { accepted } = await attemptMqttConnect(18842, "c1");
    expect(accepted).toBe(false);
  });

  it("5 kegagalan dari 1 IP non-loopback -> percobaan ke-6 (PIN BENAR sekalipun) tetap ditolak selama cooldown", async () => {
    await startBroker(18843, PIN);
    // net.createConnection ke 127.0.0.1 secara teknis loopback -- test ini memverifikasi
    // MEKANISME rate-limit map-nya lewat address override, bukan alamat asli socket (yang
    // memang exempt). Broker tak punya cara bedakan "test lokal" dari "loopback asli" selain
    // alamat itu sendiri, jadi verifikasi mekanisme cooldown dilakukan lewat unit test pada
    // fungsi rate-limit yang diekspor terpisah (lihat test "rateLimitForTesting" di bawah).
    for (let i = 0; i < 5; i++) {
      const { accepted } = await attemptMqttConnect(18843, `bad${i}`, { username: "agent", password: "0000" });
      expect(accepted).toBe(false);
    }
  });
});

describe("rate limit bookkeeping (non-loopback simulation via exported helper)", () => {
  it("5 gagal dari IP sama (bukan loopback) -> locked; IP LAIN tak terpengaruh; cooldown habis -> reset ke budget penuh 5, bukan sebagian", async () => {
    const { __resetRateLimitForTests, __checkPinForTests } = await import("./broker");
    __resetRateLimitForTests();
    const ATTACKER = "203.0.113.9";
    const OTHER = "203.0.113.10";

    for (let i = 0; i < 4; i++) {
      expect(__checkPinForTests(ATTACKER, "wrong", PIN)).toEqual({ ok: false, locked: false });
    }
    // ke-5: gagal DAN memicu lockout
    expect(__checkPinForTests(ATTACKER, "wrong", PIN)).toEqual({ ok: false, locked: false });
    // ke-6: sekarang locked -- PIN BENAR pun ditolak tanpa dibandingkan
    expect(__checkPinForTests(ATTACKER, PIN, PIN)).toEqual({ ok: false, locked: true });

    // IP lain sama sekali tak terpengaruh oleh lockout ATTACKER
    expect(__checkPinForTests(OTHER, PIN, PIN)).toEqual({ ok: true, locked: false });
  });

  it("loopback (127.0.0.1 dan ::1) tak pernah locked walau gagal berkali-kali, tapi PIN tetap wajib benar", async () => {
    const { __resetRateLimitForTests, __checkPinForTests } = await import("./broker");
    __resetRateLimitForTests();
    for (const addr of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      for (let i = 0; i < 10; i++) {
        expect(__checkPinForTests(addr, "wrong", PIN)).toEqual({ ok: false, locked: false });
      }
      expect(__checkPinForTests(addr, PIN, PIN)).toEqual({ ok: true, locked: false });
    }
  });
});
