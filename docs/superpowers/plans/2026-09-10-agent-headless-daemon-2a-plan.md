# Headless Daemon Sub-project 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/agent-headless` — a pure-Node (no Electron) daemon exposing the existing `AgentRuntime`/`AgentService` over a REST API, packaged as a systemd service for Raspberry Pi/Linux, installable via `curl|bash`.

**Architecture:** Five small, TDD prerequisite fixes land in `packages/agent-core` first (a rate-limiter option, a type widening, an atomic file write, a new token-management pair, a re-entrancy guard) — all pure refactors, zero behavior change for the existing Electron app. Then `apps/agent-headless` is built as a thin Fastify shell: Linux implementations of the 5 core interfaces, one HTTP route per `AgentService` method (validated at the boundary, mapped to status codes per the documented throw-vs-return contract), a temp-file relay for the two file-transfer methods that can't cross a network boundary as raw local paths, Bearer-token auth using a new `apiToken` (never the MQTT `brokerPin`), and a bootstrap sequence that starts HTTP before `AgentRuntime.start()` so the API stays diagnosable during a slow boot.

**Tech Stack:** TypeScript, Node 22, Fastify (new dependency, first use in this repo), esbuild (bundling — `packages/agent-core` ships raw `.ts`, Node can't run that directly), Vitest, systemd.

**Spec:** `docs/superpowers/specs/2026-09-10-agent-headless-daemon-2a-design.md` (read this before starting — it carries the full rationale, especially the Global Constraints below and the Fable review findings that shaped them).

## Global Constraints

- **`brokerPin` is NEVER used as an HTTP token.** The daemon has a separate `apiToken` (32 random bytes, hex-encoded) stored in `CredentialBlob`.
- **`uploadFile`/`downloadFile` on `AgentService` are never exposed over HTTP with a raw `localPath` parameter.** The daemon relays through a temp file it manages itself (`os.tmpdir()`, cleaned up in `finally`).
- **Pure refactor in `packages/agent-core`** for every prerequisite task (Tasks 1-5) — the existing Electron app's observable behavior must not change. Every prerequisite task's existing test suite (in the touched file) must still pass unmodified in addition to the new tests you add.
- **`AgentService`'s documented throw-vs-return contract is binding**: file-operation methods (`listFiles`/`uploadFile`/`downloadFile`/`deleteFile`/`renameFile`/`parseThreemfForDevice`/`getFileThumbnail`) throw on error; everything else returns a discriminated union and never throws for expected failures.
- Node 22 required for every command: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- **Never `git add -A` / `git add .`** — always `git add <specific paths>`.
- HTTP port is **8080**, plain HTTP (not HTTPS) — this is an explicit, documented v1 decision, not an oversight; do not add TLS.
- Data directory is `/var/lib/slizebiz-agent` in production (systemd `StateDirectory=`), but tasks in this plan use a temp directory for tests — never hardcode the production path in test code.
- Web wizard, WebSocket push, kiosk display, and CLI are explicitly **out of scope** for this plan (sub-projects 2b, 3, 5) — do not build anything beyond a REST API testable with `curl`/Fastify's `app.inject()`.

---

## Reference: current `packages/agent-core/src/pin-rate-limiter.ts` (Task 1 modifies this)

```ts
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

interface RateLimitEntry {
  count: number;
  lockedUntil: number;
}

function normalizeAddress(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
}

function isLoopback(normalizedAddr: string): boolean {
  return normalizedAddr === "127.0.0.1" || normalizedAddr === "::1";
}

export class PinRateLimiter {
  private rateLimitMap = new Map<string, RateLimitEntry>();

  check(rawAddr: string, presentedPassword: string, pin: string): { ok: boolean; locked: boolean } {
    const addr = normalizeAddress(rawAddr);
    const loopback = isLoopback(addr);
    const now = Date.now();

    if (!loopback) {
      const entry = this.rateLimitMap.get(addr);
      if (entry && entry.lockedUntil > 0) {
        if (now < entry.lockedUntil) {
          return { ok: false, locked: true };
        }
        this.rateLimitMap.delete(addr);
      }
    }

    if (presentedPassword === pin) {
      if (!loopback) this.rateLimitMap.delete(addr);
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

---

### Task 1: `PinRateLimiter` — add `trustLoopback` option

**Files:**
- Modify: `packages/agent-core/src/pin-rate-limiter.ts`
- Modify: `packages/agent-core/src/pin-rate-limiter.test.ts`

**Interfaces:**
- Produces: `new PinRateLimiter(opts?: { trustLoopback?: boolean })` — `trustLoopback` defaults to `true` (preserves the exact existing behavior used by `LocalBroker` for MQTT). Used by Task 8 (`auth.ts`), which constructs `new PinRateLimiter({ trustLoopback: false })`.

The existing spec found this gap: the design calls for the daemon's HTTP auth to use "a `PinRateLimiter` instance with `trustLoopback: false`", but the class has no such option today — the loopback bypass is unconditional. This task adds it without touching any existing caller's behavior.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-core/src/pin-rate-limiter.test.ts — add these tests to the existing file (do not remove any existing test)
describe("PinRateLimiter with trustLoopback: false", () => {
  it("loopback (127.0.0.1) TETAP kena rate limit kalau trustLoopback:false", () => {
    const limiter = new PinRateLimiter({ trustLoopback: false });
    for (let i = 0; i < 5; i++) {
      limiter.check("127.0.0.1", "wrong", "1234");
    }
    expect(limiter.check("127.0.0.1", "1234", "1234")).toEqual({ ok: false, locked: true });
  });

  it("PIN benar dari loopback tetap ok:true kalau belum locked, trustLoopback:false", () => {
    const limiter = new PinRateLimiter({ trustLoopback: false });
    expect(limiter.check("127.0.0.1", "1234", "1234")).toEqual({ ok: true, locked: false });
  });

  it("default (tanpa opts) tetap trustLoopback:true -- perilaku lama tak berubah", () => {
    const limiter = new PinRateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("127.0.0.1", "wrong", "1234").locked).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/pin-rate-limiter.test.ts`
Expected: FAIL — `PinRateLimiter` doesn't accept a constructor argument yet.

- [ ] **Step 3: Implement the option**

```ts
// packages/agent-core/src/pin-rate-limiter.ts — replace the class with:
export interface PinRateLimiterOptions {
  trustLoopback?: boolean;
}

export class PinRateLimiter {
  private rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly trustLoopback: boolean;

  constructor(opts: PinRateLimiterOptions = {}) {
    this.trustLoopback = opts.trustLoopback ?? true;
  }

  check(rawAddr: string, presentedPassword: string, pin: string): { ok: boolean; locked: boolean } {
    const addr = normalizeAddress(rawAddr);
    const loopback = this.trustLoopback && isLoopback(addr);
    const now = Date.now();

    if (!loopback) {
      const entry = this.rateLimitMap.get(addr);
      if (entry && entry.lockedUntil > 0) {
        if (now < entry.lockedUntil) {
          return { ok: false, locked: true };
        }
        this.rateLimitMap.delete(addr);
      }
    }

    if (presentedPassword === pin) {
      if (!loopback) this.rateLimitMap.delete(addr);
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

Every line inside `check()` besides the `loopback` variable's computation is unchanged — this preserves every existing test's behavior exactly (`this.trustLoopback && isLoopback(addr)` is `true && isLoopback(addr)` by default, identical to the old unconditional `isLoopback(addr)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/pin-rate-limiter.test.ts`
Expected: PASS — all existing tests plus the 3 new ones (13 total).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/pin-rate-limiter.ts packages/agent-core/src/pin-rate-limiter.test.ts
git commit -m "feat(agent-core): add PinRateLimiter trustLoopback option for HTTP auth reuse"
```

---

### Task 2: `AgentRuntimeDeps.updatePlatform` accepts `"linux"`

**Files:**
- Modify: `packages/agent-core/src/agent-runtime.ts`
- Modify: `packages/agent-core/src/agent-runtime.test.ts`

**Interfaces:**
- Produces: `AgentRuntimeDeps.updatePlatform: "win" | "mac" | "linux"` (was `"win" | "mac"`). Consumed by Task 12 (`apps/agent-headless`'s bootstrap, which passes `"linux"`).

`saas-client.ts`'s `fetchLatestVersion` already accepts `"linux"` as its `platform` parameter — only `AgentRuntimeDeps`'s type was left behind.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-core/src/agent-runtime.test.ts — add this test to the existing "AgentRuntime" describe block
it("updatePlatform menerima 'linux'", () => {
  const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
  const runtime = new AgentRuntime({
    credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
    saasBaseUrl: "x", updatePlatform: "linux",
  });
  expect(runtime.updatePlatform).toBe("linux");
});
```

(Use whatever the file's existing `makeDeps()`/fixture helper is named — read the file first to match its exact current pattern rather than assuming this snippet's helper name is exact.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/agent-runtime.test.ts`
Expected: FAIL — TypeScript rejects `updatePlatform: "linux"` (not assignable to `"win" | "mac"`).

- [ ] **Step 3: Widen the type**

```ts
// packages/agent-core/src/agent-runtime.ts — change both occurrences:
//   updatePlatform: "win" | "mac";
// to:
updatePlatform: "win" | "mac" | "linux";
```

There are two occurrences: one in `AgentRuntimeDeps` (the constructor param interface) and one in the class's `readonly updatePlatform` field declaration. Change both.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/agent-runtime.test.ts`
Expected: PASS, plus every existing test in the file still passes.

- [ ] **Step 5: Typecheck**

Run: `cd packages/agent-core && npx tsc --noEmit && cd ../../apps/agent && npx tsc --noEmit`
Expected: no errors (widening a union type is backward-compatible — `apps/agent`'s existing `"win" | "mac"` call sites still typecheck).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/agent-runtime.ts packages/agent-core/src/agent-runtime.test.ts
git commit -m "feat(agent-core): AgentRuntimeDeps.updatePlatform accepts linux"
```

---

### Task 3: `FileAesCredentialStore.save()` — atomic write

**Files:**
- Modify: `packages/agent-core/src/credential-store-file-aes.ts`
- Modify: `packages/agent-core/src/credential-store-file-aes.test.ts`

**Interfaces:**
- No signature change — `save()`'s external behavior (encrypt, write, 0600 permission) is identical; only the write mechanism becomes crash-safe.

On a Raspberry Pi's SD card, power loss mid-write is a realistic failure mode. The current `fs.writeFileSync(this.dataFilePath(), ..., { mode: 0o600 })` writes directly to the final file — an interrupted write leaves a truncated file, which `load()` correctly detects as `degraded: decrypt_failed`, but that's now a **permanent** degraded state (nothing to recover to) instead of a transient one. Writing to a temp file in the same directory and `rename()`-ing over the target is atomic on POSIX filesystems (same-directory rename is a single filesystem operation, not a copy).

- [ ] **Step 1: Write the failing test**

Read the current `packages/agent-core/src/credential-store-file-aes.test.ts` in full first, to match its existing fixture/temp-dir pattern exactly.

```ts
// packages/agent-core/src/credential-store-file-aes.test.ts — add this test
it("save() menulis lewat temp file lalu rename (bukan langsung ke file final)", async () => {
  const store = new FileAesCredentialStore(dir); // `dir` = whatever the file's existing tests use as their temp directory fixture
  const writeSpy = vi.spyOn(fs, "writeFileSync");
  const renameSpy = vi.spyOn(fs, "renameSync");

  await store.save({ agentToken: "tok", devices: {} });

  // writeFileSync harus dipanggil ke path yang BUKAN credentials.enc final (temp file dulu)
  const dataFileWrites = writeSpy.mock.calls.filter((call) => String(call[0]).includes("credentials.enc") && !String(call[0]).includes(".tmp"));
  expect(dataFileWrites).toHaveLength(0);
  expect(renameSpy).toHaveBeenCalled();
  writeSpy.mockRestore();
  renameSpy.mockRestore();
});

it("save() tetap benar-benar bisa dibaca balik setelah rename (round-trip tak berubah)", async () => {
  const store = new FileAesCredentialStore(dir);
  await store.save({ agentToken: "tok", devices: { ABC: { ip: "1.2.3.4", serial: "s", accessCode: "c" } } });
  const result = await store.load();
  expect(result).toEqual({ status: "ok", blob: { agentToken: "tok", devices: { ABC: { ip: "1.2.3.4", serial: "s", accessCode: "c" } } } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/credential-store-file-aes.test.ts`
Expected: FAIL — the first new test fails because `save()` currently writes directly to `credentials.enc` with no temp file / rename.

- [ ] **Step 3: Implement atomic write**

```ts
// packages/agent-core/src/credential-store-file-aes.ts — replace save() with:
async save(blob: CredentialBlob): Promise<void> {
  this.ensureDir();
  const key = this.loadOrCreateKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(blob), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const finalPath = this.dataFilePath();
  // Tulis ke temp file di direktori yang SAMA (rename lintas filesystem tidak atomic), lalu
  // rename -- di POSIX, rename dalam satu filesystem adalah satu operasi atomic. Mencegah file
  // .enc terpotong kalau proses mati/listrik mati di tengah writeFileSync (mode kegagalan
  // realistis di SD card Raspberry Pi) -- file lama tetap utuh sampai rename benar-benar sukses.
  const tempPath = `${finalPath}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tempPath, Buffer.concat([iv, authTag, ciphertext]), { mode: 0o600 });
  fs.renameSync(tempPath, finalPath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/credential-store-file-aes.test.ts`
Expected: PASS, all existing tests plus the 2 new ones.

- [ ] **Step 5: Full package test + typecheck**

Run: `cd packages/agent-core && npx vitest run && npx tsc --noEmit`
Expected: all green, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/credential-store-file-aes.ts packages/agent-core/src/credential-store-file-aes.test.ts
git commit -m "fix(agent-core): FileAesCredentialStore.save() writes atomically via temp file + rename"
```

---

### Task 4: `ensureApiToken`/`clearApiToken`

**Files:**
- Modify: `packages/agent-core/src/credential-store.ts`
- Modify: `packages/agent-core/src/credential-store.test.ts`

**Interfaces:**
- Consumes: `CredentialStore<CredentialBlob>` (existing), `Logger` (existing).
- Produces: `CredentialBlob.apiToken?: string` (new optional field), `ensureApiToken(store, logger): Promise<string>`, `clearApiToken(blob): CredentialBlob`. Used by Task 8 (`auth.ts`) and Task 14 (the `--print-token` CLI mode).

This mirrors `ensureBrokerPin`/`clearBrokerPin` exactly — same data-loss-safety reasoning (never overwrite a `degraded` blob), same session-only fallback when the store is degraded. The only differences: token is 32 random bytes hex-encoded (not a 4-digit PIN), and the field name is `apiToken`.

- [ ] **Step 1: Write the failing test**

Read the current `packages/agent-core/src/credential-store.test.ts` in full first, to match its existing test patterns (particularly however `ensureBrokerPin`'s tests are structured) exactly.

```ts
// packages/agent-core/src/credential-store.test.ts — add these tests
describe("ensureApiToken", () => {
  it("belum ada token -> generate token baru 64 hex char (32 byte), simpan ke blob", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: null, devices: {}, apiToken: token } });
  });

  it("sudah ada token -> balikin yang sama, tidak generate ulang", async () => {
    const store = new InMemoryCredentialStore({ agentToken: null, devices: {}, apiToken: "existing-token-value" });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    expect(token).toBe("existing-token-value");
  });

  it("blob sudah ada (augment, bukan timpa) -- agentToken/devices lama tetap utuh", async () => {
    const store = new InMemoryCredentialStore({ agentToken: "tok", devices: { ABC: { ip: "1.1.1.1", serial: "s", accessCode: "c" } } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await ensureApiToken(store, logger);
    const result = await store.load();
    expect(result).toEqual({ status: "ok", blob: { agentToken: "tok", devices: { ABC: { ip: "1.1.1.1", serial: "s", accessCode: "c" } }, apiToken: expect.any(String) } });
  });

  it("status degraded -> token session-only, TIDAK disimpan, logger.error dipanggil, PIN tidak pernah di-log", async () => {
    const store: CredentialStore<CredentialBlob> = {
      load: async () => ({ status: "degraded", reason: "decrypt_failed" }),
      save: vi.fn(),
      isEncryptionAvailable: () => true,
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(store.save).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    const loggedArgs = vi.mocked(logger.error).mock.calls[0];
    expect(loggedArgs.join(" ")).not.toContain(token);
  });
});

describe("clearApiToken", () => {
  it("pure function -- hapus apiToken dari blob, sisanya tak berubah", () => {
    const blob: CredentialBlob = { agentToken: "tok", devices: {}, apiToken: "abc" };
    expect(clearApiToken(blob)).toEqual({ agentToken: "tok", devices: {}, apiToken: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/credential-store.test.ts`
Expected: FAIL — `ensureApiToken`/`clearApiToken` don't exist, `apiToken` isn't a valid `CredentialBlob` field.

- [ ] **Step 3: Implement**

```ts
// packages/agent-core/src/credential-store.ts — add `apiToken?: string;` to the CredentialBlob interface:
export interface CredentialBlob {
  agentToken: string | null;
  devices: Record<string, DeviceSecret>;
  brokerPin?: string;
  // 32 byte random, hex-encoded -- token Bearer buat HTTP API daemon (apps/agent-headless).
  // SENGAJA terpisah dari brokerPin (PIN 4 digit buat MQTT/CYD) -- brokerPin punya keyspace
  // kecil dan rate-limiter-nya bypass loopback, tidak memadai buat auth HTTP. Opsional --
  // blob lama (pra-fitur ini, atau target non-headless) tak punya field ini sama sekali.
  apiToken?: string;
}
```

```ts
// packages/agent-core/src/credential-store.ts — add import at top:
import { randomInt, randomBytes } from "node:crypto";
```

(Replace the existing `import { randomInt } from "node:crypto";` with the line above — same import, just adding `randomBytes`.)

```ts
// packages/agent-core/src/credential-store.ts — add near generatePin():
function generateApiToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Bootstrap apiToken -- pola identik ensureBrokerPin (lihat komentar di sana untuk alasan
 * lengkap soal kenapa "degraded" tidak boleh ditimpa). SATU-SATUNYA beda: token 32 byte hex,
 * dipakai sebagai Bearer HTTP di apps/agent-headless, BUKAN brokerPin (4 digit, buat MQTT/CYD).
 */
export async function ensureApiToken(store: CredentialStore<CredentialBlob>, logger: Logger): Promise<string> {
  const result = await store.load();
  if (result.status === "ok" && result.blob.apiToken) return result.blob.apiToken;

  const token = generateApiToken();
  if (result.status === "degraded") {
    logger.error(
      "[credential-store] tak bisa simpan API token baru dengan aman (file ada tapi gagal didekripsi, atau enkripsi tak tersedia) -- pakai token session-only untuk run ini",
    );
    return token;
  }
  const blob = result.status === "ok" ? result.blob : EMPTY_BLOB;
  await store.save({ ...blob, apiToken: token });
  return token;
}

/** Pure function, no I/O -- hapus apiToken dari blob (dipakai rotate-token action), BUKAN hapus seluruh file credentials. */
export function clearApiToken(blob: CredentialBlob): CredentialBlob {
  return { ...blob, apiToken: undefined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/credential-store.test.ts`
Expected: PASS, all existing tests plus the 5 new ones.

- [ ] **Step 5: Add to barrel, full package test + typecheck**

Check `packages/agent-core/src/index.ts` — `credential-store` is already barrel-exported (`export * from "./credential-store";`), so `ensureApiToken`/`clearApiToken` are automatically exported too; no barrel change needed. Confirm this by checking the file.

Run: `cd packages/agent-core && npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/credential-store.ts packages/agent-core/src/credential-store.test.ts
git commit -m "feat(agent-core): add ensureApiToken/clearApiToken, separate HTTP auth secret from brokerPin"
```

---

### Task 5: `AgentService.sync()` — non-re-entrant guard

**Files:**
- Modify: `packages/agent-core/src/agent-service.ts`
- Modify: `packages/agent-core/src/agent-service.test.ts`

**Interfaces:**
- No signature change to `sync()` — still `sync(): Promise<SyncResult>`. Internal behavior change only: concurrent calls now share one in-flight promise instead of each running `teardownEngine()`/`startEngine()` independently.

Documented as an explicit prerequisite for sub-project 2 in the earlier spec: two concurrent `sync()` calls can both call `teardownEngine()` then both call `startEngine()`, and the loser's engine/reporters silently replace the winner's — the exact reporter-leak bug class Plan B was built to prevent, now realistic under HTTP concurrency (wizard + CLI hitting `/api/sync` around the same time) instead of requiring an Electron double-click.

- [ ] **Step 1: Write the failing test**

Read the current `packages/agent-core/src/agent-service.test.ts`'s `describe("AgentService.sync", ...)` block in full first, to reuse its existing mock setup (`vi.mock` calls for `./startup`, `./engine-manager`, `./layout-publisher`) rather than duplicating it.

```ts
// packages/agent-core/src/agent-service.test.ts — add to the "AgentService.sync" describe block
it("dua panggilan sync() bersamaan -> hanya SATU eksekusi nyata, keduanya dapat hasil yang sama", async () => {
  const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
  runtime.setBrokerPort(1883);
  runtime.setBrokerPin("1234");
  const teardownSpy = vi.spyOn(runtime, "teardownEngine");
  vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [] });
  vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: false });

  const [resultA, resultB] = await Promise.all([service.sync(), service.sync()]);

  expect(teardownSpy).toHaveBeenCalledOnce(); // BUKAN dua kali -- ini bukti coalescing, bukan cuma "keduanya sukses"
  expect(resultA).toEqual(resultB);
  expect(resultA).toEqual({ ok: true, deviceCount: 0 });
});

it("sync() kedua SETELAH yang pertama selesai -> jalan lagi dari awal (bukan cache selamanya)", async () => {
  const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
  runtime.setBrokerPort(1883);
  runtime.setBrokerPin("1234");
  const teardownSpy = vi.spyOn(runtime, "teardownEngine");
  vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [] });
  vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: false });

  await service.sync();
  await service.sync();

  expect(teardownSpy).toHaveBeenCalledTimes(2);
});
```

(Use whatever the file's existing `makeFixture()` helper and `startup`/`layoutPublisher` mock-module import aliases are actually named — read the file first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: FAIL — `teardownEngine` is called twice even for concurrent calls (no coalescing yet).

- [ ] **Step 3: Implement the guard**

```ts
// packages/agent-core/src/agent-service.ts — add a private field to the class:
export class AgentService {
  constructor(private readonly runtime: AgentRuntime) {}

  private inFlightSync: Promise<SyncResult> | null = null;
```

```ts
// packages/agent-core/src/agent-service.ts — rename the existing sync() method body to a private
// helper, and make the public sync() coalesce concurrent calls onto one in-flight promise:
async sync(): Promise<SyncResult> {
  if (this.inFlightSync) return this.inFlightSync;
  this.inFlightSync = this.doSync().finally(() => {
    this.inFlightSync = null;
  });
  return this.inFlightSync;
}

private async doSync(): Promise<SyncResult> {
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

The body of `doSync()` is byte-for-byte identical to the old `sync()` body — only the wrapping changed. `.finally(() => { this.inFlightSync = null; })` runs regardless of success/failure, so a failed `sync()` doesn't permanently wedge future calls into returning a stale cached rejection.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/agent-service.test.ts`
Expected: PASS, all existing `sync()` tests (7 from the earlier plan) plus the 2 new ones — the existing tests must still pass unmodified, since `doSync()`'s logic didn't change, only single-caller-vs-concurrent-caller wrapping.

- [ ] **Step 5: Full package test + typecheck**

Run: `cd packages/agent-core && npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/agent-service.ts packages/agent-core/src/agent-service.test.ts
git commit -m "feat(agent-core): AgentService.sync() coalesces concurrent calls to prevent engine/reporter race"
```

---

### Task 6: Scaffold `apps/agent-headless` package

**Files:**
- Create: `apps/agent-headless/package.json`
- Create: `apps/agent-headless/tsconfig.json`
- Create: `apps/agent-headless/vitest.config.ts`
- Create: `apps/agent-headless/src/index.ts` (placeholder, filled in fully by Task 12)

**Interfaces:**
- Produces: a workspace package `@3pb/agent-headless` that later tasks add files to.

This task only scaffolds the package so pnpm/Turborepo recognize it and later tasks have somewhere to write files — no real logic yet.

- [ ] **Step 1: Create `package.json`**

```json
// apps/agent-headless/package.json
{
  "name": "@3pb/agent-headless",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "node scripts/build.mjs",
    "start": "node dist/index.mjs"
  },
  "dependencies": {
    "@3pb/agent-core": "workspace:*",
    "@3pb/printer-monitor-core": "workspace:*",
    "fastify": "^4.28.1",
    "@fastify/multipart": "^8.3.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "typescript": "^5",
    "vitest": "^1.6.1",
    "esbuild": "^0.24.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Use `packages/agent-core/tsconfig.json` as the template (read it first) — same `compilerOptions` shape (`target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `skipLibCheck: true`, `noEmit: true`, `types: ["vitest/globals", "node"]`), `include: ["src"]`.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
// apps/agent-headless/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Create placeholder entry point**

```ts
// apps/agent-headless/src/index.ts
// Bootstrap diisi penuh di Task 12 -- ini placeholder supaya package valid dulu.
console.log("agent-headless: not yet implemented");
```

- [ ] **Step 5: Install and verify the workspace recognizes the package**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-headless-daemon && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm install`
Expected: succeeds, `@3pb/agent-headless` appears linked in `node_modules/.pnpm` or workspace symlinks.

Run: `cd apps/agent-headless && npx vitest run`
Expected: passes with "no test files found" (no tests exist yet) or 0 tests, not an error.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-headless/package.json apps/agent-headless/tsconfig.json apps/agent-headless/vitest.config.ts apps/agent-headless/src/index.ts pnpm-lock.yaml
git commit -m "feat(agent-headless): scaffold apps/agent-headless package"
```

---

### Task 7: `platform-node.ts` — Linux implementations of the 5 core interfaces

**Files:**
- Create: `apps/agent-headless/src/platform-node.ts`
- Create: `apps/agent-headless/src/platform-node.test.ts`
- Create: `apps/agent-headless/scripts/build-info.mjs`

**Interfaces:**
- Consumes: `PathProvider`, `Logger`, `LogFileProvider`, `BuildInfo` (all from `@3pb/agent-core`).
- Produces: `NodePathProvider`, `NodeLogAdapter`, `NodeLogFileProvider`, `getNodeBuildInfo()`. Used by Task 12 (bootstrap).

Mirrors `apps/agent/src/main/platform-electron.ts`'s role for Electron, but for a plain Node process under systemd. Read that file first for the shape to match (read it now).

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent-headless/src/platform-node.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodePathProvider, NodeLogAdapter, NodeLogFileProvider, getNodeBuildInfo } from "./platform-node";

describe("NodePathProvider", () => {
  it("userDataDir() balikin nilai dari env var AGENT_DATA_DIR kalau di-set", () => {
    const original = process.env.AGENT_DATA_DIR;
    process.env.AGENT_DATA_DIR = "/custom/path";
    expect(new NodePathProvider().userDataDir()).toBe("/custom/path");
    if (original === undefined) delete process.env.AGENT_DATA_DIR;
    else process.env.AGENT_DATA_DIR = original;
  });

  it("userDataDir() fallback ke /var/lib/slizebiz-agent kalau AGENT_DATA_DIR tak di-set", () => {
    const original = process.env.AGENT_DATA_DIR;
    delete process.env.AGENT_DATA_DIR;
    expect(new NodePathProvider().userDataDir()).toBe("/var/lib/slizebiz-agent");
    if (original !== undefined) process.env.AGENT_DATA_DIR = original;
  });
});

describe("NodeLogAdapter", () => {
  it("info/warn/error delegasi ke console yang sesuai (systemd menangkap stdout/stderr)", () => {
    const adapter = new NodeLogAdapter();
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    adapter.info("hello", 1);
    adapter.error("bad", { detail: 1 });
    expect(infoSpy).toHaveBeenCalledWith("hello", 1);
    expect(errorSpy).toHaveBeenCalledWith("bad", { detail: 1 });
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("NodeLogFileProvider", () => {
  it("getLogFilePath() selalu null -- journald-only, tak ada file log terpisah (lihat spec)", () => {
    expect(new NodeLogFileProvider().getLogFilePath()).toBeNull();
  });
});

describe("getNodeBuildInfo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-headless-buildinfo-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("baca build-info.json kalau ada", () => {
    writeFileSync(join(dir, "build-info.json"), JSON.stringify({ version: "1.2.3", commitHash: "abc1234" }));
    expect(getNodeBuildInfo(dir)).toEqual({ version: "1.2.3", commitHash: "abc1234" });
  });

  it("fallback ke 0.0.0/nogit kalau build-info.json tak ada (dev run tanpa build step)", () => {
    expect(getNodeBuildInfo(dir)).toEqual({ version: "0.0.0", commitHash: "nogit" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/platform-node.test.ts`
Expected: FAIL — `platform-node.ts` doesn't exist.

- [ ] **Step 3: Implement**

```ts
// apps/agent-headless/src/platform-node.ts
import fs from "node:fs";
import path from "node:path";
import type { PathProvider, Logger, LogFileProvider, BuildInfo } from "@3pb/agent-core";

const DEFAULT_DATA_DIR = "/var/lib/slizebiz-agent";

export class NodePathProvider implements PathProvider {
  userDataDir(): string {
    return process.env.AGENT_DATA_DIR || DEFAULT_DATA_DIR;
  }
}

export class NodeLogAdapter implements Logger {
  info(...args: unknown[]): void {
    console.log(...args);
  }
  warn(...args: unknown[]): void {
    console.warn(...args);
  }
  error(...args: unknown[]): void {
    console.error(...args);
  }
}

// journald-only (lihat spec §Logging) -- systemd menangkap stdout/stderr proses secara
// keseluruhan (termasuk console.error dari kode yang tidak lewat Logger, mis. Engine/Reporter
// di printer-monitor-core), jadi TIDAK perlu trik Object.assign(console, ...) seperti Electron.
// sendLogs() balikin read_failed apa adanya untuk v1 -- dukungan journalctl adalah perbaikan lanjutan.
export class NodeLogFileProvider implements LogFileProvider {
  getLogFilePath(): string | null {
    return null;
  }
}

export function getNodeBuildInfo(dirForBuildInfoJson: string = path.dirname(new URL(import.meta.url).pathname)): BuildInfo {
  try {
    const raw = fs.readFileSync(path.join(dirForBuildInfoJson, "build-info.json"), "utf8");
    return JSON.parse(raw) as BuildInfo;
  } catch {
    return { version: "0.0.0", commitHash: "nogit" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run src/platform-node.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Create the build-info generation script (used by Task 13's bundler, referenced now since it's part of this task's "BuildInfo" concern)**

```js
// apps/agent-headless/scripts/build-info.mjs
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

let commitHash = "nogit";
try {
  commitHash = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
} catch {
  // no git available at build time -- keep "nogit" fallback, matches getNodeBuildInfo()'s own fallback shape
}

writeFileSync(
  join(__dirname, "..", "dist", "build-info.json"),
  JSON.stringify({ version: pkg.version, commitHash }, null, 2),
);
console.log(`build-info.json written: version=${pkg.version} commitHash=${commitHash}`);
```

This script assumes `dist/` already exists (created by Task 13's `build.mjs` before calling this) — do not run it standalone yet; Task 13 wires it into the build pipeline.

- [ ] **Step 6: Typecheck**

Run: `cd apps/agent-headless && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-headless/src/platform-node.ts apps/agent-headless/src/platform-node.test.ts apps/agent-headless/scripts/build-info.mjs
git commit -m "feat(agent-headless): add Linux platform interface implementations"
```

---

### Task 8: `auth.ts` — Bearer token middleware

**Files:**
- Create: `apps/agent-headless/src/auth.ts`
- Create: `apps/agent-headless/src/auth.test.ts`

**Interfaces:**
- Consumes: `ensureApiToken` (Task 4), `PinRateLimiter` with `{trustLoopback: false}` (Task 1), `CredentialStore<CredentialBlob>`, `Logger`.
- Produces: `createAuthHook(store: CredentialStore<CredentialBlob>, logger: Logger): (req, reply, done) => Promise<void>` — a Fastify `onRequest` hook. Used by Task 9 (`http-server.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent-headless/src/auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { InMemoryCredentialStore, ensureApiToken } from "@3pb/agent-core";
import { createAuthHook } from "./auth";

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("createAuthHook", () => {
  it("request tanpa header Authorization -> 401", async () => {
    const store = new InMemoryCredentialStore();
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, makeLogger()));
    app.get("/protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });

  it("token benar -> lolos, handler jalan", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    const token = await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("token salah -> 401", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong-token" } });
    expect(res.statusCode).toBe(401);
  });

  it("5 kali token salah dari alamat yang sama -> attempt ke-6 locked (401 juga, tapi rate-limited)", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong", "x-forwarded-for": "9.9.9.9" } });
    }
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong", "x-forwarded-for": "9.9.9.9" } });
    expect(res.statusCode).toBe(401);
    // Bedakan locked dari sekadar salah lewat body, kalau createAuthHook menyertakan reason:
    expect(res.json()).toMatchObject({ error: expect.stringContaining("lock") });
  });

  it("loopback (127.0.0.1) TETAP kena rate limit -- trustLoopback:false, beda dari broker MQTT", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    // Fastify inject default pakai alamat konsisten -- pastikan tidak diistimewakan
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong" } });
    }
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong" } });
    expect(res.json()).toMatchObject({ error: expect.stringContaining("lock") });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/auth.test.ts`
Expected: FAIL — `auth.ts` doesn't exist.

- [ ] **Step 3: Implement**

```ts
// apps/agent-headless/src/auth.ts
import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { ensureApiToken, PinRateLimiter, type CredentialStore, type CredentialBlob, type Logger } from "@3pb/agent-core";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createAuthHook(store: CredentialStore<CredentialBlob>, logger: Logger) {
  // Instance TERPISAH dari PinRateLimiter yang dipakai LocalBroker untuk MQTT -- trustLoopback:false
  // di sini SENGAJA, beda dari broker (di mana loopback = reporter/publishLayout milik proses
  // sendiri, aman diistimewakan). Di HTTP, "loopback" bisa berarti reverse proxy/tunnel di depan
  // port 8080 yang membuat semua request tampak loopback -- limiter harus tetap berlaku.
  const rateLimiter = new PinRateLimiter({ trustLoopback: false });

  return async function authHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization;
    const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const expectedToken = await ensureApiToken(store, logger);
    const addr = req.ip;

    const { ok, locked } = rateLimiter.check(addr, presented, expectedToken);
    if (locked) {
      reply.code(401).send({ error: "too many failed attempts, locked out temporarily" });
      return;
    }
    if (!ok || !constantTimeEqual(presented, expectedToken)) {
      reply.code(401).send({ error: "invalid or missing token" });
      return;
    }
  };
}
```

Note: `rateLimiter.check()` already does an equality check on `presentedPassword === pin` internally for its own bookkeeping (whether to reset the attempt counter), but that internal check is not constant-time — the explicit `constantTimeEqual()` call above is the one that actually gates access, so a timing side-channel in `PinRateLimiter`'s own comparison doesn't leak the token (it only affects rate-limit bookkeeping, not the auth decision itself). Do not rely on `rateLimiter.check()`'s `ok` field alone for the final auth decision — always additionally verify with `constantTimeEqual`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run src/auth.test.ts`
Expected: PASS, 5 tests. Note: Fastify's `app.inject()` may report all requests from the same synthetic loopback-like address by default — if the "loopback tetap kena rate limit" test doesn't observe distinct behavior from the "5 kali salah" test because they hit the same bucket, that's expected (they're testing the same code path from two angles); if the test fails because `req.ip` isn't actually `127.0.0.1`-shaped under `inject()`, adjust the test to explicitly assert on the `PinRateLimiter`'s behavior via a fake IP header instead, and note this adjustment in your task report — the important behavioral guarantee is that no code path calls `check()` with an address that gets silently treated as always-trusted.

- [ ] **Step 5: Typecheck**

Run: `cd apps/agent-headless && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-headless/src/auth.ts apps/agent-headless/src/auth.test.ts
git commit -m "feat(agent-headless): add Bearer token auth hook with dedicated rate limiter"
```

---

### Task 9: `http-server.ts` skeleton + `/healthz`

**Files:**
- Create: `apps/agent-headless/src/http-server.ts`
- Create: `apps/agent-headless/src/http-server.test.ts`
- Create: `apps/agent-headless/src/routes/health-routes.ts`
- Create: `apps/agent-headless/src/routes/health-routes.test.ts`

**Interfaces:**
- Consumes: `AgentRuntime` (from `@3pb/agent-core`), `createAuthHook` (Task 8).
- Produces: `createHttpServer(runtime: AgentRuntime): FastifyInstance` — builds the Fastify app, registers the auth hook (excluding `/healthz`), registers `/healthz`. Used by Task 12 (bootstrap) and extended by Tasks 10-11 (more routes).

- [ ] **Step 1: Write the failing test for health-routes**

```ts
// apps/agent-headless/src/routes/health-routes.test.ts
import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { AgentRuntime, InMemoryCredentialStore } from "@3pb/agent-core";
import { registerHealthRoutes } from "./health-routes";

function makeRuntime() {
  const store = new InMemoryCredentialStore();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return new AgentRuntime({
    credentialStore: store,
    pathProvider: { userDataDir: () => "/fake" },
    logger,
    logFileProvider: { getLogFilePath: () => null },
    buildInfo: { version: "0.0.1", commitHash: "abc" },
    saasBaseUrl: "http://test.example.com",
    updatePlatform: "linux",
  });
}

describe("GET /healthz", () => {
  it("balikin status runtime saat ini, TANPA butuh auth header", async () => {
    const runtime = makeRuntime();
    const app = Fastify();
    registerHealthRoutes(app, runtime);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      httpOk: true,
      brokerPort: null,
      engineRunning: false,
      credentialStoreDegraded: false,
    });
  });

  it("mencerminkan state runtime setelah broker/engine berubah", async () => {
    const runtime = makeRuntime();
    runtime.setBrokerPort(1883);
    runtime.setCredentialStoreDegraded(true);
    const app = Fastify();
    registerHealthRoutes(app, runtime);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.json()).toEqual({
      httpOk: true,
      brokerPort: 1883,
      engineRunning: false,
      credentialStoreDegraded: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/routes/health-routes.test.ts`
Expected: FAIL — `health-routes.ts` doesn't exist.

- [ ] **Step 3: Implement `health-routes.ts`**

```ts
// apps/agent-headless/src/routes/health-routes.ts
import type { FastifyInstance } from "fastify";
import type { AgentRuntime } from "@3pb/agent-core";

export function registerHealthRoutes(app: FastifyInstance, runtime: AgentRuntime): void {
  app.get("/healthz", async () => {
    return {
      httpOk: true,
      brokerPort: runtime.getBrokerPort(),
      engineRunning: runtime.getEngine() !== null,
      credentialStoreDegraded: runtime.getCredentialStoreDegraded(),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run src/routes/health-routes.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing test for `http-server.ts`**

```ts
// apps/agent-headless/src/http-server.test.ts
import { describe, it, expect, vi } from "vitest";
import { AgentRuntime, InMemoryCredentialStore, ensureApiToken } from "@3pb/agent-core";
import { createHttpServer } from "./http-server";

function makeRuntime(store = new InMemoryCredentialStore()) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return new AgentRuntime({
    credentialStore: store,
    pathProvider: { userDataDir: () => "/fake" },
    logger,
    logFileProvider: { getLogFilePath: () => null },
    buildInfo: { version: "0.0.1", commitHash: "abc" },
    saasBaseUrl: "http://test.example.com",
    updatePlatform: "linux",
  });
}

describe("createHttpServer", () => {
  it("/healthz bisa diakses TANPA token", async () => {
    const app = createHttpServer(makeRuntime());
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("route lain (belum ada di task ini, tapi auth hook harus terpasang global) -- request tanpa auth ke path acak balikin 404, bukan 401 (Fastify default not-found), TAPI auth hook harus tetap dipanggil sebelum routing kalau path terdaftar", async () => {
    // Test minimal untuk task ini: pastikan hook auth benar-benar TERPASANG, dicek lewat route dummy.
    const runtime = makeRuntime();
    const app = createHttpServer(runtime);
    app.get("/test-protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/test-protected" });
    expect(res.statusCode).toBe(401);
  });

  it("route selain /healthz dengan token benar -> lolos auth", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    const runtime = makeRuntime(store);
    const app = createHttpServer(runtime);
    app.get("/test-protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/test-protected", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/http-server.test.ts`
Expected: FAIL — `http-server.ts` doesn't exist.

- [ ] **Step 7: Implement `http-server.ts`**

```ts
// apps/agent-headless/src/http-server.ts
import Fastify, { type FastifyInstance } from "fastify";
import type { AgentRuntime } from "@3pb/agent-core";
import { createAuthHook } from "./auth";
import { registerHealthRoutes } from "./routes/health-routes";

export function createHttpServer(runtime: AgentRuntime): FastifyInstance {
  const app = Fastify({ logger: false }); // pakai runtime.logger sendiri, bukan Fastify built-in logger

  // /healthz didaftarkan SEBELUM auth hook dipasang, dan auth hook mengecualikannya secara
  // eksplisit -- systemd/monitoring harus bisa cek kesehatan daemon tanpa token.
  registerHealthRoutes(app, runtime);

  const authHook = createAuthHook(runtime.credentialStore, runtime.logger);
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") return;
    await authHook(req, reply);
  });

  return app;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run src/http-server.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Typecheck**

Run: `cd apps/agent-headless && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/agent-headless/src/http-server.ts apps/agent-headless/src/http-server.test.ts apps/agent-headless/src/routes/health-routes.ts apps/agent-headless/src/routes/health-routes.test.ts
git commit -m "feat(agent-headless): add Fastify server skeleton with /healthz and global auth hook"
```

---

### Task 10: `agent-routes.ts` — non-file `AgentService` routes

**Files:**
- Create: `apps/agent-headless/src/routes/agent-routes.ts`
- Create: `apps/agent-headless/src/routes/agent-routes.test.ts`
- Modify: `apps/agent-headless/src/http-server.ts`

**Interfaces:**
- Consumes: `AgentService` (from `@3pb/agent-core`), all its non-file methods (`activate`, `scanLan`, `pairDevice`, `forgetDevice`, `updateDeviceModel`, `sync`, `getActivationState`, `getSnapshot`, `getBrokerInfo`, `sendPrinterCommand`, `getCredentialStoreStatus`, `getUpdateStatus`, `sendLogs`).
- Produces: `registerAgentRoutes(app: FastifyInstance, service: AgentService): void`. Used by Task 12 (bootstrap wires this into `createHttpServer`'s caller) — this task also updates `http-server.ts` to accept and pass through an `AgentService`.

This is the 12 non-file routes from the spec's routing table (file operations are Task 11). Read `apps/agent/src/main/ipc.ts` first to confirm each method's exact parameter shapes before writing the route bodies.

- [ ] **Step 1: Write the failing tests**

Read `packages/agent-core/src/agent-service.test.ts` first for the exact behavior of each method (what each returns for success/failure) — your route tests assert on the SAME behaviors, just reached over HTTP via `app.inject()` instead of a direct method call.

```ts
// apps/agent-headless/src/routes/agent-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { AgentRuntime, AgentService, InMemoryCredentialStore } from "@3pb/agent-core";
import { registerAgentRoutes } from "./agent-routes";
import * as saasClient from "@3pb/agent-core";

function makeFixture(seed: ConstructorParameters<typeof InMemoryCredentialStore>[0] = null) {
  const store = new InMemoryCredentialStore(seed);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runtime = new AgentRuntime({
    credentialStore: store,
    pathProvider: { userDataDir: () => "/fake" },
    logger,
    logFileProvider: { getLogFilePath: () => null },
    buildInfo: { version: "0.0.1", commitHash: "abc" },
    saasBaseUrl: "http://test.example.com",
    updatePlatform: "linux",
  });
  const service = new AgentService(runtime);
  const app = Fastify();
  registerAgentRoutes(app, service);
  return { app, runtime, store, logger };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).fetch = fetchMock;
});

describe("POST /api/activate", () => {
  it("token valid -> 200, body = FetchResult sukses", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => [] });
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/activate", payload: { token: "tok123" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: [] });
  });
});

describe("GET /api/snapshot", () => {
  it("tanpa engine -> 200 {payload:[]}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ payload: [] });
  });
});

describe("GET /api/broker-info", () => {
  it("baca state runtime saat ini", async () => {
    const { app, runtime } = makeFixture();
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const res = await app.inject({ method: "GET", url: "/api/broker-info" });
    expect(res.json()).toMatchObject({ port: 1883, pin: "1234" });
  });
});

describe("POST /api/devices/:shortCode/pair", () => {
  it("body valid -> 204, credential tersimpan", async () => {
    const { app, store } = makeFixture();
    const secret = { ip: "1.2.3.4", serial: "s", accessCode: "c" };
    const res = await app.inject({ method: "POST", url: "/api/devices/ABC/pair", payload: secret });
    expect(res.statusCode).toBe(204);
    expect(await store.load()).toMatchObject({ status: "ok", blob: { devices: { ABC: secret } } });
  });
});

describe("DELETE /api/devices/:shortCode", () => {
  it("forgetDevice -> 204", async () => {
    const { app } = makeFixture({ agentToken: null, devices: { ABC: { ip: "x", serial: "s", accessCode: "c" } } });
    const res = await app.inject({ method: "DELETE", url: "/api/devices/ABC" });
    expect(res.statusCode).toBe(204);
  });
});

describe("PATCH /api/devices/:shortCode/model", () => {
  it("tanpa agentToken -> 200 {ok:false}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "PATCH", url: "/api/devices/ABC/model", payload: { model: "x" } });
    expect(res.json()).toEqual({ ok: false });
  });
});

describe("POST /api/sync", () => {
  it("tanpa agentToken -> 200 {ok:false, kind:invalid_token}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/sync" });
    expect(res.json()).toEqual({ ok: false, kind: "invalid_token" });
  });
});

describe("GET /api/activation-state", () => {
  it("tanpa agentToken -> hasToken:false", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "GET", url: "/api/activation-state" });
    expect(res.json()).toEqual({ hasToken: false, devices: [], pairedShortCodes: [] });
  });
});

describe("POST /api/printers/:deviceId/command", () => {
  it("tanpa engine -> engine_not_running", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/printers/dev1/command", payload: { type: "pause" } });
    expect(res.json()).toEqual({ ok: false, message: "engine_not_running" });
  });
});

describe("GET /api/credential-store-status, GET /api/update-status", () => {
  it("baca state runtime saat ini", async () => {
    const { app, runtime } = makeFixture();
    runtime.setCredentialStoreDegraded(true);
    runtime.setUpdateAvailable(true);
    const res1 = await app.inject({ method: "GET", url: "/api/credential-store-status" });
    expect(res1.json()).toEqual({ degraded: true });
    const res2 = await app.inject({ method: "GET", url: "/api/update-status" });
    expect(res2.json()).toEqual({ updateAvailable: true });
  });
});

describe("POST /api/scan-lan", () => {
  it("balikin gabungan hasil scanBambu+scanMoonraker (mock jaringan sungguhan, bukan mock AgentService)", async () => {
    // scanLan() memanggil scanBambu/scanMoonraker sungguhan (buka socket UDP) -- untuk test route,
    // cukup pastikan endpoint memanggil service.scanLan() dan meneruskan hasilnya; mock di level
    // ini boleh langsung mock modul @3pb/agent-core's scanBambu/scanMoonraker kalau route test
        // ingin cepat, ATAU terima durasi nyata (~5-20 detik) kalau dijalankan tanpa mock -- untuk
        // task ini, mock scanBambu/scanMoonraker di level module seperti pola agent-service.test.ts.
    expect(true).toBe(true); // placeholder assertion removed below in Step 3's real implementation guidance
  });
});

describe("POST /api/send-logs", () => {
  it("tanpa agentToken -> {ok:false, reason:no_token}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/send-logs" });
    expect(res.json()).toEqual({ ok: false, reason: "no_token" });
  });
});
```

**Important note on the `scan-lan` test above**: it's written as a placeholder because `scanLan()` genuinely opens real UDP sockets (SSDP broadcast, mDNS) and blocks for up to 20 seconds — this is real, existing `AgentService`/`packages/agent-core` behavior, not something this task introduces. Before implementing, mock `scanBambu`/`scanMoonraker` from `@3pb/agent-core` at the module level (same pattern as `packages/agent-core/src/agent-service.test.ts`'s own `scanLan` test — read that test first and copy its mock setup) so this route test runs fast and deterministically. Replace the placeholder assertion with a real one asserting the route returns `{bambu: ..., moonraker: ...}` shaped from the mocked results.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/routes/agent-routes.test.ts`
Expected: FAIL — `agent-routes.ts` doesn't exist.

- [ ] **Step 3: Implement `agent-routes.ts`**

```ts
// apps/agent-headless/src/routes/agent-routes.ts
import type { FastifyInstance } from "fastify";
import type { AgentService } from "@3pb/agent-core";
import type { DeviceSecret, PrinterCommand } from "@3pb/agent-core";

export function registerAgentRoutes(app: FastifyInstance, service: AgentService): void {
  app.post<{ Body: { token: string } }>("/api/activate", async (req) => {
    return service.activate(req.body.token);
  });

  app.post("/api/scan-lan", async () => {
    return service.scanLan();
  });

  app.post<{ Params: { shortCode: string }; Body: DeviceSecret }>("/api/devices/:shortCode/pair", async (req, reply) => {
    await service.pairDevice(req.params.shortCode, req.body);
    reply.code(204).send();
  });

  app.delete<{ Params: { shortCode: string } }>("/api/devices/:shortCode", async (req, reply) => {
    await service.forgetDevice(req.params.shortCode);
    reply.code(204).send();
  });

  app.patch<{ Params: { shortCode: string }; Body: { model: string } }>("/api/devices/:shortCode/model", async (req) => {
    return service.updateDeviceModel(req.params.shortCode, req.body.model);
  });

  app.post("/api/sync", async () => {
    return service.sync();
  });

  app.get("/api/activation-state", async () => {
    return service.getActivationState();
  });

  app.get("/api/snapshot", async () => {
    return service.getSnapshot();
  });

  app.get("/api/broker-info", async () => {
    return service.getBrokerInfo();
  });

  app.post<{ Params: { deviceId: string }; Body: PrinterCommand }>("/api/printers/:deviceId/command", async (req) => {
    return service.sendPrinterCommand(req.params.deviceId, req.body);
  });

  app.get("/api/credential-store-status", async () => {
    return service.getCredentialStoreStatus();
  });

  app.get("/api/update-status", async () => {
    return service.getUpdateStatus();
  });

  app.post("/api/send-logs", async () => {
    return service.sendLogs();
  });
}
```

- [ ] **Step 4: Wire `AgentService` into `http-server.ts`**

```ts
// apps/agent-headless/src/http-server.ts — change createHttpServer's signature and body:
import Fastify, { type FastifyInstance } from "fastify";
import type { AgentRuntime, AgentService } from "@3pb/agent-core";
import { createAuthHook } from "./auth";
import { registerHealthRoutes } from "./routes/health-routes";
import { registerAgentRoutes } from "./routes/agent-routes";

export function createHttpServer(runtime: AgentRuntime, service: AgentService): FastifyInstance {
  const app = Fastify({ logger: false });

  registerHealthRoutes(app, runtime);

  const authHook = createAuthHook(runtime.credentialStore, runtime.logger);
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") return;
    await authHook(req, reply);
  });

  registerAgentRoutes(app, service);

  return app;
}
```

Update `apps/agent-headless/src/http-server.test.ts`'s calls to `createHttpServer(runtime)` to `createHttpServer(runtime, new AgentService(runtime))` (import `AgentService` from `@3pb/agent-core` in that test file too).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run`
Expected: PASS, all files including the updated `http-server.test.ts` and the new `agent-routes.test.ts` (11 tests).

- [ ] **Step 6: Typecheck**

Run: `cd apps/agent-headless && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-headless/src/routes/agent-routes.ts apps/agent-headless/src/routes/agent-routes.test.ts apps/agent-headless/src/http-server.ts apps/agent-headless/src/http-server.test.ts
git commit -m "feat(agent-headless): add REST routes for non-file AgentService methods"
```

---

### Task 11: `file-transfer.ts` + file-operation routes

**Files:**
- Create: `apps/agent-headless/src/file-transfer.ts`
- Create: `apps/agent-headless/src/file-transfer.test.ts`
- Modify: `apps/agent-headless/src/routes/agent-routes.ts`
- Modify: `apps/agent-headless/src/routes/agent-routes.test.ts`
- Modify: `apps/agent-headless/src/http-server.ts` (register `@fastify/multipart`)

**Interfaces:**
- Consumes: `AgentService.uploadFile`/`downloadFile`/`listFiles`/`deleteFile`/`renameFile`/`parseThreemfForDevice`/`getFileThumbnail`.
- Produces: `relayUpload(service, shortCode, remotePath, sourceStream): Promise<void>`, `relayDownload(service, shortCode, remotePath): Promise<{tempPath: string; cleanup: () => Promise<void>}>`.

This is the Global Constraint from the spec: `uploadFile`/`downloadFile` are never exposed with a raw `localPath`. The daemon relays through `os.tmpdir()`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent-headless/src/file-transfer.test.ts
import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import { existsSync } from "node:fs";
import { relayUpload, relayDownload } from "./file-transfer";
import type { AgentService } from "@3pb/agent-core";

function makeFakeService(overrides: Partial<AgentService> = {}): AgentService {
  return {
    uploadFile: vi.fn(async () => {}),
    downloadFile: vi.fn(async (_shortCode: string, _remotePath: string, localPath: string) => {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(localPath, "fake file content");
    }),
    ...overrides,
  } as unknown as AgentService;
}

describe("relayUpload", () => {
  it("tulis stream ke temp file, panggil service.uploadFile dengan path temp itu, hapus temp file setelahnya", async () => {
    const service = makeFakeService();
    const stream = Readable.from([Buffer.from("hello")]);
    await relayUpload(service, "ABC", "/remote/file.gcode", stream);
    expect(service.uploadFile).toHaveBeenCalledWith("ABC", expect.stringContaining("agent-headless-upload-"), "/remote/file.gcode");
    const calledTempPath = vi.mocked(service.uploadFile).mock.calls[0][1];
    expect(existsSync(calledTempPath)).toBe(false); // sudah dihapus
  });

  it("service.uploadFile throw -> temp file tetap dihapus (finally), error diteruskan", async () => {
    const service = makeFakeService({ uploadFile: vi.fn(async () => { throw new Error("device_not_found"); }) });
    const stream = Readable.from([Buffer.from("x")]);
    await expect(relayUpload(service, "ABC", "/remote/x", stream)).rejects.toThrow("device_not_found");
  });
});

describe("relayDownload", () => {
  it("panggil service.downloadFile ke temp file, balikin path + fungsi cleanup", async () => {
    const service = makeFakeService();
    const { tempPath, cleanup } = await relayDownload(service, "ABC", "/remote/file.gcode");
    expect(existsSync(tempPath)).toBe(true);
    await cleanup();
    expect(existsSync(tempPath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/file-transfer.test.ts`
Expected: FAIL — `file-transfer.ts` doesn't exist.

- [ ] **Step 3: Implement**

```ts
// apps/agent-headless/src/file-transfer.ts
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { AgentService } from "@3pb/agent-core";

// Pola temp-file yang sama seperti AgentService.parseThreemfForDevice/getFileThumbnail di core --
// SENGAJA tidak mengubah signature AgentService.uploadFile/downloadFile (localPath tetap
// filesystem lokal proses, cocok untuk Electron); daemon menambah SATU lapisan relay di levelnya
// sendiri, bukan mengubah kontrak core.
export async function relayUpload(service: AgentService, shortCode: string, remotePath: string, sourceStream: Readable): Promise<void> {
  const tempPath = join(tmpdir(), `agent-headless-upload-${Date.now()}-${randomUUID()}`);
  try {
    await pipeline(sourceStream, createWriteStream(tempPath));
    await service.uploadFile(shortCode, tempPath, remotePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

export async function relayDownload(service: AgentService, shortCode: string, remotePath: string): Promise<{ tempPath: string; cleanup: () => Promise<void> }> {
  const tempPath = join(tmpdir(), `agent-headless-download-${Date.now()}-${randomUUID()}`);
  await service.downloadFile(shortCode, remotePath, tempPath);
  return {
    tempPath,
    cleanup: () => rm(tempPath, { force: true }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run src/file-transfer.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the file-operation routes to `agent-routes.ts`**

```ts
// apps/agent-headless/src/routes/agent-routes.ts — add import:
import { relayUpload, relayDownload } from "../file-transfer";
import { createReadStream } from "node:fs";
```

```ts
// apps/agent-headless/src/routes/agent-routes.ts — add to registerAgentRoutes(), and change
// its signature to accept `multipart: true` support is registered by the caller (Task 6 already
// added @fastify/multipart as a dependency; Step 6 below registers the plugin):

  app.get<{ Params: { shortCode: string }; Querystring: { path: string } }>("/api/devices/:shortCode/files", async (req) => {
    return service.listFiles(req.params.shortCode, req.query.path);
  });

  app.post<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>("/api/devices/:shortCode/files/upload", async (req) => {
    const data = await req.file();
    if (!data) throw new Error("no file in upload request");
    await relayUpload(service, req.params.shortCode, req.query.remotePath, data.file);
  });

  app.get<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>("/api/devices/:shortCode/files/download", async (req, reply) => {
    const { tempPath, cleanup } = await relayDownload(service, req.params.shortCode, req.query.remotePath);
    try {
      const stream = createReadStream(tempPath);
      reply.header("Content-Type", "application/octet-stream");
      return reply.send(stream);
    } finally {
      // Streaming respons Fastify selesai secara async setelah return -- cleanup di sini terlalu
      // dini kalau dipanggil langsung; daftarkan cleanup ke event 'close' response supaya jalan
      // SETELAH stream selesai dikirim, bukan sebelum. Ganti try/finally di atas dengan:
      reply.raw.on("close", () => { void cleanup(); });
    }
  });

  app.delete<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>("/api/devices/:shortCode/files", async (req, reply) => {
    await service.deleteFile(req.params.shortCode, req.query.remotePath);
    reply.code(204).send();
  });

  app.post<{ Params: { shortCode: string }; Body: { oldPath: string; newPath: string } }>("/api/devices/:shortCode/files/rename", async (req, reply) => {
    await service.renameFile(req.params.shortCode, req.body.oldPath, req.body.newPath);
    reply.code(204).send();
  });

  app.get<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>("/api/devices/:shortCode/files/parse-3mf", async (req) => {
    return service.parseThreemfForDevice(req.params.shortCode, req.query.remotePath);
  });

  app.get<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>("/api/devices/:shortCode/files/thumbnail", async (req, reply) => {
    const dataUrl = await service.getFileThumbnail(req.params.shortCode, req.query.remotePath);
    if (!dataUrl) {
      reply.code(404).send();
      return;
    }
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    reply.header("Content-Type", "image/png");
    reply.send(Buffer.from(base64, "base64"));
  });
```

**Fix the `download` route's cleanup logic above** — the `try/finally` shown has a comment explaining why it's wrong; the ACTUAL correct code only uses the `reply.raw.on("close", ...)` line, not a `finally` block at all. Write it as:

```ts
  app.get<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>("/api/devices/:shortCode/files/download", async (req, reply) => {
    const { tempPath, cleanup } = await relayDownload(service, req.params.shortCode, req.query.remotePath);
    const stream = createReadStream(tempPath);
    reply.raw.on("close", () => { void cleanup(); });
    reply.header("Content-Type", "application/octet-stream");
    return reply.send(stream);
  });
```

Also add error mapping for the throw-vs-return contract (spec §Routing): wrap the file-operation routes so `Error("device_not_found")` becomes 404 and any other thrown error becomes 502 (upstream/printer failure) rather than an unhandled 500. Use a Fastify `setErrorHandler` registered once in `http-server.ts` rather than per-route try/catch:

```ts
// apps/agent-headless/src/http-server.ts — add before returning `app`:
app.setErrorHandler((error, _req, reply) => {
  if (error.message === "device_not_found") {
    reply.code(404).send({ error: "device_not_found" });
    return;
  }
  // File-operation errors that aren't the known device_not_found case are treated as upstream
  // (printer) failures, not daemon bugs -- 502, and the raw error message is NOT sent to the
  // client (logged server-side via runtime.logger only).
  runtime.logger.error("[agent-headless] unhandled route error", error);
  reply.code(502).send({ error: "upstream_error" });
});
```

(This requires `http-server.ts` to have `runtime` in scope where `setErrorHandler` is registered — it already does, as `createHttpServer`'s first parameter.)

- [ ] **Step 6: Register `@fastify/multipart` plugin**

```ts
// apps/agent-headless/src/http-server.ts — add import and registration:
import multipart from "@fastify/multipart";

export function createHttpServer(runtime: AgentRuntime, service: AgentService): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(multipart);
  // ... rest unchanged
```

- [ ] **Step 7: Add tests for the file-operation routes**

```ts
// apps/agent-headless/src/routes/agent-routes.test.ts — add:
describe("GET /api/devices/:shortCode/files", () => {
  it("device tak dipasang -> 404 device_not_found", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "GET", url: "/api/devices/UNKNOWN/files?path=/" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/devices/:shortCode/files/thumbnail", () => {
  it("extension bukan .gcode/.gcode.3mf -> 404", async () => {
    const { app } = makeFixture({ agentToken: null, devices: { ABC: { ip: "x", serial: "s", accessCode: "c" } } });
    const res = await app.inject({ method: "GET", url: "/api/devices/ABC/files/thumbnail?remotePath=/file.txt" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run`
Expected: PASS, all files.

- [ ] **Step 9: Typecheck**

Run: `cd apps/agent-headless && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/agent-headless/src/file-transfer.ts apps/agent-headless/src/file-transfer.test.ts apps/agent-headless/src/routes/agent-routes.ts apps/agent-headless/src/routes/agent-routes.test.ts apps/agent-headless/src/http-server.ts apps/agent-headless/src/http-server.test.ts
git commit -m "feat(agent-headless): add file-operation routes with temp-file relay, error-status mapping"
```

---

### Task 12: `index.ts` bootstrap + signal handlers

**Files:**
- Modify: `apps/agent-headless/src/index.ts`
- Create: `apps/agent-headless/src/index.test.ts` (tests the bootstrap function in isolation, not the real `process.on`/`process.exit` wiring, which isn't unit-testable)

**Interfaces:**
- Consumes: everything built in Tasks 1-11.
- Produces: `bootstrap(): Promise<{app: FastifyInstance; runtime: AgentRuntime}>` (exported for testing) plus a `main()` that's only invoked when the file is run directly (not imported by tests).

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent-headless/src/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { bootstrap } from "./index";

vi.mock("@3pb/agent-core", async () => {
  const actual = await vi.importActual<typeof import("@3pb/agent-core")>("@3pb/agent-core");
  return { ...actual, loadOrCreateConfig: vi.fn().mockResolvedValue({ saasBaseUrl: "http://test.example.com" }) };
});

describe("bootstrap", () => {
  it("HTTP server bisa di-inject SEBELUM runtime.start() dipanggil (urutan HTTP-dulu)", async () => {
    const { app } = await bootstrap({ skipRuntimeStart: true });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("/healthz reachable bahkan kalau runtime.start() belum selesai (dipanggil tapi tidak di-await sebelum server siap)", async () => {
    const { app, runtime } = await bootstrap({});
    expect(runtime).toBeDefined();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
    await runtime.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/index.test.ts`
Expected: FAIL — `bootstrap` isn't exported yet (current `index.ts` is Task 6's placeholder).

- [ ] **Step 3: Implement**

```ts
// apps/agent-headless/src/index.ts
import { AgentRuntime, AgentService, FileAesCredentialStore, loadOrCreateConfig } from "@3pb/agent-core";
import type { FastifyInstance } from "fastify";
import { NodePathProvider, NodeLogAdapter, NodeLogFileProvider, getNodeBuildInfo } from "./platform-node";
import { createHttpServer } from "./http-server";

const HTTP_PORT = 8080;

export interface BootstrapOptions {
  skipRuntimeStart?: boolean;
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<{ app: FastifyInstance; runtime: AgentRuntime }> {
  const pathProvider = new NodePathProvider();
  const logger = new NodeLogAdapter();
  const logFileProvider = new NodeLogFileProvider();
  const buildInfo = getNodeBuildInfo();
  const credentialStore = new FileAesCredentialStore(pathProvider.userDataDir());

  const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL);

  // Pi maker sering sudah menjalankan mosquitto di 1883 -- EADDRINUSE bikin daemon jalan tanpa
  // broker/engine (start() tidak throw, tapi diam-diam degraded, lihat /healthz). Konfigurabel
  // lewat env var, pola sama seperti AGENT_DATA_DIR di platform-node.ts, bukan field AgentConfig
  // baru (lebih ringan, tidak menyentuh config.ts/loadOrCreateConfig).
  const brokerPortEnv = process.env.AGENT_BROKER_PORT;
  const brokerPort = brokerPortEnv ? Number(brokerPortEnv) : undefined;

  const runtime = new AgentRuntime({
    credentialStore,
    pathProvider,
    logger,
    logFileProvider,
    buildInfo,
    saasBaseUrl: config.saasBaseUrl,
    updatePlatform: "linux",
    brokerPort,
  });

  const service = new AgentService(runtime);
  const app = createHttpServer(runtime, service);

  // HTTP dulu, baru runtime.start() -- kebalikan urutan Electron. Wizard/CLI harus tetap bisa
  // diagnosa daemon selama bootstrap yang bisa lama (broker listen timeout 10s, fetch SaaS,
  // connector printer). AgentRuntime.start() sudah dijamin tidak pernah throw (invariant dari
  // sub-project 1), dan AgentService toleran runtime belum start (broker_unavailable, snapshot
  // kosong) -- jadi aman menerima request sebelum start() selesai.
  await app.listen({ port: HTTP_PORT, host: "0.0.0.0" });

  if (!opts.skipRuntimeStart) {
    await runtime.start();
  }

  return { app, runtime };
}

async function main(): Promise<void> {
  const { app, runtime } = await bootstrap();

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close();
    await runtime.stop();
    process.exit(0);
  }

  process.on("SIGTERM", () => { void shutdown(); });
  process.on("SIGINT", () => { void shutdown(); });

  process.on("unhandledRejection", (err) => {
    runtime.logger.error("[agent-headless] unhandled rejection", err);
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    runtime.logger.error("[agent-headless] uncaught exception", err);
    process.exit(1);
  });
}

// Hanya jalan kalau file ini dieksekusi langsung (node dist/index.mjs), bukan saat di-import
// oleh test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[agent-headless] bootstrap gagal total", err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run src/index.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Full package test + typecheck**

Run: `cd apps/agent-headless && npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-headless/src/index.ts apps/agent-headless/src/index.test.ts
git commit -m "feat(agent-headless): wire bootstrap (HTTP-before-start) and signal handlers"
```

---

### Task 13: `--print-token` CLI mode + esbuild bundler

**Files:**
- Modify: `apps/agent-headless/src/index.ts`
- Create: `apps/agent-headless/src/index.test.ts` (add cases — modify existing file from Task 12)
- Create: `apps/agent-headless/scripts/build.mjs`

**Interfaces:**
- Produces: `node dist/index.mjs --print-token` — CLI mode that generates/reads the `apiToken` without starting HTTP or the runtime. Used by the install script (Task 14).

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent-headless/src/index.test.ts — add:
import { printToken } from "./index";
import { InMemoryCredentialStore } from "@3pb/agent-core";

describe("printToken", () => {
  it("generate token baru kalau belum ada, balikin string 64 hex char", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await printToken(store, logger);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("idempoten -- panggilan kedua balikin token yang sama", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const first = await printToken(store, logger);
    const second = await printToken(store, logger);
    expect(first).toBe(second);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent-headless && npx vitest run src/index.test.ts`
Expected: FAIL — `printToken` isn't exported.

- [ ] **Step 3: Implement**

```ts
// apps/agent-headless/src/index.ts — add import:
import { ensureApiToken, type CredentialStore, type CredentialBlob, type Logger } from "@3pb/agent-core";
```

```ts
// apps/agent-headless/src/index.ts — add exported function:
/**
 * Mode CLI singkat -- bangun credentialStore+logger SAJA (tanpa AgentRuntime/HTTP server),
 * panggil ensureApiToken, balikin. Idempoten -- aman dipanggil berkali-kali termasuk saat
 * re-run install script untuk update (tidak generate token baru kalau sudah ada).
 */
export async function printToken(store: CredentialStore<CredentialBlob>, logger: Logger): Promise<string> {
  return ensureApiToken(store, logger);
}
```

```ts
// apps/agent-headless/src/index.ts — modify main() to check for the flag before full bootstrap:
async function main(): Promise<void> {
  if (process.argv.includes("--print-token")) {
    const pathProvider = new NodePathProvider();
    const logger = new NodeLogAdapter();
    const store = new FileAesCredentialStore(pathProvider.userDataDir());
    const token = await printToken(store, logger);
    console.log(token);
    return;
  }

  const { app, runtime } = await bootstrap();
  // ... rest unchanged from Task 12
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent-headless && npx vitest run src/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the esbuild bundler script**

```js
// apps/agent-headless/scripts/build.mjs
import { build } from "esbuild";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, "..", "dist");

if (existsSync(outdir)) rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [join(__dirname, "..", "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: join(outdir, "index.mjs"),
  // agent-core diekspor sebagai .ts mentah (packages/agent-core/package.json "exports":
  // "./src/index.ts") -- esbuild resolve dan transpile-nya langsung sebagai bagian bundle,
  // tidak perlu package terpisah di-publish/build dulu.
  external: [], // semua dependency (aedes, mqtt, basic-ftp, dst) pure JS, dibundel semua
});

console.log(`Bundled to ${join(outdir, "index.mjs")}`);

execSync(`node ${join(__dirname, "build-info.mjs")}`, { stdio: "inherit" });
```

- [ ] **Step 6: Run the build and verify the bundle actually works**

Run: `cd apps/agent-headless && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && node scripts/build.mjs`
Expected: succeeds, `dist/index.mjs` and `dist/build-info.json` both exist.

Run: `AGENT_DATA_DIR=/tmp/agent-headless-smoketest node dist/index.mjs --print-token`
Expected: prints a 64-character hex string, exits 0. This is the first real smoke test that the bundle is actually runnable by Node without `node_modules` resolution errors — if it fails with a module-not-found error, investigate whether `external` needs adjusting or a dependency has a native binary (`aedes`/`mqtt`/etc. are all pure JS per the spec's research, but verify here rather than trusting that claim blindly).

- [ ] **Step 7: Typecheck**

Run: `cd apps/agent-headless && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/agent-headless/src/index.ts apps/agent-headless/src/index.test.ts apps/agent-headless/scripts/build.mjs
git commit -m "feat(agent-headless): add --print-token CLI mode and esbuild bundler"
```

---

### Task 14: systemd unit + install script

**Files:**
- Create: `apps/agent-headless/install/slizebiz-agent.service`
- Create: `apps/agent-headless/install/install.sh`
- Create: `apps/agent-headless/README.md`

**Interfaces:** none — this task produces deployment artifacts, not code consumed by other tasks.

This task cannot be fully automated-tested from an agent session (real systemd, real Raspberry Pi hardware) — write the artifacts correctly per the spec, verify what CAN be verified (shell script syntax, systemd unit syntax), and document the manual verification steps clearly.

- [ ] **Step 1: Write the systemd unit**

```ini
# apps/agent-headless/install/slizebiz-agent.service
[Unit]
Description=Slizebiz Agent (headless daemon)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=slizebiz-agent
StateDirectory=slizebiz-agent
WorkingDirectory=/opt/slizebiz-agent/current
ExecStart=/usr/bin/node /opt/slizebiz-agent/current/dist/index.mjs
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=5
TimeoutStopSec=20
PrivateTmp=yes
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/slizebiz-agent
Environment=SAAS_BASE_URL=
Environment=AGENT_DATA_DIR=/var/lib/slizebiz-agent
# Uncomment kalau port 1883 default bentrok dengan mosquitto/broker MQTT lain yang sudah jalan:
#Environment=AGENT_BROKER_PORT=18830

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Verify the unit file's syntax**

Run: `systemd-analyze verify apps/agent-headless/install/slizebiz-agent.service 2>&1 || echo "systemd-analyze not available on this machine (expected on macOS dev machine) -- syntax must be verified manually on a real Linux target before considering this task done"`
Expected: either a clean pass (Linux dev machine) or the fallback message (macOS) — note which happened in your report; if `systemd-analyze` isn't available, this specific verification is deferred to the manual Raspberry Pi test in Task 15.

- [ ] **Step 3: Write the install script**

```bash
#!/usr/bin/env bash
# apps/agent-headless/install/install.sh
set -euo pipefail

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  echo "Error: slizebiz-agent hanya mendukung arm64 (Raspberry Pi 4/5). Arsitektur terdeteksi: $ARCH" >&2
  exit 1
fi

RELEASE_URL="${SLIZEBIZ_AGENT_RELEASE_URL:-https://releases.slizebiz.com/agent-headless/latest/agent-headless-linux-arm64.tar.gz}"
INSTALL_ROOT="/opt/slizebiz-agent"
DATA_DIR="/var/lib/slizebiz-agent"
SERVICE_USER="slizebiz-agent"

echo "==> Mengunduh rilis dari $RELEASE_URL"
VERSION_DIR="$INSTALL_ROOT/releases/$(date +%Y%m%d%H%M%S)"
sudo mkdir -p "$VERSION_DIR"
curl -fsSL "$RELEASE_URL" | sudo tar -xz -C "$VERSION_DIR"

echo "==> Membuat user sistem $SERVICE_USER (kalau belum ada)"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "==> Memasang symlink current -> rilis baru"
sudo ln -sfn "$VERSION_DIR" "$INSTALL_ROOT/current"

echo "==> Memasang systemd unit"
sudo cp "$VERSION_DIR/install/slizebiz-agent.service" /etc/systemd/system/slizebiz-agent.service
sudo systemctl daemon-reload
sudo systemctl enable slizebiz-agent
sudo systemctl restart slizebiz-agent

echo "==> Menunggu daemon sehat..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null 2>&1; then
    echo "Daemon sehat."
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "Error: daemon tidak merespons /healthz setelah 30 detik. Cek: sudo journalctl -u slizebiz-agent -n 50" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Menyiapkan API token"
TOKEN="$(sudo -u "$SERVICE_USER" node "$INSTALL_ROOT/current/dist/index.mjs" --print-token)"
echo "$TOKEN" | sudo tee "$DATA_DIR/api-token" >/dev/null
sudo chown "root:$SERVICE_USER" "$DATA_DIR/api-token"
sudo chmod 0640 "$DATA_DIR/api-token"

IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "=========================================="
echo "Instalasi selesai."
echo "URL:   http://$IP:8080"
echo "Token: $TOKEN"
echo "(token juga tersimpan di $DATA_DIR/api-token, permission 0640 root:$SERVICE_USER)"
echo "=========================================="
```

- [ ] **Step 4: Verify the script's shell syntax**

Run: `bash -n apps/agent-headless/install/install.sh`
Expected: no output (syntax valid). This checks syntax only — it does NOT execute the script (no `sudo`, no real download, no real systemd) since this session isn't running on target hardware.

- [ ] **Step 5: Write the README documenting manual verification**

```markdown
# apps/agent-headless/README.md
# Slizebiz Agent — Headless Daemon

Daemon Node.js murni (tanpa Electron) untuk Raspberry Pi (arm64) / Linux server, expose
`AgentService` yang sama dipakai app Electron lewat REST API.

## Build

\`\`\`bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm install
cd apps/agent-headless
pnpm build   # hasil: dist/index.mjs + dist/build-info.json
\`\`\`

## Install (Raspberry Pi arm64)

\`\`\`bash
curl -fsSL https://releases.slizebiz.com/agent-headless/install.sh | bash
\`\`\`

## Verifikasi manual (WAJIB sebelum dianggap selesai produksi — tidak bisa otomatis dari sesi agent)

1. Deploy ke Raspberry Pi arm64 fisik, jalankan `install.sh`.
2. `curl http://<ip-pi>:8080/healthz` — harus 200, tanpa perlu token.
3. `curl -H "Authorization: Bearer $(cat /var/lib/slizebiz-agent/api-token)" http://<ip-pi>:8080/api/broker-info` — harus 200.
4. `curl http://<ip-pi>:8080/api/broker-info` (tanpa token) — harus 401.
5. `sudo systemctl restart slizebiz-agent` — cek credential/apiToken/brokerPin TIDAK hilang setelah restart (`/api/credential-store-status` harus `{degraded:false}` seperti sebelumnya, token file tetap sama).
6. Model ancaman: HTTP di port 8080 TIDAK terenkripsi (plain HTTP, bukan HTTPS) — dokumentasi ini WAJIB dibaca sebelum expose daemon ke jaringan selain LAN tepercaya.

## Model ancaman v1

- Auth: Bearer token 32-byte (`apiToken`), TERPISAH dari PIN broker MQTT (`brokerPin`, 4 digit, cuma untuk CYD).
- Plain HTTP (tanpa TLS) — asumsi LAN rumah/workshop tepercaya, sama seperti asumsi broker MQTT yang sudah ada.
- Rate limiter berlaku untuk SEMUA alamat termasuk loopback (beda dari broker MQTT).
```

- [ ] **Step 6: Commit**

```bash
git add apps/agent-headless/install/slizebiz-agent.service apps/agent-headless/install/install.sh apps/agent-headless/README.md
git commit -m "feat(agent-headless): add systemd unit, install script, and deployment README"
```

---

### Task 15: Final verification

**Files:** none — verification-only task.

- [ ] **Step 1: Full test suite for affected packages**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-headless-daemon && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/agent-core test && pnpm --filter @3pb/agent test --testTimeout=15000 && pnpm --filter @3pb/agent-headless test`
Expected: all three green. (`apps/agent` test suite is included specifically to confirm the 5 `packages/agent-core` prerequisite changes — Tasks 1-5 — didn't regress the existing Electron app, which is the load-bearing "pure refactor" claim of this whole plan's first half.)

- [ ] **Step 2: Typecheck all three**

Run: `pnpm --filter @3pb/agent-core exec tsc --noEmit && pnpm --filter @3pb/agent exec tsc --noEmit && pnpm --filter @3pb/agent-headless exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Real bundle build + smoke test**

Run: `cd apps/agent-headless && node scripts/build.mjs && AGENT_DATA_DIR=/tmp/agent-headless-final-smoketest node dist/index.mjs --print-token`
Expected: build succeeds, prints a 64-char hex token, exits 0.

Run a second smoke test starting the full daemon briefly:
```bash
AGENT_DATA_DIR=/tmp/agent-headless-final-smoketest node dist/index.mjs &
DAEMON_PID=$!
sleep 2
curl -fsS http://127.0.0.1:8080/healthz
kill -TERM $DAEMON_PID
wait $DAEMON_PID 2>/dev/null || true
```
Expected: `/healthz` responds 200 with real JSON, and the process exits cleanly (not killed forcefully) after SIGTERM — confirming the signal handler from Task 12 actually works end-to-end, not just in the mocked unit test.

- [ ] **Step 4: Grep for accidental scope violations**

```bash
grep -rn "brokerPin" apps/agent-headless/src/ | grep -v "\.test\.ts" || echo "none found -- confirms Global Constraint: apiToken never conflated with brokerPin in production code"
grep -rn "localPath" apps/agent-headless/src/routes/agent-routes.ts || echo "none found -- confirms uploadFile/downloadFile never exposed with raw localPath in the route layer"
```
Expected: "none found" for both (or, for the first grep, only comments explaining WHY they're separate — check by hand if any match appears, don't just fail the task on any match without reading it).

- [ ] **Step 5: Document what's NOT verified here**

Write a note in your task report: this plan builds and unit-tests the daemon core, but does NOT verify: real deployment to Raspberry Pi hardware, real systemd behavior (`Restart=on-failure`, `StateDirectory` auto-creation), real MQTT broker port conflicts with pre-existing `mosquitto` installs, or the actual `curl|bash` install flow end-to-end. These require physical hardware access this session doesn't have — flag them as required manual follow-up (same pattern as sub-project 1's final verification tasks), pointing at the README's "Verifikasi manual" section written in Task 14.

- [ ] **Step 6: Commit any fixes found**

If everything passes cleanly, no additional commit is needed. If a fix was required, commit it separately with `git add <specific files>` and a message describing the specific finding.

---
