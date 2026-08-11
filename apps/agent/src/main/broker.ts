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
