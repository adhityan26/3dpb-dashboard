# Agent Core Extraction — Plan B (`AgentRuntime` + `AgentService`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the module-level singleton state in `apps/agent/src/main/{app-state,broker}.ts` into an `AgentRuntime` class, and the ~20 `ipcMain.handle("agent:*")` handler bodies in `apps/agent/src/main/ipc.ts` into an `AgentService` class wrapping it — both living in `packages/agent-core` — so a future headless Linux daemon (sub-project 2) can reuse the exact same logic over a different transport (HTTP/WS instead of Electron IPC) without duplicating it.

**Architecture:** `LocalBroker`/`PinRateLimiter` (pure, no Electron) wrap the existing MQTT broker logic. `AgentRuntime` owns all runtime state (engine, reporters, broker, update-check timer, flags) as instance fields, with `start()`/`stop()` lifecycle methods absorbing the Electron bootstrap sequence. `AgentService` wraps one `AgentRuntime` and exposes ~20 async methods 1:1 with today's IPC handlers. `apps/agent/src/main/ipc.ts` becomes a thin `ipcMain.handle` → `service.x()` wrapper; `apps/agent/src/main/index.ts` becomes a thin `runtime.start()`/`runtime.stop()` wrapper. Migration proceeds in 5 stages so the repo stays green at every commit (a temporary facade in `app-state.ts` keeps the existing `ipc.test.ts` passing unmodified until it's finally replaced).

**Tech Stack:** TypeScript, Vitest, `aedes` (embedded MQTT broker), Node `node:net`/`node:crypto`/`node:fs`, Electron (host only, not touched by core changes).

**Spec:** `docs/superpowers/specs/2026-09-08-agent-core-extraction-design.md` (sections "Plan B: ekstraksi `broker.ts`", "Plan B: `AgentRuntime`", "Plan B: `AgentService`" — read these before starting; this plan argues from them and does not repeat every rationale).

## Global Constraints

- **Pure refactor.** Electron desktop behavior must stay 100% identical after this plan, with zero new behavior changes (Plan A's one exception, `SAAS_BASE_URL`, is already done and not touched here).
- **Node 22 required** for every command: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- **Never `git add -A` / `git add .`** — always `git add <specific paths>` (repo `CLAUDE.md` rule; a prior incident swept another session's uncommitted files into the wrong commit).
- **`sync()` and `stop()` on `AgentRuntime` MUST share one private `teardownEngine()` method** — do not write the stop-engine/close-reporters sequence twice. This is the single most important invariant in this plan; a reporter-leak bug happened once before from exactly this duplication.
- **`AgentRuntime.start()` must never throw** — failures (broker/engine/layout) are caught and logged via the injected `Logger`, never propagated, so the host can always register its transport (IPC/HTTP) afterward regardless of what happened during `start()`.
- **`startUpdateChecks` behavior stays independent of `start()`'s other outcomes** — even if the broker fails to start inside `start()`, the update-check loop must still begin. Do not write `start()` as a single early-returning sequence that would skip it.
- **Preserve the exact existing `startEngine`-throws-inside-bootstrap behavior**: if `startEngine` throws during `start()`, `publishLayout` is also skipped (this differs from `sync()`, which still attempts to republish layout even when engine start fails) — replicate this exactly, do not "fix" it.
- **`net.Server` import style in the broker module must stay `import net from "node:net"`** (not `import { createServer } from "node:net"`) — two existing tests rely on `vi.spyOn(net, "createServer")`, which silently stops working if the import style changes.
- Every task ends with `pnpm --filter @3pb/agent-core test` and (where `apps/agent` is touched) `pnpm --filter @3pb/agent test` both green, plus `npx tsc --noEmit` clean in whichever package(s) changed.

---

## Reference: current `apps/agent/src/main/app-state.ts` (as of this plan, post-Plan-A)

```ts
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

let engine: Engine | null = null;
let brokerPort: number | null = null;
let brokerPin: string | null = null;
let reporters: MqttReporter[] = [];

export function setEngine(e: Engine | null): void { engine = e; }
export function getEngine(): Engine | null { return engine; }
export function setBrokerPort(port: number | null): void { brokerPort = port; }
export function getBrokerPort(): number | null { return brokerPort; }
export function setBrokerPin(pin: string | null): void { brokerPin = pin; }
export function getBrokerPin(): string | null { return brokerPin; }
export function setReporters(r: MqttReporter[]): void { reporters = r; }
export function getReporters(): MqttReporter[] { return reporters; }

let updateAvailable = false;

export function setUpdateAvailable(available: boolean): void { updateAvailable = available; }
export function getUpdateAvailable(): boolean { return updateAvailable; }

let credentialStoreDegraded = false;

export function setCredentialStoreDegraded(degraded: boolean): void { credentialStoreDegraded = degraded; }
export function getCredentialStoreDegraded(): boolean { return credentialStoreDegraded; }
```

## Reference: current `apps/agent/src/main/ipc.ts` handler bodies

Read the full file at `apps/agent/src/main/ipc.ts` before starting Tasks 8-11 — every `AgentService` method must be a faithful port of the matching handler body there. Do not paraphrase from memory; open the file.

---

### Task 1: `PinRateLimiter` — extract PIN rate-limit logic as a pure class

**Files:**
- Create: `packages/agent-core/src/pin-rate-limiter.ts`
- Create: `packages/agent-core/src/pin-rate-limiter.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Produces: `PinRateLimiter` class with `check(addr: string, presented: string, pin: string): { ok: boolean; locked: boolean }`. Used by Task 2 (`LocalBroker`).

This is a direct extraction of `checkPin`/`isLoopback`/`normalizeAddress`/the rate-limit `Map` logic from the current `apps/agent/src/main/broker.ts` (read it in full first — it's ~180 lines, shown in condensed form below). No behavior changes: same `MAX_ATTEMPTS = 5`, same `LOCKOUT_MS = 60_000`, same loopback-exemption rule, same "locked entries don't touch the counter" rule.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-core/src/pin-rate-limiter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PinRateLimiter } from "./pin-rate-limiter";

describe("PinRateLimiter", () => {
  let limiter: PinRateLimiter;

  beforeEach(() => {
    limiter = new PinRateLimiter();
  });

  it("PIN benar -> ok:true, locked:false", () => {
    expect(limiter.check("1.2.3.4", "1234", "1234")).toEqual({ ok: true, locked: false });
  });

  it("PIN salah -> ok:false, locked:false", () => {
    expect(limiter.check("1.2.3.4", "wrong", "1234")).toEqual({ ok: false, locked: false });
  });

  it("loopback (127.0.0.1) TIDAK PERNAH kena rate limit walau salah berkali-kali", () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("127.0.0.1", "wrong", "1234")).toEqual({ ok: false, locked: false });
    }
  });

  it("::1 (IPv6 loopback) juga exempt", () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("::1", "wrong", "1234")).toEqual({ ok: false, locked: false });
    }
  });

  it("non-loopback: 5 kali salah -> attempt ke-6 locked:true", () => {
    for (let i = 0; i < 5; i++) {
      limiter.check("9.9.9.9", "wrong", "1234");
    }
    expect(limiter.check("9.9.9.9", "wrong", "1234")).toEqual({ ok: false, locked: true });
  });

  it("locked entry: mencoba PIN BENAR selagi locked tetap ditolak (tidak dicek sama sekali)", () => {
    for (let i = 0; i < 5; i++) {
      limiter.check("9.9.9.9", "wrong", "1234");
    }
    expect(limiter.check("9.9.9.9", "1234", "1234")).toEqual({ ok: false, locked: true });
  });

  it("sukses menghapus entry rate-limit (bukan cuma reset count ke 0)", () => {
    limiter.check("9.9.9.9", "wrong", "1234");
    limiter.check("9.9.9.9", "wrong", "1234");
    limiter.check("9.9.9.9", "1234", "1234"); // sukses, entry harus dihapus
    // budget MAX_ATTEMPTS penuh lagi setelah sukses
    for (let i = 0; i < 4; i++) {
      expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(false);
    }
  });

  it("cooldown habis -> fresh start dengan budget MAX_ATTEMPTS penuh, bukan sisa count lama", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      limiter.check("9.9.9.9", "wrong", "1234");
    }
    expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(true);
    vi.advanceTimersByTime(60_001);
    // cooldown habis: 4 kali salah lagi harus TIDAK locked (budget baru, bukan 5+4=9)
    for (let i = 0; i < 4; i++) {
      expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(false);
    }
    expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(true); // ke-5 lagi setelah reset -> locked
    vi.useRealTimers();
  });

  it("::ffff:127.0.0.1 (IPv4-mapped IPv6) dianggap loopback juga", () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("::ffff:127.0.0.1", "wrong", "1234").locked).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/pin-rate-limiter.test.ts`
Expected: FAIL — `pin-rate-limiter.ts` doesn't exist.

- [ ] **Step 3: Implement `PinRateLimiter`**

```ts
// packages/agent-core/src/pin-rate-limiter.ts
// Diekstrak dari apps/agent/src/main/broker.ts (checkPin + rate-limit Map + normalizeAddress
// + isLoopback) supaya bisa dites langsung tanpa buka socket TCP, dan supaya LocalBroker bisa
// bikin instance baru per start() alih-alih state module-level yang tak pernah direset kecuali
// lewat hook khusus test.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

interface RateLimitEntry {
  count: number;
  lockedUntil: number;
}

/**
 * Normalisasi `::ffff:127.0.0.1` (IPv4-mapped IPv6, bentuk umum saat dual-stack listen)
 * jadi `127.0.0.1`. Alamat native IPv6 loopback `::1` TIDAK punya prefix ini -- dicek
 * terpisah di isLoopback.
 */
function normalizeAddress(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
}

function isLoopback(normalizedAddr: string): boolean {
  return normalizedAddr === "127.0.0.1" || normalizedAddr === "::1";
}

export class PinRateLimiter {
  private rateLimitMap = new Map<string, RateLimitEntry>();

  /**
   * `addr` boleh mentah (belum dinormalisasi) -- normalisasi dilakukan di sini, bukan caller.
   */
  check(rawAddr: string, presentedPassword: string, pin: string): { ok: boolean; locked: boolean } {
    const addr = normalizeAddress(rawAddr);
    const loopback = isLoopback(addr);
    const now = Date.now();

    if (!loopback) {
      const entry = this.rateLimitMap.get(addr);
      if (entry && entry.lockedUntil > 0) {
        if (now < entry.lockedUntil) {
          // Locked -- JANGAN bandingkan PIN, JANGAN sentuh counter/lockedUntil. Kalau tidak,
          // retry-loop legit (mis. CYD reconnect tiap beberapa detik) bisa memperpanjang
          // lockout dirinya sendiri tanpa akhir.
          return { ok: false, locked: true };
        }
        // Cooldown sudah habis -- fresh start, budget penuh MAX_ATTEMPTS lagi, bukan sisa count lama.
        this.rateLimitMap.delete(addr);
      }
    }

    if (presentedPassword === pin) {
      if (!loopback) this.rateLimitMap.delete(addr); // sukses -- buang entry, jangan cuma reset ke 0
      return { ok: true, locked: false };
    }

    if (!loopback) {
      const entry = this.rateLimitMap.get(addr) ?? { count: 0, lockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
      this.rateLimitMap.set(addr, entry);
    }
    return { ok: false, locked: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/pin-rate-limiter.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Add to barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./pin-rate-limiter";
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/pin-rate-limiter.ts packages/agent-core/src/pin-rate-limiter.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): extract PinRateLimiter from broker.ts rate-limit logic"
```

---

### Task 2: `LocalBroker` — wrap the MQTT broker as a class

**Files:**
- Create: `packages/agent-core/src/local-broker.ts`
- Create: `packages/agent-core/src/local-broker.test.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/package.json` (add `aedes`)

**Interfaces:**
- Consumes: `PinRateLimiter` (Task 1), `Logger` (already in `interfaces.ts`).
- Produces: `LocalBroker` class — `constructor(logger: Logger)`, `start(port: number, pin: string): Promise<LocalBrokerStartResult>`, `stop(): Promise<void>`, getter `port: number | null`. Used by Task 3 (rewire `apps/agent`) and Task 5 (`AgentRuntime`).

- [ ] **Step 1: Add dependency**

```bash
cd packages/agent-core && pnpm add aedes
```

- [ ] **Step 2: Write the failing test**

Read `apps/agent/src/main/broker.test.ts` in full first (276 lines) — every test case there must have an equivalent here, adapted from module-level functions (`startBroker(port, pin)`/`stopBroker()`) to instance methods (`new LocalBroker(logger); await broker.start(port, pin); await broker.stop()`). Below is a representative subset; port every remaining test case from the old file following the same pattern (connect with `mqtt` client, correct/incorrect PIN, rate-limit lockout via loopback bypass using a non-loopback-simulated client if the old file did so, `EADDRINUSE`, `net.createServer` spy for `EACCES`/`listen_error`, idempotent double-start, port-0 ephemeral binding).

```ts
// packages/agent-core/src/local-broker.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import net from "node:net";
import mqtt from "mqtt";
import { LocalBroker } from "./local-broker";
import type { Logger } from "./interfaces";

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("LocalBroker", () => {
  let broker: LocalBroker | undefined;

  afterEach(async () => {
    await broker?.stop();
    broker = undefined;
  });

  it("start() dengan port 0 (ephemeral) -> ok:true, port beneran dari OS", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, "1234");
    expect(result).toEqual({ ok: true, port: expect.any(Number) });
    if (result.ok) expect(result.port).toBeGreaterThan(0);
  });

  it("client MQTT dengan PIN benar -> connect sukses", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, "1234");
    if (!result.ok) throw new Error("broker gagal start");
    const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${result.port}`, {
      username: "agent",
      password: "1234",
    });
    await client.endAsync();
  });

  it("client MQTT dengan PIN salah -> connect ditolak", async () => {
    broker = new LocalBroker(makeLogger());
    const result = await broker.start(0, "1234");
    if (!result.ok) throw new Error("broker gagal start");
    await expect(
      mqtt.connectAsync(`mqtt://127.0.0.1:${result.port}`, {
        username: "agent",
        password: "salah",
        connectTimeout: 2000,
      }),
    ).rejects.toThrow();
  });

  it("start() dua kali berturut-turut tanpa stop() eksplisit -> idempotent, tidak leak", async () => {
    broker = new LocalBroker(makeLogger());
    const first = await broker.start(0, "1234");
    const second = await broker.start(0, "1234");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("EACCES (bukan EADDRINUSE) -> ok:false, reason:listen_error, logger.error dipanggil", async () => {
    const logger = makeLogger();
    broker = new LocalBroker(logger);
    const spy = vi.spyOn(net, "createServer").mockReturnValue({
      once: (event: string, cb: (err: NodeJS.ErrnoException) => void) => {
        if (event === "error") setImmediate(() => cb(Object.assign(new Error("permission denied"), { code: "EACCES" })));
      },
      listen: vi.fn(),
      close: (cb: () => void) => cb(),
      handle: vi.fn(),
    } as unknown as net.Server);
    const result = await broker.start(1, "1234");
    expect(result).toEqual({ ok: false, reason: "listen_error" });
    expect(logger.error).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stop() sebelum start() -> tidak throw", async () => {
    broker = new LocalBroker(makeLogger());
    await expect(broker.stop()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/local-broker.test.ts`
Expected: FAIL — `local-broker.ts` doesn't exist.

- [ ] **Step 4: Implement `LocalBroker`**

Direct port of the current `apps/agent/src/main/broker.ts` (shown in full at the top of this plan document — read it before writing this) into a class, using `PinRateLimiter` from Task 1 instead of the module-level `checkPin`/rate-limit `Map`, and the injected `Logger` instead of `import log from "electron-log/main"`. **Keep the `import net from "node:net"` style unchanged** (Global Constraints).

```ts
// packages/agent-core/src/local-broker.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/local-broker.test.ts`
Expected: PASS, same test count as your ported `broker.test.ts` equivalent.

- [ ] **Step 6: Add to barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./local-broker";
```

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/local-broker.ts packages/agent-core/src/local-broker.test.ts packages/agent-core/src/index.ts packages/agent-core/package.json pnpm-lock.yaml
git commit -m "feat(agent-core): add LocalBroker class wrapping aedes MQTT broker"
```

---

### Task 3: Rewire `apps/agent` to use `LocalBroker`, delete old `broker.ts`

**Files:**
- Modify: `apps/agent/src/main/index.ts`
- Delete: `apps/agent/src/main/broker.ts`, `apps/agent/src/main/broker.test.ts`

**Interfaces:**
- Consumes: `LocalBroker` (Task 2).

This is the first `apps/agent` file to change in Plan B. `ipc.ts` does **not** reference `broker.ts` directly (it reads `getBrokerPort()`/`getBrokerPin()` from `app-state.ts`), so `ipc.test.ts` is untouched by this task — verify that after this task.

- [ ] **Step 1: Update `index.ts`'s broker usage**

Change the import and the two call sites (`startBroker(1883, brokerPin)` and the absence of an explicit `stopBroker()` today — this task does not add a `stop()` call to `index.ts`, that's Task 13):

```ts
// apps/agent/src/main/index.ts — replace this line:
//   import { startBroker } from './broker'
// with:
import { LocalBroker } from '@3pb/agent-core'
```

```ts
// apps/agent/src/main/index.ts — add near the other singleton instances (after `const buildInfo = getElectronBuildInfo()`):
const broker = new LocalBroker(logger)
```

```ts
// apps/agent/src/main/index.ts — replace:
//   const brokerResult = await startBroker(1883, brokerPin)
// with:
const brokerResult = await broker.start(1883, brokerPin)
```

Leave every other line of `index.ts` untouched for this task.

- [ ] **Step 2: Delete old broker files**

```bash
rm apps/agent/src/main/broker.ts apps/agent/src/main/broker.test.ts
```

- [ ] **Step 3: Run apps/agent full suite, confirm green**

Run: `cd apps/agent && npx vitest run`
Expected: PASS, same total count as before minus `broker.test.ts`'s test count (those moved to `local-broker.test.ts` in Task 2). `ipc.test.ts` specifically must show no changes in outcome.

- [ ] **Step 4: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/index.ts
git rm apps/agent/src/main/broker.ts apps/agent/src/main/broker.test.ts
git commit -m "refactor(agent): use LocalBroker from @3pb/agent-core, remove local broker.ts"
```

---

### Task 4: Move `ActivationState`/`SyncResult`/`UpdateDeviceModelResult` types to core

**Files:**
- Create: `packages/agent-core/src/agent-service-types.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Modify: `apps/agent/src/renderer/screens/DashboardScreen.tsx`

**Interfaces:**
- Produces: `ActivationState`, `SyncResult`, `UpdateDeviceModelResult` types. Consumed by Task 9/10 (`AgentService`'s return types) and the two renderer/preload files above.

These are currently defined locally in `apps/agent/src/main/ipc.ts` (lines ~38-48, shown in the Reference section at the top) — they're `AgentService`'s eventual return types, so they belong in core.

- [ ] **Step 1: Create the types file**

```ts
// packages/agent-core/src/agent-service-types.ts
import type { SaasDevice, SaasFailKind } from "./saas-client";

export interface ActivationState {
  hasToken: boolean;
  devices: SaasDevice[];
  pairedShortCodes: string[];
}

export type UpdateDeviceModelResult = { ok: boolean; kind?: "invalid_model" };

export type SyncResult =
  | { ok: true; deviceCount: number }
  | { ok: false; kind: SaasFailKind | "engine_error" | "broker_unavailable" };
```

- [ ] **Step 2: Add to barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./agent-service-types";
```

- [ ] **Step 3: Remove the local definitions from `ipc.ts`, import from core instead**

```ts
// apps/agent/src/main/ipc.ts — DELETE lines 33-48 (the "Dipertahankan..." comment block and
// the three type definitions), and add to the existing `@3pb/agent-core` import list:
//   ActivationState, SyncResult, UpdateDeviceModelResult (as type imports)
```

Concretely, change:
```ts
import {
  loadCredentials, saveCredentials, type DeviceSecret,
  fetchDevices, patchDeviceModel, type SaasDevice, type SaasFailKind,
  uploadLogs,
  scanBambu, scanMoonraker,
  BambuFtpsClient, parseThreemf, type PlateInfo, type PrinterFileEntry,
  findPlateThumbnail, extractGcodeThumbnail,
  reconcileDevices,
} from "@3pb/agent-core";
```
to:
```ts
import {
  loadCredentials, saveCredentials, type DeviceSecret,
  fetchDevices, patchDeviceModel, type SaasFailKind,
  uploadLogs,
  scanBambu, scanMoonraker,
  BambuFtpsClient, parseThreemf, type PlateInfo, type PrinterFileEntry,
  findPlateThumbnail, extractGcodeThumbnail,
  reconcileDevices,
  type ActivationState, type SyncResult, type UpdateDeviceModelResult,
} from "@3pb/agent-core";
```
(`SaasDevice` was only used by the now-deleted `ActivationState` definition — drop it unless another part of `ipc.ts` still references it; check with a search before removing.)

Re-export them from `ipc.ts` too, since `preload/index.ts` and `DashboardScreen.tsx` currently import them from `"./ipc"`, not from `@3pb/agent-core` directly — keep those import paths working for this task (Task 11 will change `ipc.ts`'s shape more substantially and can revisit if needed):

```ts
// apps/agent/src/main/ipc.ts — add near the top, after the import block:
export type { ActivationState, SyncResult, UpdateDeviceModelResult } from "@3pb/agent-core";
```

- [ ] **Step 4: Verify preload/renderer still resolve (no changes needed to them for this task, since re-export preserves the import path)**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: no errors. If `preload/index.ts` or `DashboardScreen.tsx` error, check they still import from `"./ipc"` / `"../../main/ipc"` respectively — do not change those import paths in this task.

- [ ] **Step 5: Run full apps/agent + agent-core suites**

Run: `cd packages/agent-core && npx vitest run && cd ../../apps/agent && npx vitest run`
Expected: both green, no count changes.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/agent-service-types.ts packages/agent-core/src/index.ts apps/agent/src/main/ipc.ts
git commit -m "refactor(agent-core): move ActivationState/SyncResult/UpdateDeviceModelResult types to core"
```

---

### Task 5: `AgentRuntime` — state class with get/set methods

**Files:**
- Create: `packages/agent-core/src/agent-runtime.ts`
- Create: `packages/agent-core/src/agent-runtime.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `CredentialStore<TBlob>`, `PathProvider`, `Logger`, `LogFileProvider`, `BuildInfo` (existing `interfaces.ts`), `CredentialBlob` (`credential-store.ts`), `LocalBroker` (Task 2).
- Produces: `AgentRuntime` class with the get/set surface matching `app-state.ts` 1:1, plus a private `teardownEngine()`. **`start()`/`stop()` are added in Task 12** — this task only builds the state container, not lifecycle.

This task does NOT yet touch `apps/agent`. It builds `AgentRuntime` as pure new code in core, fully unit-tested in isolation.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-core/src/agent-runtime.test.ts
import { describe, it, expect, vi } from "vitest";
import { AgentRuntime } from "./agent-runtime";
import { LocalBroker } from "./local-broker";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";
import type { CredentialBlob } from "./credential-store";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

function makeDeps() {
  const store: CredentialStore<CredentialBlob> = {
    load: vi.fn(),
    save: vi.fn(),
    isEncryptionAvailable: () => true,
  };
  const pathProvider: PathProvider = { userDataDir: () => "/fake" };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider: LogFileProvider = { getLogFilePath: () => null };
  const buildInfo: BuildInfo = { version: "0.0.1", commitHash: "abc1234" };
  return { store, pathProvider, logger, logFileProvider, buildInfo };
}

describe("AgentRuntime", () => {
  it("state getter/setter round-trip: engine, brokerPort, brokerPin, reporters, updateAvailable, credentialStoreDegraded", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store,
      pathProvider,
      logger,
      logFileProvider,
      buildInfo,
      saasBaseUrl: "http://test.example.com",
      updatePlatform: "win",
    });

    expect(runtime.getEngine()).toBeNull();
    const fakeEngine = {} as Engine;
    runtime.setEngine(fakeEngine);
    expect(runtime.getEngine()).toBe(fakeEngine);

    expect(runtime.getBrokerPort()).toBeNull();
    runtime.setBrokerPort(1883);
    expect(runtime.getBrokerPort()).toBe(1883);

    expect(runtime.getBrokerPin()).toBeNull();
    runtime.setBrokerPin("1234");
    expect(runtime.getBrokerPin()).toBe("1234");

    expect(runtime.getReporters()).toEqual([]);
    const fakeReporters = [{}] as MqttReporter[];
    runtime.setReporters(fakeReporters);
    expect(runtime.getReporters()).toBe(fakeReporters);

    expect(runtime.getUpdateAvailable()).toBe(false);
    runtime.setUpdateAvailable(true);
    expect(runtime.getUpdateAvailable()).toBe(true);

    expect(runtime.getCredentialStoreDegraded()).toBe(false);
    runtime.setCredentialStoreDegraded(true);
    expect(runtime.getCredentialStoreDegraded()).toBe(true);
  });

  it("dua instance AgentRuntime punya state independen (bukan singleton tersembunyi)", () => {
    const depsA = makeDeps();
    const depsB = makeDeps();
    const runtimeA = new AgentRuntime({ ...depsA, saasBaseUrl: "a", updatePlatform: "win" });
    const runtimeB = new AgentRuntime({ ...depsB, saasBaseUrl: "b", updatePlatform: "mac" });
    runtimeA.setBrokerPort(1);
    runtimeB.setBrokerPort(2);
    expect(runtimeA.getBrokerPort()).toBe(1);
    expect(runtimeB.getBrokerPort()).toBe(2);
  });

  it("broker default: kalau tidak dioper lewat constructor, bikin LocalBroker sendiri", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    expect(runtime.broker).toBeInstanceOf(LocalBroker);
  });

  it("broker bisa di-inject lewat constructor (buat test AgentRuntime tanpa aedes beneran)", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const fakeBroker = { start: vi.fn(), stop: vi.fn(), port: null } as unknown as LocalBroker;
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win", broker: fakeBroker,
    });
    expect(runtime.broker).toBe(fakeBroker);
  });

  it("brokerPort default 1883 kalau tidak dioper lewat constructor", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    expect(runtime.configuredBrokerPort).toBe(1883);
  });

  it("teardownEngine(): stop engine lama LALU tutup semua reporter lama, urutan ini WAJIB", async () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    const callOrder: string[] = [];
    const fakeEngine = { stop: vi.fn(async () => { callOrder.push("engine.stop"); }) } as unknown as Engine;
    const fakeReporter = { close: vi.fn(async () => { callOrder.push("reporter.close"); }) } as unknown as MqttReporter;
    runtime.setEngine(fakeEngine);
    runtime.setReporters([fakeReporter]);

    await runtime.teardownEngine();

    expect(callOrder).toEqual(["engine.stop", "reporter.close"]);
    expect(runtime.getEngine()).toBeNull();
    expect(runtime.getReporters()).toEqual([]);
  });

  it("teardownEngine(): tanpa engine lama -> tidak crash, reporter tetap ditutup", async () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    const fakeReporter = { close: vi.fn(async () => {}) } as unknown as MqttReporter;
    runtime.setReporters([fakeReporter]);

    await runtime.teardownEngine();

    expect(fakeReporter.close).toHaveBeenCalledOnce();
    expect(runtime.getReporters()).toEqual([]);
  });

  it("teardownEngine(): reporter.close() gagal -> logger.error dipanggil, TIDAK throw, reporter list tetap dikosongkan", async () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    const fakeReporter = { close: vi.fn(async () => { throw new Error("close gagal"); }) } as unknown as MqttReporter;
    runtime.setReporters([fakeReporter]);

    await expect(runtime.teardownEngine()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(runtime.getReporters()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/agent-runtime.test.ts`
Expected: FAIL — `agent-runtime.ts` doesn't exist.

- [ ] **Step 3: Implement `AgentRuntime` (state + `teardownEngine` only — no `start()`/`stop()` yet, those are Task 12)**

```ts
// packages/agent-core/src/agent-runtime.ts
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";
import type { CredentialBlob } from "./credential-store";
import { LocalBroker } from "./local-broker";

export interface AgentRuntimeDeps {
  credentialStore: CredentialStore<CredentialBlob>;
  pathProvider: PathProvider;
  logger: Logger;
  logFileProvider: LogFileProvider;
  buildInfo: BuildInfo;
  saasBaseUrl: string;
  updatePlatform: "win" | "mac";
  brokerPort?: number;
  broker?: LocalBroker;
}

/**
 * Menyerap state module-level yang sebelumnya di apps/agent/src/main/app-state.ts (engine,
 * reporters, brokerPort, brokerPin, updateAvailable, credentialStoreDegraded) plus satu
 * LocalBroker per instance -- supaya bisa dites tanpa hook reset manual, dan supaya prinsip
 * "satu akun per daemon" (satu AgentRuntime per proses) eksplisit lewat instance, bukan
 * implisit lewat module scope.
 */
export class AgentRuntime {
  readonly credentialStore: CredentialStore<CredentialBlob>;
  readonly pathProvider: PathProvider;
  readonly logger: Logger;
  readonly logFileProvider: LogFileProvider;
  readonly buildInfo: BuildInfo;
  readonly saasBaseUrl: string;
  readonly updatePlatform: "win" | "mac";
  readonly configuredBrokerPort: number;
  readonly broker: LocalBroker;

  private engine: Engine | null = null;
  private reporters: MqttReporter[] = [];
  private brokerPort: number | null = null;
  private brokerPin: string | null = null;
  private updateAvailable = false;
  private credentialStoreDegraded = false;

  constructor(deps: AgentRuntimeDeps) {
    this.credentialStore = deps.credentialStore;
    this.pathProvider = deps.pathProvider;
    this.logger = deps.logger;
    this.logFileProvider = deps.logFileProvider;
    this.buildInfo = deps.buildInfo;
    this.saasBaseUrl = deps.saasBaseUrl;
    this.updatePlatform = deps.updatePlatform;
    this.configuredBrokerPort = deps.brokerPort ?? 1883;
    this.broker = deps.broker ?? new LocalBroker(deps.logger);
  }

  setEngine(e: Engine | null): void { this.engine = e; }
  getEngine(): Engine | null { return this.engine; }
  setBrokerPort(port: number | null): void { this.brokerPort = port; }
  getBrokerPort(): number | null { return this.brokerPort; }
  setBrokerPin(pin: string | null): void { this.brokerPin = pin; }
  getBrokerPin(): string | null { return this.brokerPin; }
  setReporters(r: MqttReporter[]): void { this.reporters = r; }
  getReporters(): MqttReporter[] { return this.reporters; }
  setUpdateAvailable(available: boolean): void { this.updateAvailable = available; }
  getUpdateAvailable(): boolean { return this.updateAvailable; }
  setCredentialStoreDegraded(degraded: boolean): void { this.credentialStoreDegraded = degraded; }
  getCredentialStoreDegraded(): boolean { return this.credentialStoreDegraded; }

  /**
   * WAJIB dipakai oleh sync() (AgentService) DAN stop() (Task 12) -- satu-satunya tempat
   * urutan stop-engine-lalu-tutup-reporter ditulis. Engine.stop() (packages/printer-monitor-core)
   * TIDAK PERNAH menutup reporter-nya sendiri, jadi siapa pun yang mengganti/mematikan Engine
   * WAJIB juga menutup reporter lama lewat method ini -- kalau tidak, tiap restart bikin 1
   * koneksi MQTT baru yang tak pernah ditutup (leak).
   */
  async teardownEngine(): Promise<void> {
    const oldEngine = this.engine;
    if (oldEngine) await oldEngine.stop();
    for (const r of this.reporters) {
      await r.close().catch((err) => this.logger.error("[agent-runtime] gagal tutup reporter lama", err));
    }
    this.engine = null;
    this.reporters = [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/agent-runtime.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add to barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./agent-runtime";
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/agent-runtime.ts packages/agent-core/src/agent-runtime.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add AgentRuntime state class with teardownEngine()"
```

---

### Task 6: `apps/agent/src/main/app-state.ts` becomes a facade over `AgentRuntime`

**Files:**
- Modify: `apps/agent/src/main/app-state.ts`
- Modify: `apps/agent/src/main/app-state.test.ts`

**Interfaces:**
- Consumes: `AgentRuntime` (Task 5).
- Produces: `initRuntime(runtime: AgentRuntime): void`, `getRuntime(): AgentRuntime` — new exports used by Task 7 (`index.ts`) and later tasks.

This is the pivot task: `app-state.ts`'s existing exported function *signatures* stay byte-identical (so every current caller — `ipc.ts`, `index.ts` — keeps working with zero changes), but their bodies now delegate to one module-level `AgentRuntime` instance instead of their own private variables. `ipc.test.ts` must stay green with **zero changes** after this task — that's the whole point of the facade.

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent/src/main/app-state.test.ts — REPLACE the whole file with this
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRuntime } from "@3pb/agent-core";
import {
  initRuntime, getRuntime,
  setEngine, getEngine, setBrokerPort, getBrokerPort, setBrokerPin, getBrokerPin,
  setReporters, getReporters, setUpdateAvailable, getUpdateAvailable,
  setCredentialStoreDegraded, getCredentialStoreDegraded,
} from "./app-state";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "@3pb/agent-core";
import type { CredentialBlob } from "@3pb/agent-core";
import type { Engine } from "@3pb/printer-monitor-core";

function makeRuntime(): AgentRuntime {
  const store: CredentialStore<CredentialBlob> = { load: vi.fn(), save: vi.fn(), isEncryptionAvailable: () => true };
  const pathProvider: PathProvider = { userDataDir: () => "/fake" };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider: LogFileProvider = { getLogFilePath: () => null };
  const buildInfo: BuildInfo = { version: "0.0.1", commitHash: "abc" };
  return new AgentRuntime({ credentialStore: store, pathProvider, logger, logFileProvider, buildInfo, saasBaseUrl: "x", updatePlatform: "win" });
}

describe("app-state facade", () => {
  beforeEach(() => {
    initRuntime(makeRuntime());
  });

  it("initRuntime()/getRuntime() round-trip", () => {
    const runtime = makeRuntime();
    initRuntime(runtime);
    expect(getRuntime()).toBe(runtime);
  });

  it("setEngine/getEngine mendelegasikan ke runtime aktif", () => {
    const fakeEngine = {} as Engine;
    setEngine(fakeEngine);
    expect(getEngine()).toBe(fakeEngine);
    expect(getRuntime().getEngine()).toBe(fakeEngine);
  });

  it("setBrokerPort/getBrokerPort mendelegasikan ke runtime aktif", () => {
    setBrokerPort(1883);
    expect(getBrokerPort()).toBe(1883);
  });

  it("setBrokerPin/getBrokerPin mendelegasikan ke runtime aktif", () => {
    setBrokerPin("1234");
    expect(getBrokerPin()).toBe("1234");
  });

  it("setReporters/getReporters mendelegasikan ke runtime aktif", () => {
    setReporters([]);
    expect(getReporters()).toEqual([]);
  });

  it("setUpdateAvailable/getUpdateAvailable mendelegasikan ke runtime aktif", () => {
    setUpdateAvailable(true);
    expect(getUpdateAvailable()).toBe(true);
  });

  it("setCredentialStoreDegraded/getCredentialStoreDegraded mendelegasikan ke runtime aktif", () => {
    setCredentialStoreDegraded(true);
    expect(getCredentialStoreDegraded()).toBe(true);
  });

  it("mengganti runtime lewat initRuntime() lagi -> state lama tidak ikut, state baru independen", () => {
    setBrokerPort(1);
    initRuntime(makeRuntime());
    expect(getBrokerPort()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/main/app-state.test.ts`
Expected: FAIL — `initRuntime`/`getRuntime` don't exist yet.

- [ ] **Step 3: Implement the facade**

```ts
// apps/agent/src/main/app-state.ts
import type { AgentRuntime } from "@3pb/agent-core";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

// Facade SEMENTARA di atas satu AgentRuntime module-level, supaya ipc.ts/index.ts yang
// sudah ada (dan ipc.test.ts) tidak perlu berubah sama sekali sampai Task 11 me-rewire
// ipc.ts jadi wrapper AgentService, dan Task 14 menghapus facade ini sepenuhnya. Lihat
// urutan 5-langkah di docs/superpowers/specs/2026-09-08-agent-core-extraction-design.md.
let runtime: AgentRuntime | null = null;

export function initRuntime(r: AgentRuntime): void {
  runtime = r;
}

export function getRuntime(): AgentRuntime {
  if (!runtime) throw new Error("AgentRuntime belum di-init -- panggil initRuntime() di awal bootstrap()");
  return runtime;
}

export function setEngine(e: Engine | null): void { getRuntime().setEngine(e); }
export function getEngine(): Engine | null { return getRuntime().getEngine(); }
export function setBrokerPort(port: number | null): void { getRuntime().setBrokerPort(port); }
export function getBrokerPort(): number | null { return getRuntime().getBrokerPort(); }
export function setBrokerPin(pin: string | null): void { getRuntime().setBrokerPin(pin); }
export function getBrokerPin(): string | null { return getRuntime().getBrokerPin(); }
export function setReporters(r: MqttReporter[]): void { getRuntime().setReporters(r); }
export function getReporters(): MqttReporter[] { return getRuntime().getReporters(); }
export function setUpdateAvailable(available: boolean): void { getRuntime().setUpdateAvailable(available); }
export function getUpdateAvailable(): boolean { return getRuntime().getUpdateAvailable(); }
export function setCredentialStoreDegraded(degraded: boolean): void { getRuntime().setCredentialStoreDegraded(degraded); }
export function getCredentialStoreDegraded(): boolean { return getRuntime().getCredentialStoreDegraded(); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/main/app-state.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: errors about `initRuntime` never being called — this is expected, Task 7 wires it up. If `tsc` fails for a DIFFERENT reason (not "runtime never initialized"-shaped), stop and investigate.

Actually — since `getRuntime()` throws at runtime, not at compile time, `tsc --noEmit` should pass cleanly here (the facade's function signatures are unchanged, so every existing caller in `ipc.ts` still typechecks). Confirm this.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/app-state.ts apps/agent/src/main/app-state.test.ts
git commit -m "refactor(agent): app-state.ts becomes a facade over AgentRuntime"
```

---

### Task 7: Wire `initRuntime()` into `index.ts`, confirm `ipc.test.ts` still green

**Files:**
- Modify: `apps/agent/src/main/index.ts`

**Interfaces:**
- Consumes: `initRuntime` (Task 6), `AgentRuntime` (Task 5).

This task makes `index.ts` actually construct and register the real `AgentRuntime` at the top of `bootstrap()`, before anything else runs — since `config` (needed for `saasBaseUrl`) is already resolved at the very top of `bootstrap()` today (before the `try` block, per the existing structure).

- [ ] **Step 1: Add the import and construct+register the runtime**

```ts
// apps/agent/src/main/index.ts — add to the @3pb/agent-core import list:
//   AgentRuntime
// and add to the ./app-state import list:
//   initRuntime
```

```ts
// apps/agent/src/main/index.ts — inside bootstrap(), right after `const config = await loadOrCreateConfig(...)`
// and BEFORE the `try {` block, add:
const updatePlatform = process.platform === 'darwin' ? 'mac' : 'win'
initRuntime(new AgentRuntime({
  credentialStore,
  pathProvider,
  logger,
  logFileProvider: new ElectronLogFileProvider(),
  buildInfo,
  saasBaseUrl: config.saasBaseUrl,
  updatePlatform,
}))
```

You'll need to import `ElectronLogFileProvider` from `./platform-electron` in `index.ts` (it isn't imported there yet — check the current import list, `index.ts` currently only imports `SafeStorageCredentialStore, ElectronPathProvider, ElectronLogAdapter, getElectronBuildInfo` from `./platform-electron`).

Leave the rest of `bootstrap()` completely untouched — it still calls `setEngine`/`setBrokerPort`/etc. from `./app-state`, which now delegate to the freshly-initialized runtime via the facade from Task 6.

- [ ] **Step 2: Run apps/agent full suite**

Run: `cd apps/agent && npx vitest run`
Expected: PASS, same counts as before this task. `ipc.test.ts` in particular must show **zero** behavior change — it never calls `bootstrap()`, it calls `registerIpcHandlers()` directly and manipulates `app-state`'s setters directly, which is unaffected by what `index.ts` does.

- [ ] **Step 3: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/main/index.ts
git commit -m "refactor(agent): construct and register real AgentRuntime at bootstrap start"
```

---

### Task 8: `AgentService` skeleton + non-file, non-sync methods (part 1 of 3)

**Files:**
- Create: `packages/agent-core/src/agent-service.ts`
- Create: `packages/agent-core/src/agent-service.test.ts`
- Create: `packages/agent-core/src/in-memory-credential-store.ts` (test fixture, but exported — reusable by later `AgentRuntime`/`start()` characterization tests in Task 12)
- Create: `packages/agent-core/src/in-memory-credential-store.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `AgentRuntime` (Task 5), `ActivationState`/`SyncResult`/`UpdateDeviceModelResult` (Task 4), core functions already in `agent-core` (`loadCredentials`, `saveCredentials`, `fetchDevices`, `patchDeviceModel`, `scanBambu`, `scanMoonraker`, `getLocalIp`, `reconcileDevices`).
- Produces: `AgentService` class (partial — methods #1-5, #7-13 in the spec's table; `sync()` is Task 9, file operations are Task 10), `InMemoryCredentialStore` fixture class. This task does NOT wire `ipc.ts` to use `AgentService` yet — that's Task 11.

**This task builds `InMemoryCredentialStore` first** — a fake `CredentialStore<CredentialBlob>` implementation, used across this and the next two tasks' test suites instead of mocking `loadCredentials`/`saveCredentials` individually (per the spec's recommendation).

- [ ] **Step 1: Write the failing test for `InMemoryCredentialStore`**

```ts
// packages/agent-core/src/in-memory-credential-store.test.ts
import { describe, it, expect } from "vitest";
import { InMemoryCredentialStore } from "./in-memory-credential-store";

describe("InMemoryCredentialStore", () => {
  it("load() sebelum save() apa pun -> status empty", async () => {
    const store = new InMemoryCredentialStore();
    expect(await store.load()).toEqual({ status: "empty" });
  });

  it("save() lalu load() -> balikin blob yang sama, status ok", async () => {
    const store = new InMemoryCredentialStore();
    await store.save({ agentToken: "tok", devices: {}, brokerPin: null });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "tok", devices: {}, brokerPin: null } });
  });

  it("isEncryptionAvailable() selalu true (fixture test, bukan simulasi degraded)", () => {
    const store = new InMemoryCredentialStore();
    expect(store.isEncryptionAvailable()).toBe(true);
  });

  it("bisa di-seed langsung lewat constructor, buat setup test yang butuh state awal", async () => {
    const store = new InMemoryCredentialStore({ agentToken: "seeded", devices: {}, brokerPin: "1234" });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "seeded", devices: {}, brokerPin: "1234" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/in-memory-credential-store.test.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement `InMemoryCredentialStore`**

Read `packages/agent-core/src/credential-store.ts` first to get the exact `CredentialBlob` shape before writing this.

```ts
// packages/agent-core/src/in-memory-credential-store.ts
import type { CredentialStore, CredentialLoadResult } from "./interfaces";
import type { CredentialBlob } from "./credential-store";

/**
 * Fake CredentialStore in-memory buat test AgentService/AgentRuntime -- lebih bermakna
 * daripada mock loadCredentials/saveCredentials satu-satu (assertion bisa baca-balik state
 * yang beneran tersimpan, bukan cuma cek mock dipanggil dengan argumen tertentu).
 */
export class InMemoryCredentialStore implements CredentialStore<CredentialBlob> {
  private blob: CredentialBlob | null;

  constructor(seed: CredentialBlob | null = null) {
    this.blob = seed;
  }

  async load(): Promise<CredentialLoadResult<CredentialBlob>> {
    if (!this.blob) return { status: "empty" };
    return { status: "ok", blob: this.blob };
  }

  async save(blob: CredentialBlob): Promise<void> {
    this.blob = blob;
  }

  isEncryptionAvailable(): boolean {
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/in-memory-credential-store.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add to barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./in-memory-credential-store";
```

- [ ] **Step 6: Write the failing test for `AgentService` (part 1 — non-file, non-sync methods)**

Read `apps/agent/src/main/ipc.ts` in full (shown in the Reference section at the top of this plan) before writing this — every test here must match that file's actual handler behavior for the corresponding channel.

```ts
// packages/agent-core/src/agent-service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService } from "./agent-service";
import { AgentRuntime } from "./agent-runtime";
import { InMemoryCredentialStore } from "./in-memory-credential-store";
import * as saasClient from "./saas-client";
import * as discovery1 from "./discovery/bambu-ssdp";
import * as discovery2 from "./discovery/moonraker-mdns";
import type { PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";

vi.mock("./saas-client", async () => {
  const actual = await vi.importActual<typeof import("./saas-client")>("./saas-client");
  return { ...actual, fetchDevices: vi.fn(), patchDeviceModel: vi.fn() };
});
vi.mock("./discovery/bambu-ssdp", async () => {
  const actual = await vi.importActual<typeof import("./discovery/bambu-ssdp")>("./discovery/bambu-ssdp");
  return { ...actual, scanBambu: vi.fn() };
});
vi.mock("./discovery/moonraker-mdns", async () => {
  const actual = await vi.importActual<typeof import("./discovery/moonraker-mdns")>("./discovery/moonraker-mdns");
  return { ...actual, scanMoonraker: vi.fn() };
});

function makeFixture(store = new InMemoryCredentialStore()) {
  const pathProvider: PathProvider = { userDataDir: () => "/fake" };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider: LogFileProvider = { getLogFilePath: () => null };
  const buildInfo: BuildInfo = { version: "0.0.1", commitHash: "abc1234" };
  const runtime = new AgentRuntime({
    credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
    saasBaseUrl: "http://test.example.com", updatePlatform: "win",
  });
  const service = new AgentService(runtime);
  return { service, runtime, store, logger };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentService.activate", () => {
  it("fetchDevices ok -> simpan token, balikin result", async () => {
    const { service, store } = makeFixture();
    vi.mocked(saasClient.fetchDevices).mockResolvedValue({ ok: true, data: [] });
    const result = await service.activate("tok123");
    expect(result).toEqual({ ok: true, data: [] });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "tok123", devices: {}, brokerPin: null } });
  });

  it("fetchDevices gagal -> token TIDAK disimpan", async () => {
    const { service, store } = makeFixture();
    vi.mocked(saasClient.fetchDevices).mockResolvedValue({ ok: false, kind: "invalid_token" });
    await service.activate("bad");
    expect(await store.load()).toEqual({ status: "empty" });
  });
});

describe("AgentService.scanLan", () => {
  it("gabungkan hasil scanBambu + scanMoonraker", async () => {
    const { service } = makeFixture();
    vi.mocked(discovery1.scanBambu).mockResolvedValue({ ok: true, printers: [] });
    vi.mocked(discovery2.scanMoonraker).mockResolvedValue([]);
    expect(await service.scanLan()).toEqual({ bambu: { ok: true, printers: [] }, moonraker: [] });
  });
});

describe("AgentService.pairDevice / forgetDevice", () => {
  it("pairDevice: RMW blob.devices[shortCode] = secret", async () => {
    const { service, store } = makeFixture();
    const secret = { ip: "1.2.3.4", accessCode: "x", serial: "" };
    await service.pairDevice("ABC", secret);
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: undefined, devices: { ABC: secret }, brokerPin: null } });
  });

  it("forgetDevice: hapus dari blob.devices", async () => {
    const { service, store } = makeFixture(new InMemoryCredentialStore({ agentToken: undefined, devices: { ABC: { ip: "x", accessCode: "y", serial: "" } }, brokerPin: null }));
    await service.forgetDevice("ABC");
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: undefined, devices: {}, brokerPin: null } });
  });
});

describe("AgentService.updateDeviceModel", () => {
  it("tanpa agentToken -> ok:false", async () => {
    const { service } = makeFixture();
    expect(await service.updateDeviceModel("ABC", "model-x")).toEqual({ ok: false });
  });

  it("patchDeviceModel sukses -> ok:true", async () => {
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    vi.mocked(saasClient.patchDeviceModel).mockResolvedValue({ ok: true, data: { model: "model-x" } });
    expect(await service.updateDeviceModel("ABC", "model-x")).toEqual({ ok: true });
  });

  it("patchDeviceModel kind invalid_model -> diteruskan", async () => {
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    vi.mocked(saasClient.patchDeviceModel).mockResolvedValue({ ok: false, kind: "invalid_model" });
    expect(await service.updateDeviceModel("ABC", "model-x")).toEqual({ ok: false, kind: "invalid_model" });
  });
});

describe("AgentService.getSnapshot / getBrokerInfo / sendPrinterCommand", () => {
  it("getSnapshot: tanpa engine -> {payload:[]}", async () => {
    const { service } = makeFixture();
    expect(await service.getSnapshot()).toEqual({ payload: [] });
  });

  it("getBrokerInfo: baca ip/port/pin dari runtime saat ini", async () => {
    const { service, runtime } = makeFixture();
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const result = await service.getBrokerInfo();
    expect(result.port).toBe(1883);
    expect(result.pin).toBe("1234");
  });

  it("sendPrinterCommand: tanpa engine -> engine_not_running", async () => {
    const { service } = makeFixture();
    expect(await service.sendPrinterCommand("dev1", { type: "pause" } as never)).toEqual({ ok: false, message: "engine_not_running" });
  });
});

describe("AgentService.getCredentialStoreStatus / getUpdateStatus", () => {
  it("baca state runtime saat ini (bukan snapshot beku)", async () => {
    const { service, runtime } = makeFixture();
    runtime.setCredentialStoreDegraded(true);
    expect(await service.getCredentialStoreStatus()).toEqual({ degraded: true });
    runtime.setUpdateAvailable(true);
    expect(await service.getUpdateStatus()).toEqual({ updateAvailable: true });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: FAIL — `agent-service.ts` doesn't exist.

- [ ] **Step 8: Implement `AgentService` (part 1)**

Port each handler body from `apps/agent/src/main/ipc.ts` (Reference section above) into a class method. `sync()` and the file operations are stubbed here with `throw new Error("not implemented")` — Tasks 9 and 10 fill them in (this keeps this task's diff reviewable; do not skip writing the stubs, since the class must compile).

```ts
// packages/agent-core/src/agent-service.ts
import type { AgentRuntime } from "./agent-runtime";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, patchDeviceModel } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";
import { getLocalIp } from "./local-network";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";
import type { ActivationState, SyncResult, UpdateDeviceModelResult } from "./agent-service-types";
import type { FetchResult } from "./saas-client";
import type { SaasDevice } from "./saas-client";

/**
 * Kontrak transport-agnostic yang dipakai Electron IPC sekarang dan HTTP/WS daemon nanti
 * (sub-project 2) — jangan diseragamkan tanpa audit semua caller:
 * - Method operasi file (listFiles/uploadFile/downloadFile/deleteFile/renameFile/
 *   parseThreemfForDevice/getFileThumbnail) THROW pada error (mis. Error("device_not_found"),
 *   error FTPS mentah) -- Electron IPC otomatis serialisasi jadi rejected promise di renderer;
 *   transport HTTP nanti butuh mapping eksplisit throw -> status code.
 * - Method lainnya RETURN discriminated union ({ok:false, kind:...}), tidak pernah throw untuk
 *   kegagalan yang diharapkan (network error, token invalid, dsb).
 * - sync() TIDAK re-entrant -- dua panggilan bersamaan bisa race pada teardownEngine()/
 *   startEngine(). Aman di Electron IPC sekarang (butuh klik ganda cepat), tapi WAJIB dikasih
 *   guard coalescing in-flight sebelum sub-project 2 (HTTP concurrent) mulai -- lihat "Out of
 *   scope" di spec agent-core-extraction-design.md.
 */
export class AgentService {
  constructor(private readonly runtime: AgentRuntime) {}

  async activate(token: string): Promise<FetchResult<SaasDevice[]>> {
    const { saasBaseUrl, buildInfo, logger, credentialStore } = this.runtime;
    const result = await fetchDevices(saasBaseUrl, token, buildInfo, logger);
    if (result.ok) {
      const blob = await loadCredentials(credentialStore);
      await saveCredentials(credentialStore, { ...blob, agentToken: token });
    }
    return result;
  }

  async scanLan(): Promise<{ bambu: Awaited<ReturnType<typeof scanBambu>>; moonraker: Awaited<ReturnType<typeof scanMoonraker>> }> {
    const [bambuResult, moonraker] = await Promise.all([scanBambu(), scanMoonraker()]);
    return { bambu: bambuResult, moonraker };
  }

  async pairDevice(shortCode: string, secret: DeviceSecret): Promise<void> {
    const { credentialStore } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    blob.devices[shortCode] = secret;
    await saveCredentials(credentialStore, blob);
  }

  async forgetDevice(shortCode: string): Promise<void> {
    const { credentialStore } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    delete blob.devices[shortCode];
    await saveCredentials(credentialStore, blob);
  }

  async updateDeviceModel(shortCode: string, model: string): Promise<UpdateDeviceModelResult> {
    const { credentialStore, saasBaseUrl } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false };
    const result = await patchDeviceModel(saasBaseUrl, blob.agentToken, shortCode, model);
    if (result.ok) return { ok: true };
    if (result.kind === "invalid_model") return { ok: false, kind: "invalid_model" };
    return { ok: false };
  }

  async sync(): Promise<SyncResult> {
    throw new Error("not implemented — see Task 9");
  }

  async getActivationState(): Promise<ActivationState> {
    const { credentialStore, saasBaseUrl, pathProvider, buildInfo, logger } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { hasToken: false, devices: [], pairedShortCodes: [] };
    const { reconcileDevices } = await import("./startup");
    const { devices, paired } = await reconcileDevices(saasBaseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);
    return { hasToken: true, devices, pairedShortCodes: paired.map((p) => p.shortCode) };
  }

  async getSnapshot() {
    return this.runtime.getEngine()?.snapshot() ?? { payload: [] };
  }

  async getBrokerInfo() {
    return { ip: getLocalIp(), port: this.runtime.getBrokerPort(), pin: this.runtime.getBrokerPin() };
  }

  async sendPrinterCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult> {
    const engine = this.runtime.getEngine();
    if (!engine) return { ok: false, message: "engine_not_running" };
    return engine.sendCommand(deviceId, cmd);
  }

  async getCredentialStoreStatus() {
    return { degraded: this.runtime.getCredentialStoreDegraded() };
  }

  async getUpdateStatus() {
    return { updateAvailable: this.runtime.getUpdateAvailable() };
  }

  async sendLogs(): Promise<{ ok: boolean; reason?: string }> {
    throw new Error("not implemented — see Task 10");
  }

  async listFiles(_shortCode: string, _path: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async uploadFile(_shortCode: string, _localPath: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async downloadFile(_shortCode: string, _remotePath: string, _localPath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async deleteFile(_shortCode: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async renameFile(_shortCode: string, _oldPath: string, _newPath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async parseThreemf(_shortCode: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async getFileThumbnail(_shortCode: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
}
```

Note: `getActivationState()` uses a dynamic `import("./startup")` for `reconcileDevices` here only to avoid a circular-import risk between `agent-service.ts` and `startup.ts` at module-graph-construction time during this partial task — **Task 9 replaces this with a normal top-level import once `sync()` (which also needs `reconcileDevices`) is implemented**, since by then the actual import graph is settled. Flag this as a known temporary wart in your task report; Task 9's step 1 explicitly fixes it.

- [ ] **Step 9: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: PASS, 11 tests (the `sync`/file-operation methods aren't tested here — they're not implemented yet).

- [ ] **Step 10: Add to barrel, typecheck**

```ts
// packages/agent-core/src/index.ts
export * from "./agent-service";
```

Run: `cd packages/agent-core && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/agent-core/src/agent-service.ts packages/agent-core/src/agent-service.test.ts packages/agent-core/src/in-memory-credential-store.ts packages/agent-core/src/in-memory-credential-store.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add AgentService skeleton with non-file, non-sync methods"
```

---

### Task 9: `AgentService.sync()` (part 2 of 3)

**Files:**
- Modify: `packages/agent-core/src/agent-service.ts`
- Modify: `packages/agent-core/src/agent-service.test.ts`

**Interfaces:**
- Consumes: `AgentRuntime.teardownEngine()` (Task 5), `startEngine`, `publishLayout`, `reconcileDevices` (all already in `agent-core`).

This is the highest-risk method in the whole plan — it's the exact operation whose stop-engine/close-reporter/start-engine/republish-layout ordering caused a real leak bug before. It MUST use `runtime.teardownEngine()` rather than re-implementing the stop-and-close sequence inline.

- [ ] **Step 1: Fix the temporary dynamic import from Task 8, write the failing tests for `sync()`**

First, replace `getActivationState()`'s dynamic `import("./startup")` with a normal top-level import (now safe, since this task also needs it):

```ts
// packages/agent-core/src/agent-service.ts — change the top-level imports to add:
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
```

And in `getActivationState()`, replace:
```ts
const { reconcileDevices } = await import("./startup");
const { devices, paired } = await reconcileDevices(...);
```
with:
```ts
const { devices, paired } = await reconcileDevices(...);
```

Then add these tests to `agent-service.test.ts` (add the necessary `vi.mock` blocks for `./startup`, `./engine-manager`, `./layout-publisher` alongside the existing ones at the top of the file):

```ts
// packages/agent-core/src/agent-service.test.ts — add near the top, alongside existing vi.mock calls:
vi.mock("./startup", async () => {
  const actual = await vi.importActual<typeof import("./startup")>("./startup");
  return { ...actual, reconcileDevices: vi.fn() };
});
vi.mock("./engine-manager", async () => {
  const actual = await vi.importActual<typeof import("./engine-manager")>("./engine-manager");
  return { ...actual, startEngine: vi.fn() };
});
vi.mock("./layout-publisher", async () => {
  const actual = await vi.importActual<typeof import("./layout-publisher")>("./layout-publisher");
  return { ...actual, publishLayout: vi.fn() };
});
```

```ts
// packages/agent-core/src/agent-service.test.ts — add:
import * as startup from "./startup";
import * as engineManager from "./engine-manager";
import * as layoutPublisher from "./layout-publisher";

describe("AgentService.sync", () => {
  it("tanpa agentToken -> invalid_token, tidak sentuh broker/engine", async () => {
    const { service } = makeFixture();
    expect(await service.sync()).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("brokerPort null -> broker_unavailable", async () => {
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    expect(await service.sync()).toEqual({ ok: false, kind: "broker_unavailable" });
  });

  it("sukses dengan device paired -> teardownEngine dipanggil, engine baru di-start, layout di-republish, ok:true", async () => {
    const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const teardownSpy = vi.spyOn(runtime, "teardownEngine");
    const pairedDevice = { shortCode: "ABC", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", accessCode: "x", serial: "" } };
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [pairedDevice] });
    const fakeEngine = {};
    vi.mocked(engineManager.startEngine).mockResolvedValue({ engine: fakeEngine as never, reporters: [] });
    vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: true });

    const result = await service.sync();

    expect(teardownSpy).toHaveBeenCalledOnce();
    expect(engineManager.startEngine).toHaveBeenCalledWith([pairedDevice], 1883, "1234", runtime.logger);
    expect(runtime.getEngine()).toBe(fakeEngine);
    expect(layoutPublisher.publishLayout).toHaveBeenCalledWith(runtime.saasBaseUrl, "tok", 1883, "default", "1234", runtime.logger);
    expect(result).toEqual({ ok: true, deviceCount: 1 });
  });

  it("tanpa device paired -> engine di-set null, TETAP publish layout", async () => {
    const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [] });
    vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: false });

    const result = await service.sync();

    expect(runtime.getEngine()).toBeNull();
    expect(layoutPublisher.publishLayout).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, deviceCount: 0 });
  });

  it("startEngine throw -> engine di-set null, ok:false engine_error, logger.error dipanggil", async () => {
    const { service, runtime, logger } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const pairedDevice = { shortCode: "ABC", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", accessCode: "", serial: "" } };
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [pairedDevice] });
    vi.mocked(engineManager.startEngine).mockRejectedValue(new Error("accessCode kosong"));

    const result = await service.sync();

    expect(runtime.getEngine()).toBeNull();
    expect(result).toEqual({ ok: false, kind: "engine_error" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("fetchResult gagal -> tetap coba sync engine, tapi return fetchResult (bukan ok:true)", async () => {
    const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: false, kind: "network_error" }, devices: [], paired: [] });
    vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: false });

    const result = await service.sync();

    expect(result).toEqual({ ok: false, kind: "network_error" });
  });

  it("publishLayout gagal (reject) -> non-fatal, sync tetap ok:true, logger.error dipanggil", async () => {
    const { service, runtime, logger } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [] });
    vi.mocked(layoutPublisher.publishLayout).mockRejectedValue(new Error("mqtt down"));

    const result = await service.sync();

    expect(result).toEqual({ ok: true, deviceCount: 0 });
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: FAIL — `sync()` still throws "not implemented".

- [ ] **Step 3: Implement `sync()`**

```ts
// packages/agent-core/src/agent-service.ts — replace the sync() stub with:
async sync(): Promise<SyncResult> {
  const { credentialStore, saasBaseUrl, pathProvider, buildInfo, logger } = this.runtime;
  const blob = await loadCredentials(credentialStore);
  if (!blob.agentToken) return { ok: false, kind: "invalid_token" };

  const brokerPort = this.runtime.getBrokerPort();
  if (brokerPort === null) return { ok: false, kind: "broker_unavailable" };
  const brokerPin = this.runtime.getBrokerPin() as string;

  const { fetchResult, paired } = await reconcileDevices(saasBaseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);

  await this.runtime.teardownEngine();

  if (paired.length > 0) {
    try {
      const started = await startEngine(paired, brokerPort, brokerPin, logger);
      this.runtime.setEngine(started.engine);
      this.runtime.setReporters(started.reporters);
    } catch (err) {
      logger.error("[agent-service] sync gagal restart engine dengan device terbaru", err);
      this.runtime.setEngine(null);
      return { ok: false, kind: "engine_error" };
    }
  } else {
    this.runtime.setEngine(null);
  }

  await publishLayout(saasBaseUrl, blob.agentToken, brokerPort, "default", brokerPin, logger).catch((err) => {
    logger.error("[agent-service] sync gagal republish layout (non-fatal)", err);
  });

  if (!fetchResult.ok) return fetchResult;
  return { ok: true, deviceCount: paired.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: PASS, 18 tests total (11 from Task 8 + 7 `sync()` tests).

- [ ] **Step 5: Typecheck**

Run: `cd packages/agent-core && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/agent-service.ts packages/agent-core/src/agent-service.test.ts
git commit -m "feat(agent-core): implement AgentService.sync() using teardownEngine()"
```

---

### Task 10: `AgentService` file operations (part 3 of 3)

**Files:**
- Modify: `packages/agent-core/src/agent-service.ts`
- Modify: `packages/agent-core/src/agent-service.test.ts`

**Interfaces:**
- Consumes: `BambuFtpsClient`, `parseThreemf`, `findPlateThumbnail`, `extractGcodeThumbnail`, `uploadLogs` (all already in `agent-core`), `node:fs/promises`, `node:os`, `node:crypto`, `node:path`, `jszip`.

Ports the remaining 8 handler bodies (`send-logs`, `file-list/upload/download/delete/rename`, `file-parse-3mf`, `file-thumbnail`) from `ipc.ts` (Reference section above) — these are the ones that **throw** rather than return a discriminated union (per the spec's documented throw-vs-return contract), and the two temp-file ones (`parseThreemf`, `getFileThumbnail`) that download to `os.tmpdir()` first.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/agent-core/src/agent-service.test.ts — add these imports at the top:
import { readFile, rm, stat } from "node:fs/promises";
import * as bambuFtpsClient from "./file-manager/bambu-ftps-client";
import * as threemfParser from "./file-manager/threemf-parser";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), rm: vi.fn(), stat: vi.fn(), writeFile: vi.fn() }));
vi.mock("./file-manager/bambu-ftps-client", async () => {
  const actual = await vi.importActual<typeof import("./file-manager/bambu-ftps-client")>("./file-manager/bambu-ftps-client");
  return { ...actual, BambuFtpsClient: vi.fn() };
});
```

```ts
// packages/agent-core/src/agent-service.test.ts — add:
describe("AgentService.sendLogs", () => {
  it("tanpa agentToken -> no_token", async () => {
    const { service } = makeFixture();
    expect(await service.sendLogs()).toEqual({ ok: false, reason: "no_token" });
  });

  it("logFileProvider tidak punya path -> read_failed", async () => {
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    expect(await service.sendLogs()).toEqual({ ok: false, reason: "read_failed" });
  });

  it("file lebih besar dari 5MB -> too_large", async () => {
    const store = new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null });
    const pathProvider = { userDataDir: () => "/fake" };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger,
      logFileProvider: { getLogFilePath: () => "/fake/agent.log" },
      buildInfo: { version: "0.0.1", commitHash: "abc" },
      saasBaseUrl: "http://test.example.com", updatePlatform: "win",
    });
    const service = new AgentService(runtime);
    vi.mocked(stat).mockResolvedValue({ size: 6 * 1024 * 1024 } as never);
    expect(await service.sendLogs()).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("AgentService.getFileClientFor (via listFiles)", () => {
  it("device tak terpasang -> throw device_not_found", async () => {
    const { service } = makeFixture();
    await expect(service.listFiles("UNKNOWN", "/")).rejects.toThrow("device_not_found");
  });

  it("device terpasang -> BambuFtpsClient.list() dipanggil dengan ip/accessCode yang benar", async () => {
    const secret = { ip: "1.2.3.4", accessCode: "code", serial: "" };
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: undefined, devices: { ABC: secret }, brokerPin: null }));
    const listMock = vi.fn().mockResolvedValue([]);
    vi.mocked(bambuFtpsClient.BambuFtpsClient).mockImplementation(() => ({ list: listMock }) as never);
    await service.listFiles("ABC", "/");
    expect(bambuFtpsClient.BambuFtpsClient).toHaveBeenCalledWith("1.2.3.4", "code");
    expect(listMock).toHaveBeenCalledWith("/");
  });
});

describe("AgentService.getFileThumbnail", () => {
  it("extension bukan .gcode atau .gcode.3mf -> null, tidak buka koneksi FTPS", async () => {
    const { service } = makeFixture();
    expect(await service.getFileThumbnail("ABC", "file.txt")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: FAIL — file methods still throw "not implemented".

- [ ] **Step 3: Implement the file operations**

```ts
// packages/agent-core/src/agent-service.ts — add to top-level imports:
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { BambuFtpsClient } from "./file-manager/bambu-ftps-client";
import { parseThreemf } from "./file-manager/threemf-parser";
import { findPlateThumbnail, extractGcodeThumbnail } from "./file-manager/thumbnail";
import { uploadLogs } from "./saas-client";
import type { PlateInfo, PrinterFileEntry } from "./file-manager/types";
```

```ts
// packages/agent-core/src/agent-service.ts — replace the 8 stub methods with:
private static readonly MAX_LOG_BYTES = 5 * 1024 * 1024;

async sendLogs(): Promise<{ ok: boolean; reason?: string }> {
  const { credentialStore, logFileProvider, saasBaseUrl, logger } = this.runtime;
  const blob = await loadCredentials(credentialStore);
  if (!blob.agentToken) return { ok: false, reason: "no_token" };

  const logPath = logFileProvider.getLogFilePath();
  if (!logPath) return { ok: false, reason: "read_failed" };

  let stats;
  try {
    stats = await stat(logPath);
  } catch {
    return { ok: false, reason: "read_failed" };
  }
  if (stats.size > AgentService.MAX_LOG_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  let content: Buffer;
  try {
    content = await readFile(logPath);
  } catch {
    return { ok: false, reason: "read_failed" };
  }

  return uploadLogs(saasBaseUrl, blob.agentToken, content, logger);
}

private async getFileClientFor(shortCode: string): Promise<BambuFtpsClient> {
  const blob = await loadCredentials(this.runtime.credentialStore);
  const secret = blob.devices[shortCode];
  if (!secret) throw new Error("device_not_found");
  return new BambuFtpsClient(secret.ip, secret.accessCode);
}

async listFiles(shortCode: string, path: string): Promise<PrinterFileEntry[]> {
  const client = await this.getFileClientFor(shortCode);
  return client.list(path);
}

async uploadFile(shortCode: string, localPath: string, remotePath: string): Promise<void> {
  const client = await this.getFileClientFor(shortCode);
  await client.upload(localPath, remotePath);
}

async downloadFile(shortCode: string, remotePath: string, localPath: string): Promise<void> {
  const client = await this.getFileClientFor(shortCode);
  await client.download(remotePath, localPath);
}

async deleteFile(shortCode: string, remotePath: string): Promise<void> {
  const client = await this.getFileClientFor(shortCode);
  await client.delete(remotePath);
}

async renameFile(shortCode: string, oldPath: string, newPath: string): Promise<void> {
  const client = await this.getFileClientFor(shortCode);
  await client.rename(oldPath, newPath);
}

async parseThreemfForDevice(shortCode: string, remotePath: string): Promise<PlateInfo[]> {
  const client = await this.getFileClientFor(shortCode);
  const fileName = remotePath.split("/").pop() ?? "download.gcode.3mf";
  const tempPath = join(tmpdir(), `agent-3mf-${Date.now()}-${randomUUID()}-${fileName}`);
  try {
    await client.download(remotePath, tempPath);
    const buffer = await readFile(tempPath);
    return await parseThreemf(buffer);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async getFileThumbnail(shortCode: string, remotePath: string): Promise<string | null> {
  const isThreemf = remotePath.endsWith(".gcode.3mf");
  const isPlainGcode = !isThreemf && remotePath.endsWith(".gcode");
  if (!isThreemf && !isPlainGcode) return null;
  const client = await this.getFileClientFor(shortCode);
  const fileName = remotePath.split("/").pop() ?? "thumb";
  const tempPath = join(tmpdir(), `agent-thumb-${Date.now()}-${randomUUID()}-${fileName}`);
  try {
    await client.download(remotePath, tempPath);
    if (isPlainGcode) {
      const text = await readFile(tempPath, "utf8");
      return extractGcodeThumbnail(text);
    }
    const buffer = await readFile(tempPath);
    const zip = await JSZip.loadAsync(buffer);
    const png = findPlateThumbnail(zip);
    if (!png) return null;
    const base64 = await png.async("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  } finally {
    await rm(tempPath, { force: true });
  }
}
```

**Naming note:** the method is named `parseThreemfForDevice` here (not `parseThreemf`) to avoid shadowing the imported `parseThreemf` function from `./file-manager/threemf-parser` within the same class — pick whichever name you prefer as long as it's consistent with Task 11's `ipc.ts` rewiring (which must call whatever name you choose here).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: PASS, all tests including the new ones from this task.

- [ ] **Step 5: Full package suite + typecheck**

Run: `cd packages/agent-core && npx vitest run && npx tsc --noEmit`
Expected: all green, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/agent-service.ts packages/agent-core/src/agent-service.test.ts
git commit -m "feat(agent-core): implement AgentService file operations (list/upload/download/delete/rename/parse3mf/thumbnail/sendLogs)"
```

---

### Task 11: Rewire `apps/agent/src/main/ipc.ts` as a thin `AgentService` wrapper

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `AgentService` (Tasks 8-10), `getRuntime()` (Task 6).

This is the task where the facade from Task 6 gets its real payoff, and where `ipc.test.ts`'s header mocks finally need rewriting (per the spec's analysis: ~80% of the 803 lines are mechanical, but the mock setup at the top needs a structural rewrite). Read the CURRENT `apps/agent/src/main/ipc.test.ts` in full before starting — you are porting every one of its ~58 test cases, not writing new ones from scratch.

- [ ] **Step 1: Rewrite `ipc.ts` as a thin wrapper**

```ts
// apps/agent/src/main/ipc.ts
import { ipcMain, shell, dialog } from "electron";
import { AgentService } from "@3pb/agent-core";
import { getRuntime } from "./app-state";
import type { DeviceSecret, PrinterCommand } from "@3pb/agent-core";
import type { AgentConfig } from "@3pb/agent-core";

export type { ActivationState, SyncResult, UpdateDeviceModelResult } from "@3pb/agent-core";

export function registerIpcHandlers(_config: AgentConfig): void {
  const runtime = getRuntime();
  const service = new AgentService(runtime);
  const baseUrl = runtime.saasBaseUrl;

  ipcMain.handle("agent:activate", (_event, token: string) => service.activate(token));
  ipcMain.handle("agent:scan-lan", () => service.scanLan());
  ipcMain.handle("agent:pair-device", (_event, shortCode: string, secret: DeviceSecret) => service.pairDevice(shortCode, secret));
  ipcMain.handle("agent:forget-device", (_event, shortCode: string) => service.forgetDevice(shortCode));
  ipcMain.handle("agent:update-device-model", (_event, shortCode: string, model: string) => service.updateDeviceModel(shortCode, model));
  ipcMain.handle("agent:sync", () => service.sync());
  ipcMain.handle("agent:get-activation-state", () => service.getActivationState());
  ipcMain.handle("agent:get-snapshot", () => service.getSnapshot());
  ipcMain.handle("agent:get-broker-info", () => service.getBrokerInfo());
  ipcMain.handle("agent:printer-command", (_event, deviceId: string, cmd: PrinterCommand) => service.sendPrinterCommand(deviceId, cmd));
  ipcMain.handle("agent:get-credential-store-status", () => service.getCredentialStoreStatus());
  ipcMain.handle("agent:get-update-status", () => service.getUpdateStatus());
  ipcMain.handle("agent:send-logs", () => service.sendLogs());
  ipcMain.handle("agent:file-list", (_event, shortCode: string, path: string) => service.listFiles(shortCode, path));
  ipcMain.handle("agent:file-upload", (_event, shortCode: string, localPath: string, remotePath: string) => service.uploadFile(shortCode, localPath, remotePath));
  ipcMain.handle("agent:file-download", (_event, shortCode: string, remotePath: string, localPath: string) => service.downloadFile(shortCode, remotePath, localPath));
  ipcMain.handle("agent:file-delete", (_event, shortCode: string, remotePath: string) => service.deleteFile(shortCode, remotePath));
  ipcMain.handle("agent:file-rename", (_event, shortCode: string, oldPath: string, newPath: string) => service.renameFile(shortCode, oldPath, newPath));
  ipcMain.handle("agent:file-parse-3mf", (_event, shortCode: string, remotePath: string) => service.parseThreemfForDevice(shortCode, remotePath));
  ipcMain.handle("agent:file-thumbnail", (_event, shortCode: string, remotePath: string) => service.getFileThumbnail(shortCode, remotePath));

  ipcMain.handle("agent:open-download-page", async () => {
    if (!baseUrl) return;
    await shell.openExternal(`${baseUrl}/settings`);
  });

  ipcMain.handle("agent:pick-download-folder", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
```

Note `registerIpcHandlers` no longer uses its `config` parameter directly (it reads `saasBaseUrl` from the already-initialized `runtime` instead) — keep the parameter for signature compatibility with `index.ts`'s call site (Task 13 addresses this properly when `index.ts` itself is rewired), prefixed with `_` to satisfy the linter.

- [ ] **Step 2: Rewrite `ipc.test.ts`'s mock setup**

Read the current file's mock header (roughly lines 1-82) in full. Replace the many separate `vi.mock` calls for individual `@3pb/agent-core` functions with mocks of the underlying modules `AgentService` itself calls internally — since `ipc.ts` now only imports `AgentService`/`getRuntime` from `@3pb/agent-core`/`./app-state`, not the individual functions, mocking `@3pb/agent-core`'s named exports no longer intercepts anything `ipc.ts` calls directly.

The correct approach: **do not mock functions at the `@3pb/agent-core` boundary at all.** Instead, construct a real `AgentRuntime` (via `initRuntime()`, same as Task 6/7's tests) backed by an `InMemoryCredentialStore`, and mock only the true I/O boundaries `AgentService`'s internals reach — `fetch` (for `fetchDevices`/`patchDeviceModel`/`uploadLogs`, already how `saas-client.test.ts` mocks it), `node:dgram`/`bonjour-service` (for `scanLan`), and `BambuFtpsClient`/`jszip`/`node:fs/promises` (for file operations) — the same pattern `agent-service.test.ts` (Tasks 8-10) already established, since `ipc.test.ts` is now testing the exact same code path through one more layer (`ipcMain.handle` → `service.x()`).

```ts
// apps/agent/src/main/ipc.test.ts — new header, replacing the old vi.mock("@3pb/agent-core", ...) block
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRuntime, InMemoryCredentialStore } from "@3pb/agent-core";
import { initRuntime } from "./app-state";
import { registerIpcHandlers } from "./ipc";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).fetch = fetchMock;
});

function setupHandlers(seed: Parameters<typeof InMemoryCredentialStore>[0] = null) {
  const store = new InMemoryCredentialStore(seed);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runtime = new AgentRuntime({
    credentialStore: store,
    pathProvider: { userDataDir: () => "/fake" },
    logger,
    logFileProvider: { getLogFilePath: () => null },
    buildInfo: { version: "0.0.1", commitHash: "abc1234" },
    saasBaseUrl: "http://test.example.com",
    updatePlatform: "win",
  });
  initRuntime(runtime);
  registerIpcHandlers({ saasBaseUrl: "http://test.example.com" });

  const { ipcMain } = require("electron");
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  for (const call of vi.mocked(ipcMain.handle).mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown;
  }
  return { handlers, runtime, store, logger };
}
```

Now port every `it()` block from the old file, one at a time, following this pattern:
- Old: `registerIpcHandlers({saasBaseUrl}); const result = await handlers["agent:x"]({}, ...args);` with individual function mocks set up beforehand (`vi.mocked(fetchDevices).mockResolvedValue(...)`).
- New: `const { handlers } = setupHandlers(seedBlobIfNeeded); const result = await handlers["agent:x"]({}, ...args);` with the underlying I/O mocked instead (`fetchMock.mockResolvedValue(...)` for anything that goes through `saas-client.ts`'s `fetch` calls, etc.).

Do not drop any test case's assertion intent. Where a test specifically asserted a mock function was called with certain arguments (e.g. `expect(fetchDevices).toHaveBeenCalledWith(baseUrl, token, buildInfo, logger)`), replace it with an assertion on the actual HTTP call (`expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/agent/devices"), expect.objectContaining({...}))`) or on the resulting state (`expect(await store.load()).toEqual(...)`), whichever the old test's assertion was really checking.

For the 4 tests the spec flags as becoming tautological under the new design (get-snapshot, get-broker-info, credential-store-status, update-status "always current, not a frozen snapshot" tests) — port them as-is; they still pass, they're just less meaningful now. Do not delete them.

- [ ] **Step 3: Run the full `apps/agent` suite**

Run: `cd apps/agent && npx vitest run`
Expected: PASS. If any specific test fails, read its old assertion intent from git history/the pre-edit file and adapt — do not delete a failing test to make the suite green.

- [ ] **Step 4: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/main/ipc.test.ts
git commit -m "refactor(agent): rewire ipc.ts as thin AgentService wrapper, rewrite ipc.test.ts mocks"
```

---

### Task 12: `AgentRuntime.start()`/`stop()` — absorb the bootstrap sequence

**Files:**
- Modify: `packages/agent-core/src/agent-runtime.ts`
- Modify: `packages/agent-core/src/agent-runtime.test.ts`

**Interfaces:**
- Consumes: `ensureBrokerPin`, `buildPairedDevices`, `startEngine`, `publishLayout`, `loadCredentials`, `listLocalIpCandidates` (already in `agent-core`).
- Produces: `AgentRuntime.start(): Promise<void>`, `AgentRuntime.stop(): Promise<void>`.

This absorbs `apps/agent/src/main/index.ts`'s `bootstrap()` (Reference: read the current file in full, shown earlier in this conversation's context — its structure is: log SaaS base URL/LAN IPs → check credential store health → resolve broker PIN → start broker → build paired devices → start engine → publish layout, all wrapped in `try {} catch {} finally { registerIpcHandlers }`) and `startUpdateChecks()`, minus the Electron-specific `log.initialize()`/`registerIpcHandlers` calls (those stay host-side).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/agent-core/src/agent-runtime.test.ts — add these imports:
import * as credentialStoreModule from "./credential-store";
import * as startupModule from "./startup";
import * as engineManagerModule from "./engine-manager";
import * as layoutPublisherModule from "./layout-publisher";
import * as saasClientModule from "./saas-client";
import { InMemoryCredentialStore } from "./in-memory-credential-store";

vi.mock("./credential-store", async () => {
  const actual = await vi.importActual<typeof import("./credential-store")>("./credential-store");
  return { ...actual, ensureBrokerPin: vi.fn() };
});
vi.mock("./startup", async () => {
  const actual = await vi.importActual<typeof import("./startup")>("./startup");
  return { ...actual, buildPairedDevices: vi.fn() };
});
vi.mock("./engine-manager", async () => {
  const actual = await vi.importActual<typeof import("./engine-manager")>("./engine-manager");
  return { ...actual, startEngine: vi.fn() };
});
vi.mock("./layout-publisher", async () => {
  const actual = await vi.importActual<typeof import("./layout-publisher")>("./layout-publisher");
  return { ...actual, publishLayout: vi.fn() };
});
vi.mock("./saas-client", async () => {
  const actual = await vi.importActual<typeof import("./saas-client")>("./saas-client");
  return { ...actual, fetchLatestVersion: vi.fn() };
});
```

```ts
// packages/agent-core/src/agent-runtime.test.ts — add:
function makeRuntimeForStartStop(store = new InMemoryCredentialStore()) {
  const pathProvider = { userDataDir: () => "/fake" };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider = { getLogFilePath: () => null };
  const buildInfo = { version: "0.0.1", commitHash: "abc1234" };
  const fakeBroker = {
    start: vi.fn().mockResolvedValue({ ok: true, port: 1883 }),
    stop: vi.fn().mockResolvedValue(undefined),
    port: 1883,
  };
  const runtime = new AgentRuntime({
    credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
    saasBaseUrl: "http://test.example.com", updatePlatform: "win",
    broker: fakeBroker as never,
  });
  return { runtime, logger, fakeBroker };
}

describe("AgentRuntime.start", () => {
  it("broker start sukses, tanpa device paired -> start selesai tanpa throw, engine tetap null", async () => {
    const { runtime, fakeBroker } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: undefined, devices: {}, brokerPin: null }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);

    await expect(runtime.start()).resolves.toBeUndefined();
    expect(fakeBroker.start).toHaveBeenCalledWith(1883, "1234");
    expect(runtime.getEngine()).toBeNull();
  });

  it("broker gagal start -> start() TIDAK throw, tetap resolve", async () => {
    const { runtime, fakeBroker } = makeRuntimeForStartStop();
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    fakeBroker.start.mockResolvedValue({ ok: false, reason: "port_in_use" });

    await expect(runtime.start()).resolves.toBeUndefined();
  });

  it("startEngine throw di tengah start() -> publishLayout ikut TIDAK dipanggil (perilaku lama dipertahankan)", async () => {
    const { runtime } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    const pairedDevice = { shortCode: "ABC", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", accessCode: "", serial: "" } };
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([pairedDevice]);
    vi.mocked(engineManagerModule.startEngine).mockRejectedValue(new Error("accessCode kosong"));

    await runtime.start();

    expect(layoutPublisherModule.publishLayout).not.toHaveBeenCalled();
  });

  it("dengan agentToken -> publishLayout dipanggil setelah engine start sukses", async () => {
    const { runtime } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);

    await runtime.start();

    expect(layoutPublisherModule.publishLayout).toHaveBeenCalledWith("http://test.example.com", "tok", 1883, "default", "1234", runtime.logger);
  });

  it("update-check timer mulai bahkan kalau broker gagal start (independen dari hasil start lainnya)", async () => {
    vi.useFakeTimers();
    const { runtime, fakeBroker } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: null }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    fakeBroker.start.mockResolvedValue({ ok: false, reason: "port_in_use" });
    vi.mocked(saasClientModule.fetchLatestVersion).mockResolvedValue({ ok: true, data: { updateAvailable: true } });

    await runtime.start();
    await vi.runOnlyPendingTimersAsync();

    expect(saasClientModule.fetchLatestVersion).toHaveBeenCalled();
    expect(runtime.getUpdateAvailable()).toBe(true);
    vi.useRealTimers();
  });
});

describe("AgentRuntime.stop", () => {
  it("stop() memanggil teardownEngine(), broker.stop(), dan menghentikan timer update-check", async () => {
    const { runtime, fakeBroker } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: undefined, devices: {}, brokerPin: null }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);
    const teardownSpy = vi.spyOn(runtime, "teardownEngine");

    await runtime.start();
    await runtime.stop();

    expect(teardownSpy).toHaveBeenCalled();
    expect(fakeBroker.stop).toHaveBeenCalled();
  });

  it("stop() sebelum start() -> tidak throw", async () => {
    const { runtime } = makeRuntimeForStartStop();
    await expect(runtime.stop()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/agent-runtime.test.ts`
Expected: FAIL — `start()`/`stop()` don't exist yet.

- [ ] **Step 3: Implement `start()`/`stop()`**

```ts
// packages/agent-core/src/agent-runtime.ts — add imports:
import { ensureBrokerPin } from "./credential-store";
import { buildPairedDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import { fetchLatestVersion } from "./saas-client";
import { listLocalIpCandidates } from "./local-network";
```

```ts
// packages/agent-core/src/agent-runtime.ts — add to the class body:
private updateCheckTimer: NodeJS.Timeout | null = null;

/**
 * Menyerap urutan bootstrap yang sebelumnya di apps/agent/src/main/index.ts (log SaaS base
 * URL/LAN IP -> cek kesehatan credential store -> resolve PIN -> start broker -> pair devices
 * -> start engine -> publish layout) plus startUpdateChecks(). TIDAK PERNAH throw -- kegagalan
 * di-log lewat this.logger, bukan dilempar, supaya host SELALU bisa daftarkan transport
 * (IPC/HTTP) sesudahnya apa pun yang terjadi di sini.
 *
 * update-check SENGAJA independen dari hasil bagian lain -- kalau broker gagal start,
 * update-check tetap mulai (lihat komentar asli di index.ts lama).
 */
async start(): Promise<void> {
  try {
    if (this.saasBaseUrl) {
      this.logger.info(`[agent-runtime] SaaS base URL: ${this.saasBaseUrl}`);
    } else {
      this.logger.error(
        '[agent-runtime] SAAS_BASE_URL KOSONG — build ini tak tahu harus menghubungi server Slizebiz yang mana. ' +
          'Aktivasi/sync/layout PASTI gagal ("network_error"). Cek config.json di direktori data aplikasi.',
      );
    }
    this.logger.info('[agent-runtime] kandidat IP LAN (urut prioritas):', listLocalIpCandidates().join(', ') || '(tidak ada)');

    const credentialResult = await this.credentialStore.load();
    this.setCredentialStoreDegraded(credentialResult.status === 'degraded');
    if (credentialResult.status === 'degraded') {
      this.logger.error('[agent-runtime] penyimpanan kredensial lokal bermasalah (encryption tak tersedia atau file gagal didekripsi) -- PIN broker session-only, minta user restart/cek support');
    }

    const brokerPin = await ensureBrokerPin(this.credentialStore, this.logger);
    this.setBrokerPin(brokerPin);

    const brokerResult = await this.broker.start(this.configuredBrokerPort, brokerPin);
    if (!brokerResult.ok) {
      this.logger.error(`[agent-runtime] broker MQTT lokal gagal start (${brokerResult.reason}) — monitoring lokal tak akan jalan`);
      return;
    }
    this.setBrokerPort(brokerResult.port);

    const paired = await buildPairedDevices(this.saasBaseUrl, this.credentialStore, this.pathProvider, this.buildInfo, this.logger);
    if (paired.length > 0) {
      const started = await startEngine(paired, brokerResult.port, brokerPin, this.logger);
      this.setEngine(started.engine);
      this.setReporters(started.reporters);
    }

    const blob = await loadCredentials(this.credentialStore);
    if (blob.agentToken) {
      await publishLayout(this.saasBaseUrl, blob.agentToken, brokerResult.port, "default", brokerPin, this.logger);
    }
  } catch (err) {
    this.logger.error('[agent-runtime] start() gagal di tengah jalan (broker/engine/layout) — host tetap bisa daftarkan transport', err);
  } finally {
    this.startUpdateChecks();
  }
}

private startUpdateChecks(): void {
  const check = async () => {
    const blob = await loadCredentials(this.credentialStore);
    if (!blob.agentToken) return;
    const result = await fetchLatestVersion(this.saasBaseUrl, blob.agentToken, this.updatePlatform, this.buildInfo, this.logger);
    if (result.ok) this.setUpdateAvailable(result.data.updateAvailable);
  };
  void check();
  this.updateCheckTimer = setInterval(check, 6 * 60 * 60 * 1000);
  this.updateCheckTimer.unref?.();
}

async stop(): Promise<void> {
  await this.teardownEngine();
  await this.broker.stop();
  if (this.updateCheckTimer) {
    clearInterval(this.updateCheckTimer);
    this.updateCheckTimer = null;
  }
}
```

Add the `loadCredentials` import too if not already present from Task 5:
```ts
// packages/agent-core/src/agent-runtime.ts
import { loadCredentials } from "./credential-store";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/agent-runtime.test.ts`
Expected: PASS, all tests (8 from Task 5 + 7 new).

- [ ] **Step 5: Full package suite + typecheck**

Run: `cd packages/agent-core && npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/agent-runtime.ts packages/agent-core/src/agent-runtime.test.ts
git commit -m "feat(agent-core): add AgentRuntime.start()/stop() absorbing Electron bootstrap sequence"
```

---

### Task 13: Rewire `apps/agent/src/main/index.ts` to use `runtime.start()`/`stop()`

**Files:**
- Modify: `apps/agent/src/main/index.ts`

**Interfaces:**
- Consumes: `AgentRuntime.start()`/`stop()` (Task 12).

- [ ] **Step 1: Rewrite `bootstrap()`**

```ts
// apps/agent/src/main/index.ts — full new bootstrap():
async function bootstrap(): Promise<void> {
  log.initialize()
  log.errorHandler.startCatching()
  Object.assign(console, log.functions)
  const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
  const updatePlatform = process.platform === 'darwin' ? 'mac' : 'win'
  const runtime = new AgentRuntime({
    credentialStore,
    pathProvider,
    logger,
    logFileProvider: new ElectronLogFileProvider(),
    buildInfo,
    saasBaseUrl: config.saasBaseUrl,
    updatePlatform,
  })
  initRuntime(runtime)
  try {
    await runtime.start()
  } catch (err) {
    logger.error('[agent] runtime.start() gagal total', err)
  } finally {
    registerIpcHandlers(config)
  }
}
```

Remove the now-unused `startUpdateChecks()` function and its call site in `app.on('ready', ...)` entirely — `AgentRuntime.start()` calls it internally now:

```ts
// apps/agent/src/main/index.ts — in app.on('ready', async () => { ... }), change:
//   await bootstrap()
//   void startUpdateChecks().catch((err) => logger.error('[agent] update check gagal', err))
// to just:
await bootstrap()
```

Also remove the now-dead imports: `buildPairedDevices`, `ensureBrokerPin`, `fetchLatestVersion`, `startEngine`, `publishLayout`, `setEngine`, `setBrokerPort`, `setBrokerPin`, `setReporters`, `setUpdateAvailable`, `setCredentialStoreDegraded`, `listLocalIpCandidates` are no longer called directly by `index.ts` (they live inside `AgentRuntime.start()`/`stop()` now) — remove them from the import list, keeping only what's still used (`loadOrCreateConfig`, `loadCredentials` if still referenced elsewhere in the file — check before removing, `AgentRuntime`).

Add `initRuntime` to the `./app-state` import (replacing the setters that are no longer called from this file).

- [ ] **Step 2: Note `stop()` is intentionally NOT wired to app quit in this task**

The current Electron app never calls `stopBroker()`/an equivalent on quit (it relies on process exit) — this plan preserves that exact behavior. Do not add a `runtime.stop()` call to `app.on('before-quit', ...)` or similar; that would be a behavior change outside this plan's scope (the Global Constraints forbid unrequested behavior changes). `stop()` exists for test teardown and for the future headless daemon's SIGTERM handling (sub-project 2), not for this task.

- [ ] **Step 3: Run apps/agent full suite**

Run: `cd apps/agent && npx vitest run`
Expected: PASS. `index.ts` has no dedicated test file (this was true before this plan too — flagged by the spec as a gap that this plan's Task 12 characterization tests now cover, at the `AgentRuntime.start()` level instead).

- [ ] **Step 4: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke check (not automatable)**

Note in your task report that a real `pnpm --filter @3pb/agent dev` run (manual, by the user) is the only way to confirm bootstrap still behaves identically end-to-end — this is consistent with the rest of this refactor's testing approach (E2E is always manual, per the spec).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/index.ts
git commit -m "refactor(agent): rewire index.ts bootstrap to use AgentRuntime.start()/stop()"
```

---

### Task 14: Remove the `app-state.ts` facade, shrink `ipc.test.ts` to wiring-only tests

**Files:**
- Delete: `apps/agent/src/main/app-state.ts`, `apps/agent/src/main/app-state.test.ts`
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/main/ipc.test.ts`
- Modify: `apps/agent/src/main/index.ts`

This is the final cleanup task. By now nothing needs the temporary facade — `ipc.ts` was rewired in Task 11 to construct its own `AgentService` from a runtime it gets via `getRuntime()`, and `index.ts` constructs its own `AgentRuntime` directly in Task 13. Both can hold a direct reference instead of going through the facade.

- [ ] **Step 1: Remove the facade indirection**

In `index.ts`, keep the `runtime` local variable from `bootstrap()` and pass it directly to `registerIpcHandlers` instead of relying on the module-level facade:

```ts
// apps/agent/src/main/index.ts — change registerIpcHandlers's call site inside bootstrap()'s finally:
//   registerIpcHandlers(config)
// to:
registerIpcHandlers(runtime)
```

In `ipc.ts`, change `registerIpcHandlers`'s signature to take the runtime directly instead of reading it from `getRuntime()`:

```ts
// apps/agent/src/main/ipc.ts
export function registerIpcHandlers(runtime: AgentRuntime): void {
  const service = new AgentService(runtime);
  const baseUrl = runtime.saasBaseUrl;
  // ... rest unchanged from Task 11
}
```

Remove the `import type { AgentConfig } from "@3pb/agent-core"` and `_config` parameter naming from Task 11 — this task finally removes that vestige. Remove `import { getRuntime } from "./app-state"`.

- [ ] **Step 2: Delete `app-state.ts` and its test**

```bash
rm apps/agent/src/main/app-state.ts apps/agent/src/main/app-state.test.ts
```

- [ ] **Step 3: Update `ipc.test.ts`'s `setupHandlers` helper to pass the runtime directly**

```ts
// apps/agent/src/main/ipc.test.ts — in setupHandlers(), replace:
//   initRuntime(runtime);
//   registerIpcHandlers({ saasBaseUrl: "http://test.example.com" });
// with:
registerIpcHandlers(runtime);
```

Remove the now-unused `import { initRuntime } from "./app-state"`.

- [ ] **Step 4: Run apps/agent full suite**

Run: `cd apps/agent && npx vitest run`
Expected: PASS, no `app-state.test.ts` in the file list anymore.

- [ ] **Step 5: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/main/ipc.test.ts apps/agent/src/main/index.ts
git rm apps/agent/src/main/app-state.ts apps/agent/src/main/app-state.test.ts
git commit -m "refactor(agent): remove app-state.ts facade, pass AgentRuntime directly to registerIpcHandlers"
```

---

### Task 15: Final verification

**Files:** none — verification-only task, mirrors Plan A's final task.

- [ ] **Step 1: Run the full affected-package test suite**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-core-plan-b && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/agent-core test && pnpm --filter @3pb/agent test`
Expected: both green.

- [ ] **Step 2: Typecheck both packages**

Run: `pnpm --filter @3pb/agent-core exec tsc --noEmit && pnpm --filter @3pb/agent exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Real Electron build**

Run: `cd apps/agent && pnpm exec electron-vite build`
Expected: succeeds. Per the lesson from Plan A's final verification task (a Node-in-browser bundling leak that only a real build caught, not unit tests), pay attention to any renderer-build error — if `AgentRuntime`/`AgentService` or anything they transitively import (e.g. `aedes`, `node:net`) leaks into the renderer bundle via a value-import from a barrel export somewhere in `apps/agent/src/renderer/` or `src/preload/`, the build will fail with a Vite/Rollup binding error. Search `apps/agent/src/renderer/` and `apps/agent/src/preload/` for any non-type-only `import ... from "@3pb/agent-core"` and confirm none of them reach `AgentRuntime`/`AgentService`/`LocalBroker` as a value import (they should only ever need `ActivationState`/`SyncResult`/etc. as `import type`).

- [ ] **Step 4: Grep for any leftover reference to the old `app-state.ts`/`broker.ts` APIs**

```bash
grep -rn "from ['\"]\./app-state['\"]" apps/agent/src/ || echo "none found"
grep -rn "from ['\"]\./broker['\"]" apps/agent/src/ || echo "none found"
grep -rn "__resetRateLimitForTests\|__checkPinForTests" apps/agent/src/ packages/agent-core/src/ || echo "none found"
```
Expected: "none found" for all three (the test-only escape hatches from the old `broker.ts` must be fully gone, per this plan's `PinRateLimiter` extraction).

- [ ] **Step 5: Commit any final fixes found in steps 1-4**

If everything passes cleanly, no additional commit is needed. If a fix was required, commit it separately with a message describing the specific finding, using `git add <specific files>`.

---
