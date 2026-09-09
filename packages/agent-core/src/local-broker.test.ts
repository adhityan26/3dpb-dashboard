import { describe, it, expect, vi, afterEach } from "vitest";
import net from "node:net";
import { EventEmitter } from "node:events";
import mqtt from "mqtt";
import { LocalBroker } from "./local-broker";
import type { Logger } from "./interfaces";

const PIN = "1234";

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("LocalBroker", () => {
  let broker: LocalBroker | undefined;

  afterEach(async () => {
    await broker?.stop();
    broker = undefined;
  });

  // Default 1883 diverifikasi lewat fake server (tanpa bind beneran): bind 1883 asli bikin
  // test tabrakan dengan app Agent/mosquitto yang kebetulan jalan, atau sesi test paralel
  // lain di mesin yang sama.
  it("start() tanpa port eksplisit minta listen di port default 1883, balikin ok:true+port", async () => {
    let requestedPort: number | undefined;
    const fakeServer = new EventEmitter() as unknown as net.Server & EventEmitter;
    (fakeServer as unknown as { listen: unknown }).listen = (port: number, cb: () => void) => {
      requestedPort = port;
      setImmediate(cb);
      return fakeServer;
    };
    (fakeServer as unknown as { address: unknown }).address = () => ({ port: requestedPort });
    (fakeServer as unknown as { close: unknown }).close = (cb?: () => void) => {
      cb?.();
      return fakeServer;
    };
    const spy = vi.spyOn(net, "createServer").mockReturnValue(fakeServer);
    try {
      broker = new LocalBroker(makeLogger());
      const result = await broker.start(undefined as unknown as number, PIN);
      expect(requestedPort).toBe(1883);
      expect(result).toEqual({ ok: true, port: 1883 });
    } finally {
      spy.mockRestore();
    }
  });

  it("start() dengan port 0 (ephemeral) -> ok:true, port beneran dari OS", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, PIN);
    expect(result).toEqual({ ok: true, port: expect.any(Number) });
    if (result.ok) expect(result.port).toBeGreaterThan(0);
  });

  it("balikin ok:false reason:port_in_use kalau port sudah dipakai proses lain", async () => {
    // Blocker bind port ephemeral dulu, lalu start() diarahkan ke port yang SAMA —
    // EADDRINUSE deterministik tanpa mengandalkan port fixed yang bisa bentrok antar sesi.
    const blocker = net.createServer();
    await new Promise<void>((res) => blocker.listen(0, res));
    const usedPort = (blocker.address() as { port: number }).port;
    broker = new LocalBroker(makeLogger());
    const second = await broker.start(usedPort, PIN);
    expect(second).toEqual({ ok: false, reason: "port_in_use" });
    await new Promise<void>((res) => blocker.close(() => res()));
  });

  it("EACCES (bukan EADDRINUSE) -> ok:false, reason:listen_error, logger.error dipanggil, bukan promise yang tak pernah settle", async () => {
    const logger = makeLogger();
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
      broker = new LocalBroker(logger);
      const timedOut = Symbol("timed-out");
      const result = await Promise.race([
        broker.start(18834, PIN),
        new Promise((resolve) => setTimeout(() => resolve(timedOut), 2000)),
      ]);
      expect(result).toEqual({ ok: false, reason: "listen_error" });
      expect(logger.error).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("stop() resolve walau ada client MQTT yang masih konek (bukan hang nunggu socket close sendiri)", async () => {
    broker = new LocalBroker(makeLogger());
    const started = await broker.start(0, PIN);
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("broker gagal start");

    const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${started.port}`, {
      username: "agent",
      password: PIN,
      reconnectPeriod: 0, // jangan auto-reconnect -- broker akan ditutup paksa di bawah
    });

    const TIMEOUT_MS = 2000;
    const timedOut = Symbol("timed-out");
    const raceResult = await Promise.race([
      broker.stop().then(() => "resolved" as const),
      new Promise((resolve) => setTimeout(() => resolve(timedOut), TIMEOUT_MS)),
    ]);

    expect(raceResult).toBe("resolved");
    client.end(true);
  });

  it("start() dua kali berturut-turut tanpa stop() eksplisit -> idempotent, tidak leak", async () => {
    broker = new LocalBroker(makeLogger());
    const first = await broker.start(0, PIN);
    const second = await broker.start(0, PIN);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("stop() sebelum start() -> tidak throw", async () => {
    broker = new LocalBroker(makeLogger());
    await expect(broker.stop()).resolves.toBeUndefined();
  });
});

describe("LocalBroker — authenticate (PIN + rate limit)", () => {
  let broker: LocalBroker | undefined;

  afterEach(async () => {
    await broker?.stop();
    broker = undefined;
  });

  it("PIN benar -> connect sukses", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, PIN);
    if (!result.ok) throw new Error("broker gagal start");
    const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${result.port}`, {
      username: "agent",
      password: PIN,
    });
    await client.endAsync();
  });

  it("PIN salah -> connect ditolak (bukan crash/hang)", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, PIN);
    if (!result.ok) throw new Error("broker gagal start");
    await expect(
      mqtt.connectAsync(`mqtt://127.0.0.1:${result.port}`, {
        username: "agent",
        password: "salah",
        connectTimeout: 2000,
      }),
    ).rejects.toThrow();
  });

  it("tanpa password sama sekali -> ditolak", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, PIN);
    if (!result.ok) throw new Error("broker gagal start");
    await expect(
      mqtt.connectAsync(`mqtt://127.0.0.1:${result.port}`, {
        username: "agent",
        connectTimeout: 2000,
      }),
    ).rejects.toThrow();
  });

  it("5 percobaan PIN salah berturut-turut dari loopback -> semuanya ditolak satu-satu (127.0.0.1 exempt dari rate-limit; bookkeeping rate-limit sendiri sudah dites tuntas di pin-rate-limiter.test.ts)", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, PIN);
    if (!result.ok) throw new Error("broker gagal start");
    for (let i = 0; i < 5; i++) {
      await expect(
        mqtt.connectAsync(`mqtt://127.0.0.1:${result.port}`, {
          clientId: `bad${i}`,
          username: "agent",
          password: "0000",
          connectTimeout: 2000,
        }),
      ).rejects.toThrow();
    }
  });
});
