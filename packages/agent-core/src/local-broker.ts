import Aedes from "aedes";
import net from "node:net";
import type { Socket } from "node:net";
import { PinRateLimiter } from "./pin-rate-limiter";
import type { Logger } from "./interfaces";

export type LocalBrokerStartResult =
  | { ok: true; port: number }
  | { ok: false; reason: "port_in_use" | "listen_error" };

const LISTEN_TIMEOUT_MS = 10_000;

const CONNACK_BAD_USERNAME_OR_PASSWORD = 4;
const CONNACK_NOT_AUTHORIZED = 5;

function authErr(code: number): Error & { returnCode: number } {
  const err = new Error("mqtt auth rejected") as Error & { returnCode: number };
  err.returnCode = code;
  return err;
}

export class LocalBroker {
  private server: net.Server | null = null;
  private aedesInstance: Aedes | null = null;
  private rateLimiter = new PinRateLimiter();

  constructor(private readonly logger: Logger) {}

  get port(): number | null {
    const addr = this.server?.address();
    return typeof addr === "object" && addr !== null ? addr.port : null;
  }

  private createAuthenticateHandler(pin: string) {
    return (
      client: { conn: Socket },
      _username: string | undefined,
      password: Buffer | undefined,
      done: (error: (Error & { returnCode: number }) | null, success: boolean | null) => void,
    ) => {
      const presented = password ? password.toString("utf8") : "";
      const { ok, locked } = this.rateLimiter.check(client.conn?.remoteAddress ?? "", presented, pin);
      if (ok) {
        done(null, true);
        return;
      }
      done(authErr(locked ? CONNACK_NOT_AUTHORIZED : CONNACK_BAD_USERNAME_OR_PASSWORD), false);
    };
  }

  async start(port = 1883, pin: string): Promise<LocalBrokerStartResult> {
    // Idempotent: starting twice without an intervening stop would otherwise
    // leak the previous net.Server + Aedes instance (and its client sockets).
    await this.stop();
    this.rateLimiter = new PinRateLimiter(); // PIN baru tiap start -> state rate-limit lama tak relevan

    return new Promise((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | null = null;
      const settle = (result: LocalBrokerStartResult) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };

      const instance = new Aedes();
      instance.authenticate = this.createAuthenticateHandler(pin) as typeof instance.authenticate;
      const srv = net.createServer(instance.handle);
      this.server = srv;
      this.aedesInstance = instance;

      srv.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          settle({ ok: false, reason: "port_in_use" });
          return;
        }
        this.logger.error("[local-broker] gagal listen (bukan EADDRINUSE)", err);
        settle({ ok: false, reason: "listen_error" });
      });
      timer = setTimeout(() => {
        this.logger.error(`[local-broker] listen tak merespons dalam ${LISTEN_TIMEOUT_MS}ms — dianggap gagal`);
        settle({ ok: false, reason: "listen_error" });
      }, LISTEN_TIMEOUT_MS);
      timer.unref?.();
      srv.listen(port, () => {
        const addr = srv.address();
        settle({ ok: true, port: typeof addr === "object" && addr !== null ? addr.port : port });
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server || !this.aedesInstance) {
        this.server = null;
        this.aedesInstance = null;
        resolve();
        return;
      }
      const srv = this.server;
      const instance = this.aedesInstance;
      this.server = null;
      this.aedesInstance = null;

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
}
