# Agent Desktop — Broker Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the "anyone on the customer's LAN can connect to the Agent's embedded MQTT broker" hole by requiring a 4-digit PIN (as MQTT CONNECT password) on every connection, with per-IP rate limiting, safe unattended bootstrap, and the PIN surfaced to the user next to the existing broker IP:port line.

**Architecture:** A PIN is generated once (or reused from `credentials.enc`) by `ensureBrokerPin()` in `credential-store.ts`, resolved in `bootstrap()` (`index.ts`) before the broker starts, and threaded as a plain parameter through every layer that needs it: `startBroker(port, pin)` installs an Aedes `authenticate` handler; `startEngine(paired, brokerPort, pin)` and `publishLayout(token, brokerPort, cydDeviceId, pin)` pass it to their `MqttReporter`/`mqtt.connectAsync` calls as the CONNECT password (with a placeholder username, since MQTT requires the username flag for password to transmit). `DashboardScreen.tsx` displays it via the extended `agent:get-broker-info` IPC response.

**Tech Stack:** Electron main process (TypeScript), Aedes embedded MQTT broker, `node:crypto` (`randomInt`), `mqtt` client library, Vitest.

## Global Constraints

- PIN is **4 digits, zero-padded string** (`"0042"`, not a number) — generated with `crypto.randomInt(0, 10000)`, never `Math.random()`.
- PIN is **never logged** anywhere in this feature — only its presence/absence.
- Rate limit: **5 failed attempts within a rolling window locks that source IP for 60 seconds**; loopback (`127.0.0.1` and native `::1`, after stripping the `::ffff:` IPv4-mapped prefix from the raw address) is **exempt from rate limiting but still must present the correct PIN**.
- A lockout rejection must **never extend its own lockout** — only a genuine PIN comparison touches the failure counter.
- `credential-store.ts`'s existing `loadCredentials()` behavior (never throws, collapses missing/corrupted/encryption-unavailable to `EMPTY_BLOB`) **must not change** — the new PIN bootstrap works around it, not through it.
- `packages/printer-monitor-core` must **not** import anything from `apps/agent` (no `credential-store.ts`, no cross-package coupling) — `MqttReporterOpts` only gains a plain optional `password?: string` field.
- No task in this plan touches `apps/agent/package.json` version — no version bump implied or authorized here.

---

### Task 1: `credential-store.ts` — `brokerPin` field + safe bootstrap + clear helper

**Files:**
- Modify: `apps/agent/src/main/credential-store.ts`
- Test: `apps/agent/src/main/credential-store.test.ts`

**Interfaces:**
- Consumes: nothing new (existing `app`, `safeStorage`, `fs`, `path`).
- Produces:
  - `CredentialBlob` gains `brokerPin?: string`.
  - `ensureBrokerPin(): Promise<string>` — resolves to the current PIN, generating and persisting it on genuine first run only.
  - `clearBrokerPin(blob: CredentialBlob): CredentialBlob` — pure function, no I/O, returns a copy of `blob` with `brokerPin` removed.
  - Both are used by Task 8 (`index.ts` bootstrap) and available for a future manual regenerate action.

- [ ] **Step 1: Write the failing tests**

Add to `apps/agent/src/main/credential-store.test.ts` (after the existing `describe("saveCredentials", ...)` block):

```typescript
describe("ensureBrokerPin", () => {
  it("genuinely first run (no file, encryption available) -> generate PIN 4-digit dan persist", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    const pin = await ensureBrokerPin();
    expect(pin).toMatch(/^\d{4}$/);
    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = JSON.parse(
      (safeStorage.decryptString as any)((fs.writeFileSync as any).mock.calls[0][1])
    );
    expect(written.brokerPin).toBe(pin);
  });

  it("blob sudah punya brokerPin -> pakai yang tersimpan, TIDAK generate baru / TIDAK saveCredentials lagi", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      Buffer.from(`ENC(${JSON.stringify({ agentToken: null, devices: {}, brokerPin: "0042" })})`)
    );
    const pin = await ensureBrokerPin();
    expect(pin).toBe("0042");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("file ADA tapi decrypt gagal -> PIN in-memory-only, TIDAK PERNAH panggil saveCredentials (data-loss guard)", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from("corrupt"));
    (safeStorage.decryptString as any).mockImplementationOnce(() => {
      throw new Error("DPAPI fail");
    });
    const pin = await ensureBrokerPin();
    expect(pin).toMatch(/^\d{4}$/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("genuinely first run TAPI safeStorage.isEncryptionAvailable() false -> PIN in-memory-only, TIDAK PERNAH panggil saveCredentials", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    (safeStorage.isEncryptionAvailable as any).mockReturnValueOnce(false);
    const pin = await ensureBrokerPin();
    expect(pin).toMatch(/^\d{4}$/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

describe("clearBrokerPin", () => {
  it("hapus brokerPin dari blob, sisa field (agentToken/devices) tak tersentuh -- pure function, no I/O", () => {
    const blob = { agentToken: "slz_x", devices: { a: { ip: "1.1.1.1", serial: "S", accessCode: "1234" } }, brokerPin: "0042" };
    const result = clearBrokerPin(blob);
    expect(result).toEqual({ agentToken: "slz_x", devices: blob.devices, brokerPin: undefined });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
```

Update the top import line to include the new exports:

```typescript
import { loadCredentials, saveCredentials, ensureBrokerPin, clearBrokerPin } from "./credential-store";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent && npx vitest run src/main/credential-store.test.ts`
Expected: FAIL — `ensureBrokerPin`/`clearBrokerPin` not exported.

- [ ] **Step 3: Implement**

Replace the full content of `apps/agent/src/main/credential-store.ts` with:

```typescript
import { app, safeStorage } from "electron";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface DeviceSecret {
  ip: string;
  serial: string;
  accessCode: string;
}

export interface CredentialBlob {
  agentToken: string | null;
  devices: Record<string, DeviceSecret>;
  // String (bukan number) supaya leading zero ("0042") tak hilang. Opsional -- blob lama
  // (pra-fitur ini) tak punya field ini sama sekali, bukan error.
  brokerPin?: string;
}

const EMPTY_BLOB: CredentialBlob = { agentToken: null, devices: {} };

function credentialFilePath(): string {
  return path.join(app.getPath("userData"), "credentials.enc");
}

/** Tak pernah throw — file absen/gagal decrypt/enkripsi tak tersedia semuanya jadi blob kosong (minta pairing ulang). */
export async function loadCredentials(): Promise<CredentialBlob> {
  const filePath = credentialFilePath();
  if (!safeStorage.isEncryptionAvailable()) return EMPTY_BLOB;
  if (!fs.existsSync(filePath)) return EMPTY_BLOB;
  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted) as CredentialBlob;
  } catch {
    return EMPTY_BLOB;
  }
}

export async function saveCredentials(blob: CredentialBlob): Promise<void> {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(blob));
  fs.writeFileSync(credentialFilePath(), encrypted);
}

function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

/**
 * Bootstrap PIN broker -- dipanggil SEKALI tiap startup (bootstrap() di index.ts), TANPA
 * user di loop, jadi harus lebih hati-hati dari loadCredentials() biasa: loadCredentials()
 * sengaja tak bisa bedakan "file belum ada" vs "file ada tapi gagal didekripsi" (keduanya
 * balik EMPTY_BLOB) -- aman untuk pemanggil lama (pairing, user-triggered) karena blob
 * kosong cuma berarti "minta user pairing ulang". TAPI kalau fungsi ini naif langsung
 * `if (!blob.brokerPin) { generate+save }`, satu file yang corrupt (bukan genuinely
 * kosong) bakal DITIMPA jadi blob isi PIN doang -- agentToken & SEMUA DeviceSecret hilang
 * permanen. Makanya cek fs.existsSync() SENDIRI di sini (sebelum loadCredentials meleburkan
 * bedanya) dan HANYA persist kalau file BENAR-BENAR belum ada DAN safeStorage tersedia
 * (saveCredentials() -> encryptString() throw kalau tidak).
 */
export async function ensureBrokerPin(): Promise<string> {
  const fileExists = fs.existsSync(credentialFilePath());
  // Dicek SEBELUM loadCredentials() -- loadCredentials() juga memanggil
  // isEncryptionAvailable() secara internal, tapi nilai KEDUANYA harus konsisten dalam satu
  // pemanggilan ensureBrokerPin(). Kalau dicek ulang belakangan (di canPersist), pemanggil
  // yang mock isEncryptionAvailable() cuma sekali (mockReturnValueOnce) akan salah kena --
  // konsumsi mock-once itu keburu diserap panggilan internal loadCredentials(), bukan
  // panggilan eksplisit di sini.
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const blob = await loadCredentials();
  if (blob.brokerPin) return blob.brokerPin;

  const pin = generatePin();
  const canPersist = fileExists === false && encryptionAvailable;
  if (!canPersist) {
    // Jangan pernah log nilai PIN -- cuma catat bahwa bootstrap jatuh ke mode session-only.
    console.error(
      "[credential-store] tak bisa simpan PIN baru dengan aman (file ada tapi tak terbaca, atau enkripsi tak tersedia) -- pakai PIN session-only untuk run ini",
    );
    return pin;
  }
  await saveCredentials({ ...blob, brokerPin: pin });
  return pin;
}

/** Pure function, no I/O -- hapus brokerPin dari blob (dipakai future regenerate action / support guidance), BUKAN hapus seluruh file credentials.enc. */
export function clearBrokerPin(blob: CredentialBlob): CredentialBlob {
  return { ...blob, brokerPin: undefined };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agent && npx vitest run src/main/credential-store.test.ts`
Expected: PASS, all tests including the 4 new `describe` blocks.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/credential-store.ts apps/agent/src/main/credential-store.test.ts
git commit -m "feat(agent): safe broker PIN bootstrap in credential-store"
```

---

### Task 2: `broker.ts` — `authenticate` handler + per-IP rate limiting

**Files:**
- Modify: `apps/agent/src/main/broker.ts`
- Test: `apps/agent/src/main/broker.test.ts` (rewritten — existing tests updated to authenticate with a PIN, new auth/rate-limit tests added)

**Interfaces:**
- Consumes: nothing new.
- Produces: `startBroker(port: number, pin: string): Promise<BrokerStartResult>` — **signature change**, `pin` is now a required second parameter (previously `startBroker(port = 1883)`). `stopBroker()` unchanged.

- [ ] **Step 1: Write the failing tests**

Replace the full content of `apps/agent/src/main/broker.test.ts` with:

```typescript
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
```

Since real TCP connections from a Vitest process all originate from `127.0.0.1` (which is the exempt loopback address), the 5-attempts-then-locked-out assertion needs to exercise the rate-limit bookkeeping directly rather than through real sockets from a non-loopback IP. Add a second, narrowly-scoped test-only export to make this testable without reaching into module internals via hacks. Add this to the **Interfaces** the implementation must produce, and add the corresponding test:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent && npx vitest run src/main/broker.test.ts`
Expected: FAIL — `startBroker` still takes 1 arg, no `authenticate` handler, `__resetRateLimitForTests`/`__checkPinForTests` not exported.

- [ ] **Step 3: Implement**

Replace the full content of `apps/agent/src/main/broker.ts` with:

```typescript
import Aedes from "aedes";
import net from "node:net";
import type { Socket } from "node:net";

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

// --- Auth: PIN + rate limit per source IP -----------------------------------------------
// Map di level modul (bukan per-instance broker) sengaja tak persisten -- reset alami
// tiap proses Agent restart. Nilai `lockedUntil` CUMA diisi > 0 sekali count mencapai
// MAX_ATTEMPTS (lihat recordFailure) -- entry dengan count < MAX_ATTEMPTS PUNYA
// lockedUntil = 0 selamanya sampai count-nya sendiri mencapai ambang, supaya window
// "5 gagal" beneran terakumulasi (bukan direset tiap percobaan berikutnya).
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

interface RateLimitEntry {
  count: number;
  lockedUntil: number;
}

let rateLimitMap = new Map<string, RateLimitEntry>();

/** Hanya dipakai test -- reset state rate-limit antar `it()` supaya tak saling bocor. */
export function __resetRateLimitForTests(): void {
  rateLimitMap = new Map();
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

// Kode return CONNACK MQTT 3.1.1 (bukan diimpor dari aedes -- AuthErrorCode di sana adalah
// `const enum`, dan tsconfig apps/agent pakai `isolatedModules: true` yang melarang referensi
// const enum lintas modul/paket [TS error TS1204]. Nilainya sama persis (spec MQTT 3.1.1 §3.2.2.3).
const CONNACK_BAD_USERNAME_OR_PASSWORD = 4;
const CONNACK_NOT_AUTHORIZED = 5;

function authErr(code: number): Error & { returnCode: number } {
  const err = new Error("mqtt auth rejected") as Error & { returnCode: number };
  err.returnCode = code;
  return err;
}

/**
 * Inti logika autentikasi, diekstrak dari Aedes callback style supaya bisa dites langsung
 * (deterministik, tanpa buka socket TCP asli -- lihat __checkPinForTests). `addr` sudah
 * harus dinormalisasi oleh caller.
 */
function checkPin(addr: string, presentedPassword: string, pin: string): { ok: boolean; locked: boolean } {
  const loopback = isLoopback(addr);
  const now = Date.now();

  if (!loopback) {
    const entry = rateLimitMap.get(addr);
    if (entry && entry.lockedUntil > 0) {
      if (now < entry.lockedUntil) {
        // Locked -- JANGAN bandingkan PIN, JANGAN sentuh counter/lockedUntil. Kalau tidak,
        // retry-loop legit (mis. CYD reconnect tiap beberapa detik) bisa memperpanjang
        // lockout dirinya sendiri tanpa akhir.
        return { ok: false, locked: true };
      }
      // Cooldown sudah habis -- fresh start, budget penuh MAX_ATTEMPTS lagi, bukan sisa count lama.
      rateLimitMap.delete(addr);
    }
  }

  if (presentedPassword === pin) {
    if (!loopback) rateLimitMap.delete(addr); // sukses -- buang entry, jangan cuma reset ke 0 (biar map tak numpuk)
    return { ok: true, locked: false };
  }

  if (!loopback) {
    const entry = rateLimitMap.get(addr) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
    rateLimitMap.set(addr, entry);
  }
  return { ok: false, locked: false };
}

/** Hanya dipakai test -- expose checkPin() dengan address mentah (skip normalisasi via socket asli). */
export function __checkPinForTests(rawAddr: string, presentedPassword: string, pin: string): { ok: boolean; locked: boolean } {
  return checkPin(normalizeAddress(rawAddr), presentedPassword, pin);
}

// Ditype longgar (bukan `Client` dari aedes) supaya bebas dari kerumitan `Connection =
// Duplex | Socket` di tipe resminya -- broker ini SELALU TCP polos (net.createServer),
// jadi `client.conn` di runtime selalu net.Socket asli. Assignment ke `aedesInstance.authenticate`
// di bawah pakai satu cast eksplisit yang terdokumentasi, bukan `any` menyebar ke mana-mana.
function createAuthenticateHandler(pin: string) {
  return (
    client: { conn: Socket },
    _username: string | undefined,
    password: Buffer | undefined,
    done: (error: (Error & { returnCode: number }) | null, success: boolean | null) => void,
  ) => {
    const addr = normalizeAddress(client.conn?.remoteAddress);
    const presented = password ? password.toString("utf8") : "";
    const { ok, locked } = checkPin(addr, presented, pin);
    if (ok) {
      done(null, true);
      return;
    }
    done(authErr(locked ? CONNACK_NOT_AUTHORIZED : CONNACK_BAD_USERNAME_OR_PASSWORD), false);
  };
}
// -----------------------------------------------------------------------------------------

export async function startBroker(port = 1883, pin: string): Promise<BrokerStartResult> {
  // Idempotent: starting twice without an intervening stop would otherwise
  // leak the previous net.Server + Aedes instance (and its client sockets).
  await stopBroker();
  __resetRateLimitForTests(); // PIN baru tiap start (mis. beda instance di test) -> state rate-limit lama tak relevan

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
    // Cast eksplisit -- lihat komentar di createAuthenticateHandler soal kenapa parameter
    // client di sini ditype longgar ({conn: Socket}) daripada `Client` resmi aedes.
    aedesInstance.authenticate = createAuthenticateHandler(pin) as typeof aedesInstance.authenticate;
    server = net.createServer(aedesInstance.handle);
    // WAJIB settle untuk SEMUA kode error, bukan cuma EADDRINUSE. EACCES (port di rentang
    // excluded Hyper-V/WSL di Windows), EADDRNOTAVAIL, dsb. dulu bikin promise ini tak
    // pernah settle -> `await startBroker()` di bootstrap() menggantung -> crash-guard
    // try/catch/finally Task 10 terlewati total (proses hidup, tanpa window, tanpa IPC).
    server.once("error", (err: NodeJS.ErrnoException) => {
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
    server.listen(port, () => settle({ ok: true, port }));
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
```

Note: `__resetRateLimitForTests()` is called unconditionally inside `startBroker()` itself (not just from tests) — this is intentional per Global Constraints ("no persistence needed — resets on Agent restart"); since `startBroker()` is also what tests call directly, this keeps production and test behavior identical rather than adding a test-only branch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agent && npx vitest run src/main/broker.test.ts`
Expected: PASS, all tests including the new authenticate/rate-limit blocks.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/broker.ts apps/agent/src/main/broker.test.ts
git commit -m "feat(agent): PIN authentication + per-IP rate limiting on embedded broker"
```

---

### Task 3: `MqttReporterOpts` — optional `password` field

**Files:**
- Modify: `packages/printer-monitor-core/src/reporters/mqtt.ts`
- Test: `packages/printer-monitor-core/src/__tests__/mqtt-reporter.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MqttReporterOpts` gains optional `password?: string`; when present, `connect()` passes it (with a fixed placeholder `username: "agent"`) to `mqtt.connect()`. `packages/printer-monitor-core` still has zero knowledge of `credential-store.ts`/PIN bootstrap — this is a plain constructor parameter, exactly like `url`.

- [ ] **Step 1: Write the failing test**

Add to `packages/printer-monitor-core/src/__tests__/mqtt-reporter.test.ts`, inside the existing `describe("MqttReporter", ...)` block (after the last `it`):

```typescript
  it("password diteruskan sebagai auth CONNECT (dengan username placeholder) kalau opts.password diisi", async () => {
    const authServer = createServer();
    const authAedes = new Aedes()
    let received: { username?: string; password?: Buffer } = {}
    authAedes.authenticate = (_client, username, password, done) => {
      received = { username, password }
      done(null, password?.toString() === 'my-pin')
    }
    authServer.on('connection', authAedes.handle)
    await new Promise<void>((res) => authServer.listen(0, () => res()))
    const authPort = (authServer.address() as { port: number }).port

    const rep = new MqttReporter({ url: `mqtt://127.0.0.1:${authPort}`, password: 'my-pin' })
    await rep.connect()
    await rep.close()

    expect(received.password?.toString()).toBe('my-pin')
    expect(received.username).toBeTruthy() // MQTT butuh username flag diset biar password ikut terkirim

    authAedes.close()
    authServer.close()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/printer-monitor-core && npx vitest run src/__tests__/mqtt-reporter.test.ts`
Expected: FAIL — `connect()` never sends a password, `received.password` is `undefined`.

- [ ] **Step 3: Implement**

Replace the full content of `packages/printer-monitor-core/src/reporters/mqtt.ts` with:

```typescript
import mqtt, { type MqttClient } from 'mqtt'
import type { Reporter } from '../engine'
import type { PrinterEvent, PrintersPayload } from '../types'

export interface MqttReporterOpts {
  url: string
  statusTopic?: string
  eventsTopic?: string
  // Password CONNECT MQTT -- opsional (broker lain, mis. mosquitto homelab, tak butuh
  // ini). Kalau diisi, dikirim bareng username placeholder tetap ("agent") karena MQTT
  // 3.1.1 butuh username flag diset biar client library benar-benar mengirim password.
  password?: string
}

const MQTT_AUTH_USERNAME_PLACEHOLDER = 'agent'

export class MqttReporter implements Reporter {
  private client: MqttClient | null = null
  private statusTopic: string
  private eventsTopic: string
  constructor(private opts: MqttReporterOpts) {
    this.statusTopic = opts.statusTopic ?? '3dpb/printers-v2'
    this.eventsTopic = opts.eventsTopic ?? '3dpb/printer-events'
  }
  connect(): Promise<void> {
    return new Promise((res, rej) => {
      this.client = mqtt.connect(this.opts.url, {
        reconnectPeriod: 5000,
        ...(this.opts.password !== undefined
          ? { username: MQTT_AUTH_USERNAME_PLACEHOLDER, password: this.opts.password }
          : {}),
      })
      this.client.on('error', (err) => {
        console.error('[mqtt-reporter]', err.message)
        rej(err)
      })
      this.client.once('connect', () => res())
    })
  }
  async publishStatus(p: PrintersPayload): Promise<void> {
    await this.client?.publishAsync(this.statusTopic, JSON.stringify(p), { retain: true })
  }
  async emitEvent(e: PrinterEvent): Promise<void> {
    await this.client?.publishAsync(this.eventsTopic, JSON.stringify(e))
  }
  async close(): Promise<void> { await this.client?.endAsync() }
}
```

Add the `createServer`/`Aedes` imports the new test needs to the top of `mqtt-reporter.test.ts` if not already present — check the existing top-of-file imports (`createServer`, `type Server`, `Aedes`, `mqtt` are already imported for the `beforeAll` block); no new imports needed since the new test reuses `createServer`/`Aedes`/`MqttReporter` already in scope.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/printer-monitor-core && npx vitest run src/__tests__/mqtt-reporter.test.ts`
Expected: PASS, all tests including the new password test.

- [ ] **Step 5: Commit**

```bash
git add packages/printer-monitor-core/src/reporters/mqtt.ts packages/printer-monitor-core/src/__tests__/mqtt-reporter.test.ts
git commit -m "feat(printer-monitor-core): optional MQTT auth password on MqttReporter"
```

---

### Task 4: `layout-publisher.ts` — thread PIN through `publishLayout()`

**Files:**
- Modify: `apps/agent/src/main/layout-publisher.ts`
- Test: `apps/agent/src/main/layout-publisher.test.ts`

**Interfaces:**
- Consumes: nothing new (plain string parameter).
- Produces: `publishLayout(token: string, brokerPort: number, cydDeviceId: string, pin: string): Promise<{ published: boolean }>` — **signature change**: `cydDeviceId` (previously defaulted to `"default"`) and `pin` both become explicit params here since `pin` must come after it positionally and can no longer rely on a trailing default alone; callers (Task 8's `index.ts`, Task 7's `ipc.ts`) always pass all four explicitly.

- [ ] **Step 1: Write the failing tests**

Replace the full content of `apps/agent/src/main/layout-publisher.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./saas-client", () => ({ fetchLayout: vi.fn() }));

const publishAsyncMock = vi.fn().mockResolvedValue(undefined);
const endAsyncMock = vi.fn().mockResolvedValue(undefined);
const connectAsyncMock = vi.fn(() => Promise.resolve({ publishAsync: publishAsyncMock, endAsync: endAsyncMock }));
vi.mock("mqtt", () => ({
  default: { connectAsync: (...args: any[]) => connectAsyncMock(...args) },
}));

import { fetchLayout } from "./saas-client";
import { publishLayout } from "./layout-publisher";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishLayout", () => {
  it("skip publish (published:false) kalau layout belum diatur (data:null)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: true, data: null });
    const result = await publishLayout("slz_x", 1883, "default", "1234");
    expect(result).toEqual({ published: false });
    expect(publishAsyncMock).not.toHaveBeenCalled();
  });

  it("publish retained ke topic 3dpb/cyd/<deviceId>/layout kalau layout ada", async () => {
    const layout = { schemaVersion: 1, pages: [{ id: "p1", cells: [] }] };
    (fetchLayout as any).mockResolvedValue({ ok: true, data: layout });
    const result = await publishLayout("slz_x", 1883, "my-cyd-1", "1234");
    expect(result).toEqual({ published: true });
    expect(publishAsyncMock).toHaveBeenCalledWith("3dpb/cyd/my-cyd-1/layout", JSON.stringify(layout), { retain: true });
  });

  it("skip publish kalau fetchLayout gagal (network_error dll)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: false, kind: "network_error" });
    const result = await publishLayout("slz_x", 1883, "default", "1234");
    expect(result).toEqual({ published: false });
  });

  it("connect pakai PIN sebagai password + username placeholder", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: true, data: { schemaVersion: 1, pages: [] } });
    await publishLayout("slz_x", 1883, "default", "9042");
    expect(connectAsyncMock).toHaveBeenCalledWith(
      "mqtt://127.0.0.1:1883",
      expect.objectContaining({ username: expect.any(String), password: "9042" }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent && npx vitest run src/main/layout-publisher.test.ts`
Expected: FAIL — `publishLayout` doesn't accept a 4th arg yet, `connectAsync` called without options.

- [ ] **Step 3: Implement**

Replace the full content of `apps/agent/src/main/layout-publisher.ts` with:

```typescript
import mqtt from "mqtt";
import { fetchLayout } from "./saas-client";

const MQTT_AUTH_USERNAME_PLACEHOLDER = "agent";

/** cydDeviceId "default" sesuai kontrak lama §13 (1 layar CYD per akun, MVP sub-proyek 1). pin dipakai sebagai password CONNECT (lihat broker.ts authenticate). */
export async function publishLayout(
  token: string,
  brokerPort: number,
  cydDeviceId: string,
  pin: string,
): Promise<{ published: boolean }> {
  const result = await fetchLayout(token);
  if (!result.ok || result.data === null) return { published: false };

  const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${brokerPort}`, {
    username: MQTT_AUTH_USERNAME_PLACEHOLDER,
    password: pin,
  });
  await client.publishAsync(`3dpb/cyd/${cydDeviceId}/layout`, JSON.stringify(result.data), { retain: true });
  await client.endAsync();
  return { published: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agent && npx vitest run src/main/layout-publisher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/layout-publisher.ts apps/agent/src/main/layout-publisher.test.ts
git commit -m "feat(agent): publishLayout authenticates with broker PIN"
```

---

### Task 5: `app-state.ts` — `setBrokerPin`/`getBrokerPin`

**Files:**
- Modify: `apps/agent/src/main/app-state.ts`
- Test: `apps/agent/src/main/app-state.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `setBrokerPin(pin: string | null): void`, `getBrokerPin(): string | null` — mirrors the existing `setBrokerPort`/`getBrokerPort` pair exactly (module-level `let`, simple setter/getter, `null` initial value).

- [ ] **Step 1: Write the failing test**

Add to `apps/agent/src/main/app-state.test.ts` (new `describe` block, after the existing `describe("pickLocalIpCandidates", ...)`):

```typescript
describe("getBrokerPin/setBrokerPin", () => {
  it("default null, tersimpan+terbaca kembali persis seperti setBrokerPort/getBrokerPort", async () => {
    const { setBrokerPin, getBrokerPin } = await import("./app-state");
    expect(getBrokerPin()).toBeNull();
    setBrokerPin("0042");
    expect(getBrokerPin()).toBe("0042");
    setBrokerPin(null);
    expect(getBrokerPin()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/main/app-state.test.ts`
Expected: FAIL — `setBrokerPin`/`getBrokerPin` not exported.

- [ ] **Step 3: Implement**

In `apps/agent/src/main/app-state.ts`, add alongside the existing `brokerPort` state (after `let brokerPort: number | null = null;`):

```typescript
let brokerPin: string | null = null;
```

And alongside `export function setBrokerPort(...)`/`getBrokerPort()`:

```typescript
export function setBrokerPin(pin: string | null): void { brokerPin = pin; }
export function getBrokerPin(): string | null { return brokerPin; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/main/app-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/app-state.ts apps/agent/src/main/app-state.test.ts
git commit -m "feat(agent): setBrokerPin/getBrokerPin in app-state"
```

---

### Task 6: `engine-manager.ts` — thread PIN into `startEngine()` → `MqttReporter`

**Files:**
- Modify: `apps/agent/src/main/engine-manager.ts`
- Test: `apps/agent/src/main/engine-manager.test.ts`

**Interfaces:**
- Consumes: `MqttReporterOpts.password?: string` (Task 3).
- Produces: `startEngine(paired: PairedDevice[], brokerPort: number, pin: string): Promise<StartedEngine>` — **signature change**, `pin` is now a required 3rd parameter.

- [ ] **Step 1: Update the existing tests (they all currently call `startEngine(paired, 1883)`)**

In `apps/agent/src/main/engine-manager.test.ts`, update every `startEngine(...)` call to pass a third `"1234"` argument, and add one new assertion. The full set of changes:

1. Every existing call site — e.g. `await startEngine(paired, 1883)` → `await startEngine(paired, 1883, "1234")` — apply this to **all 8** call sites in the file (one per `it` block).
2. Add a new test right after the `"override statusTopic ke 3dpb/printers..."` test:

```typescript
  it("PIN diteruskan sebagai password ke MqttReporter", async () => {
    await startEngine([{ shortCode: "x", label: "L", printerType: "moonraker", secret: { ip: "10.0.0.5", serial: "", accessCode: "" } }], 1883, "9042");
    expect(MqttReporter).toHaveBeenCalledWith(expect.objectContaining({ password: "9042" }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent && npx vitest run src/main/engine-manager.test.ts`
Expected: FAIL — `startEngine` signature mismatch (TS) and the new password assertion fails.

- [ ] **Step 3: Implement**

In `apps/agent/src/main/engine-manager.ts`, change the function signature and the `MqttReporter` construction:

```typescript
export async function startEngine(paired: PairedDevice[], brokerPort: number, pin: string): Promise<StartedEngine> {
```

```typescript
  const reporter = new MqttReporter({
    url: `mqtt://127.0.0.1:${brokerPort}`,
    statusTopic: "3dpb/printers", // WAJIB override — default reporter "3dpb/printers-v2" salah buat kontrak CYD
    password: pin,
  });
```

(Leave every other line in the file untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agent && npx vitest run src/main/engine-manager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/engine-manager.ts apps/agent/src/main/engine-manager.test.ts
git commit -m "feat(agent): startEngine authenticates its MqttReporter with broker PIN"
```

---

### Task 7: `ipc.ts` + preload — expose PIN via `agent:get-broker-info`, thread PIN through `agent:sync`

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Test: `apps/agent/src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `getBrokerPin()`/`setBrokerPin()` (Task 5), `startEngine(paired, brokerPort, pin)` (Task 6), `publishLayout(token, brokerPort, cydDeviceId, pin)` (Task 4).
- Produces: `agent:get-broker-info` IPC handler now returns `{ ip: string; port: number | null; pin: string | null }`. `agentApi.getBrokerInfo()`'s declared return type in preload gains `pin`.

- [ ] **Step 1: Write the failing tests**

In `apps/agent/src/main/ipc.test.ts`, update the import line to include `getBrokerPin`/`setBrokerPin`:

```typescript
import { getEngine, setEngine, setBrokerPort, setBrokerPin, getReporters, setReporters } from "./app-state";
```

Update the existing `"'agent:get-broker-info' baca getBrokerPort() TERKINI tiap dipanggil"` test to also assert the PIN passthrough:

```typescript
  it("'agent:get-broker-info' baca getBrokerPort() dan getBrokerPin() TERKINI tiap dipanggil", async () => {
    registerIpcHandlers();
    setBrokerPort(1883);
    setBrokerPin("0042");
    expect(await handlers["agent:get-broker-info"]()).toEqual({ ip: expect.any(String), port: 1883, pin: "0042" });

    setBrokerPort(9999);
    setBrokerPin(null);
    expect(await handlers["agent:get-broker-info"]()).toEqual({ ip: expect.any(String), port: 9999, pin: null });

    setBrokerPort(null);
    setBrokerPin(null);
  });
```

In the `describe("agent:sync", ...)` block, every `it` calls `setBrokerPort(1883)` in its setup and `setBrokerPort(null)` in its cleanup (mirroring the real invariant that `brokerPort`/`brokerPin` are always set together in `bootstrap()` — Task 8). Pair each with `setBrokerPin(...)`:

1. In the test `"sukses: restart Engine dengan device terbaru, republish layout, balikin {ok:true, deviceCount}"` (starts `it("sukses: restart Engine...`): add `setBrokerPin("0042");` immediately after `setBrokerPort(1883);`, add `setBrokerPin(null);` immediately after the cleanup `setBrokerPort(null);`, and change:
   ```typescript
   expect(startEngine).toHaveBeenCalledWith(paired, 1883);
   expect(publishLayout).toHaveBeenCalledWith("slz_ok", 1883);
   ```
   to:
   ```typescript
   expect(startEngine).toHaveBeenCalledWith(paired, 1883, "0042");
   expect(publishLayout).toHaveBeenCalledWith("slz_ok", 1883, "default", "0042");
   ```

2. In the test `"SaaS unreachable tapi ada device ter-pairing dari cache -> ..."`: add `setBrokerPin("0042");` after `setBrokerPort(1883);`, add `setBrokerPin(null);` after the cleanup `setBrokerPort(null);`, and change:
   ```typescript
   expect(startEngine).toHaveBeenCalledWith(paired, 1883);
   ```
   to:
   ```typescript
   expect(startEngine).toHaveBeenCalledWith(paired, 1883, "0042");
   ```

3. In the remaining 4 tests in this `describe` block (`"startEngine gagal (mis. accessCode salah) -> ..."`, `"ganti Engine: Engine LAMA di-stop() SEBELUM ..."`, `"ganti Engine: reporter LAMA ... di-close() ..."`, `"reporter lama gagal di-close() ... -> dicatat, TIDAK bikin seluruh Sync gagal"`): add `setBrokerPin("0042");` immediately after each test's `setBrokerPort(1883);` line, and add `setBrokerPin(null);` immediately after each test's cleanup `setBrokerPort(null);` line. These 4 tests don't assert `startEngine`/`publishLayout` call arguments directly, so no assertion changes are needed in them — only the setup/cleanup pairing, to keep every test's broker state internally consistent with the real invariant.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: FAIL — handler doesn't return `pin`, `startEngine`/`publishLayout` called without the PIN argument.

- [ ] **Step 3: Implement**

In `apps/agent/src/main/ipc.ts`:

1. Update the import line:

```typescript
import { getEngine, setEngine, getBrokerPort, getBrokerPin, getLocalIp, getReporters, setReporters } from "./app-state";
```

2. Update the `agent:get-broker-info` handler:

```typescript
  ipcMain.handle("agent:get-broker-info", async () => {
    return { ip: getLocalIp(), port: getBrokerPort(), pin: getBrokerPin() };
  });
```

3. In the `agent:sync` handler, thread the PIN into both existing calls. `agent:sync` already returns `broker_unavailable` when `brokerPort === null`; since the PIN is only ever `null` in that exact same "broker never started" case (both are set together at the single `bootstrap()` call site — see Task 8), reading `getBrokerPin()` right after the existing `brokerPort === null` guard is always non-null past that point:

```typescript
    const brokerPort = getBrokerPort();
    if (brokerPort === null) return { ok: false, kind: "broker_unavailable" };
    const brokerPin = getBrokerPin() as string; // non-null past the guard above — brokerPort/brokerPin are always set together (bootstrap())
```

Then change:

```typescript
        const started = await startEngine(paired, brokerPort);
```

to:

```typescript
        const started = await startEngine(paired, brokerPort, brokerPin);
```

And change:

```typescript
    await publishLayout(blob.agentToken, brokerPort).catch((err) => {
```

to:

```typescript
    await publishLayout(blob.agentToken, brokerPort, "default", brokerPin).catch((err) => {
```

In `apps/agent/src/preload/index.ts`, update the `getBrokerInfo` type declaration:

```typescript
  getBrokerInfo: (): Promise<{ ip: string; port: number | null; pin: string | null }> =>
    ipcRenderer.invoke("agent:get-broker-info"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/preload/index.ts apps/agent/src/main/ipc.test.ts
git commit -m "feat(agent): expose broker PIN over IPC, thread it through agent:sync"
```

---

### Task 8: `index.ts` — wire `ensureBrokerPin()` into `bootstrap()`

**Files:**
- Modify: `apps/agent/src/main/index.ts`

**Interfaces:**
- Consumes: `ensureBrokerPin()` (Task 1), `startBroker(port, pin)` (Task 2), `setBrokerPin()` (Task 5), `startEngine(paired, brokerPort, pin)` (Task 6), `publishLayout(token, brokerPort, cydDeviceId, pin)` (Task 4).
- Produces: nothing new exported — this task only rewires the existing `bootstrap()` orchestration.

No dedicated test file exists for `index.ts` today (it's Electron's app-lifecycle entry point — `app.on('ready', ...)` orchestration isn't unit-tested anywhere in this codebase; every function it calls already has its own unit tests, which is what Tasks 1–7 cover). This task is verified by Task 10's full suite run (nothing regresses) plus a manual smoke check the task's Step 3 below describes — consistent with how this file has always been treated.

- [ ] **Step 1: Update imports**

In `apps/agent/src/main/index.ts`, change:

```typescript
import { loadCredentials } from './credential-store'
```

to:

```typescript
import { loadCredentials, ensureBrokerPin } from './credential-store'
```

and change:

```typescript
import { setEngine, setBrokerPort, setReporters, listLocalIpCandidates } from './app-state'
```

to:

```typescript
import { setEngine, setBrokerPort, setBrokerPin, setReporters, listLocalIpCandidates } from './app-state'
```

- [ ] **Step 2: Rewire `bootstrap()`**

Replace the body of `bootstrap()` from the `const brokerResult = await startBroker()` line through the end of the `try` block with:

```typescript
    // PIN diresolusi SEBELUM broker start -- authenticate handler broker.ts butuh PIN final
    // di tangan pas server.listen() dipanggil, tak bisa dipasang belakangan.
    const brokerPin = await ensureBrokerPin()
    setBrokerPin(brokerPin)

    const brokerResult = await startBroker(1883, brokerPin)
    if (!brokerResult.ok) {
      console.error(
        `[agent] broker MQTT lokal gagal start (${brokerResult.reason}) — monitoring lokal tak akan jalan`,
      )
      return
    }
    setBrokerPort(brokerResult.port)

    const paired = await buildPairedDevices()
    if (paired.length > 0) {
      const started = await startEngine(paired, brokerResult.port, brokerPin)
      setEngine(started.engine)
      setReporters(started.reporters) // dilacak biar agent:sync bisa nutupnya pas ganti Engine
    }

    const blob = await loadCredentials()
    if (blob.agentToken) {
      await publishLayout(blob.agentToken, brokerResult.port, "default", brokerPin)
    }
```

(The `try`/`catch`/`finally` wrapper and everything else in `bootstrap()` and the rest of the file stay exactly as-is — `registerIpcHandlers()` in `finally` is unaffected, and if `ensureBrokerPin()` itself were ever to throw, that `finally` guarantee is exactly why it's already covered: any exception between the `try` and `finally` still results in `registerIpcHandlers()` running.)

- [ ] **Step 3: Manual smoke check (dev mode)**

Run: `cd apps/agent && pnpm dev` (or the project's existing dev script), watch the console output for:
- No unhandled exception during startup.
- `[agent] kandidat IP LAN...` log line still appears (unrelated log, confirms bootstrap reached that point).
- Broker starts successfully (no `broker MQTT lokal gagal start` error under normal conditions).

Then check that `apps/agent/credentials.enc` (in the Electron `userData` dev path) now contains a `brokerPin` field by triggering the Dashboard screen (Task 9 will make this directly visible in the UI — this manual check is only to confirm bootstrap wiring before Task 9 lands).

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/main/index.ts
git commit -m "feat(agent): wire broker PIN bootstrap into app startup"
```

---

### Task 9: `DashboardScreen.tsx` — display the PIN next to the broker address

**Files:**
- Modify: `apps/agent/src/renderer/screens/DashboardScreen.tsx`
- Test: `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: `window.agentApi.getBrokerInfo()` now resolving `{ ip, port, pin }` (Task 7).
- Produces: nothing new exported — UI-only change.

- [ ] **Step 1: Write the failing test**

In `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`, update the top-of-file `getBrokerInfo` mock default (currently `getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883 })`, inside the `beforeEach`'s `window.agentApi` object) to include a `pin`:

```typescript
    getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883, pin: "0042" }),
```

Add a new test inside the `describe("DashboardScreen", ...)` block, matching the file's existing `render`/`waitFor`/`screen`/`.toBeTruthy()` style (already imported from `@testing-library/react` at the top of the file):

```typescript
  it("PIN broker ditampilkan di samping alamat IP:port", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/0042/)).toBeTruthy());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: FAIL — PIN text not rendered anywhere yet.

- [ ] **Step 3: Implement**

In `apps/agent/src/renderer/screens/DashboardScreen.tsx`:

1. Update the `brokerInfo` state type:

```typescript
  const [brokerInfo, setBrokerInfo] = useState<{ ip: string; port: number | null; pin: string | null } | null>(null);
```

2. Update the broker info card JSX — replace:

```tsx
      {brokerInfo && (
        <GlassCard className="p-3 mb-4">
          <p className="g-t2 text-sm">
            Alamat broker (ketik ini di setup WiFi CYD):{" "}
            {brokerInfo.port !== null
              ? `${brokerInfo.ip}:${brokerInfo.port}`
              : "broker belum jalan (port 1883 dipakai proses lain, atau diblokir sistem — cek log aplikasi)"}
          </p>
        </GlassCard>
      )}
```

with:

```tsx
      {brokerInfo && (
        <GlassCard className="p-3 mb-4">
          <p className="g-t2 text-sm">
            Alamat broker (ketik ini di setup WiFi CYD):{" "}
            {brokerInfo.port !== null
              ? `${brokerInfo.ip}:${brokerInfo.port}`
              : "broker belum jalan (port 1883 dipakai proses lain, atau diblokir sistem — cek log aplikasi)"}
          </p>
          {brokerInfo.pin !== null && (
            <p className="g-t2 text-sm mt-1">
              PIN broker (ketik ini juga di setup WiFi CYD): <span className="font-semibold">{brokerInfo.pin}</span>
            </p>
          )}
        </GlassCard>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: PASS, all tests including the new PIN-display test.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/renderer/screens/DashboardScreen.tsx apps/agent/src/renderer/screens/DashboardScreen.test.tsx
git commit -m "feat(agent): show broker PIN in Dashboard alongside broker address"
```

---

### Task 10: Final verification

**Files:** none (verification-only).

- [ ] **Step 1: Full test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd /Users/adhityatangahu/Documents/shopee-analysis && pnpm turbo test`
Expected: all packages pass, including `apps/agent` and `packages/printer-monitor-core`.

- [ ] **Step 2: Typecheck**

`apps/agent/package.json` has no dedicated `typecheck` script — use `tsc` directly against the root config. `tsconfig.node.json` only covers `electron.vite.config.ts`, not `src/main/**`, so it never actually typechecks `index.ts`/`ipc.ts`/etc; the root `tsconfig.json` has `include: ["src"]`, which covers main, preload, and renderer in one pass — there's no need for a separate `tsconfig.web.json` command either, since `tsconfig.web.json` only adds DOM lib types for a subset already included in the root check:

Run: `cd apps/agent && npx tsc --noEmit -p tsconfig.json`
Expected: no type errors — every call site of `startBroker`, `startEngine`, `publishLayout` must now pass the PIN argument (Tasks 2/4/6 changed their signatures), and `agentApi.getBrokerInfo()`'s new `pin` field must be consistent between `preload/index.ts` and its usage in `DashboardScreen.tsx`.

- [ ] **Step 3: Build**

Run: `pnpm --filter @3pb/agent build`
Expected: build succeeds (`apps/agent/package.json`'s `name` field is `@3pb/agent`; its `build` script is `electron-vite build`).

- [ ] **Step 4: Grep for any remaining un-migrated call sites**

Run: `grep -rn "startBroker(\|startEngine(\|publishLayout(" apps/agent/src packages/printer-monitor-core/src --include="*.ts" --include="*.tsx" | grep -v "\.test\."`
Expected: every match either defines these functions or calls them with the new PIN argument — no leftover 1-arg/2-arg/3-arg call outside test files.

- [ ] **Step 5: Confirm no PIN value is ever logged**

Run: `grep -rn "console\.\(log\|error\|warn\|info\)" apps/agent/src/main/credential-store.ts apps/agent/src/main/broker.ts apps/agent/src/main/layout-publisher.ts apps/agent/src/main/engine-manager.ts apps/agent/src/main/index.ts`
Expected: manually read each match and confirm none interpolates `pin`/`brokerPin`/`password` into the logged string (only presence/absence or generic error text, per the spec's "PIN value itself must never be written to logs").

- [ ] **Step 6: Commit (only if any fixups were needed in Steps 1–5)**

```bash
git add -A -- apps/agent packages/printer-monitor-core
git commit -m "fix(agent): final verification fixups for broker auth"
```

If Steps 1–5 all pass clean with no fixups needed, skip this commit — there's nothing to commit.
