# Fase 1a-2 — Auth Dual-Channel (Email + WhatsApp OTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah jalur login kedua via **nomor WhatsApp (OTP 6 digit)** di `apps/saas` Slizebiz, di samping email magic-link yang sudah ada, dengan satu-input auto-detect di halaman login.

**Architecture:** Pendekatan A — email tetap 100% lewat NextAuth (tak disentuh); WA lewat **route custom** (`app/api/auth/wa/{start,verify}`) + modul `lib/wa/*` yang membuat **sesi-database yang sama** (tabel `Session` NextAuth) lewat `prisma` langsung + set cookie `authjs.session-token`. OTP disimpan di tabel baru `WaOtp` (hash, bukan plaintext). Halaman login jadi client component satu-input: ada `@` → email (`signIn(...,{redirect:false})` inline), diawali `0/+62/62/digit` → WA OTP.

**Tech Stack:** Next.js 16.2.3, NextAuth v5 beta + `@auth/prisma-adapter`, Prisma 7 + Postgres, `next-auth/react` (client `signIn`), `crypto` (Node), vitest 1.6.1 (+ jsdom untuk komponen). WA Omni REST (`POST /api/send`).

## Global Constraints

- **Node 22 wajib.** Prefix tiap perintah shell: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. Default Node mesin ini v10 (rusak).
- Filter pnpm: `pnpm --filter @3pb/saas <script>`. Package = `@3pb/saas`.
- **Pendekatan A:** JANGAN ubah `apps/saas/lib/auth.ts` (NextAuth/email). WA = jalur terpisah. Sesi tetap **database session**.
- **Skema siap-linking:** `User.email` jadi **nullable** (tetap `@unique`), tambah `phone String? @unique` + `phoneVerified DateTime?`. Tabel `WaOtp` baru. **Linking & merge TIDAK dibangun** di fase ini (ditunda 1b/1c).
- **Default keamanan (verbatim spec §3/§5):** kode **6 digit**, expiry **10 menit**, kode di-**hash** (bukan plaintext), cooldown kirim ulang **60 detik**, maks **5 kirim/jam/nomor**, maks **5 percobaan** salah per kode.
- **Env WA opsional:** `WA_OMNI_URL`, `WA_OMNI_TOKEN`, `WA_OMNI_ACCOUNT_ID` (default account_id `1`). Absen → `wa/start` balas **503 `wa_disabled`**; app + login email tetap normal.
- **Format nomor:** `08…/+62…/62…/8…` → simpan seragam **`628…`**.
- **Pesan WA verbatim:** `Kode masuk Slizebiz: {code}. Berlaku 10 menit, jangan dibagikan.`
- **Cookie sesi:** Auth.js v5 = `authjs.session-token` (http) / `__Secure-authjs.session-token` (https). Origin homelab = http → non-secure.
- **Regresi:** seluruh test 1a-1 existing (owner/entitlement/config/compute/cloudflare/calculator) harus tetap hijau. DRY, YAGNI, TDD, commit sering.
- Deploy homelab: container `slizebiz` **:3300**, `bash apps/saas/deploy.sh`. Entrypoint `prisma db push` (pelebaran aman). Deploy = **GATED** (controller jalankan setelah review, dengan izin user).

---

## File Structure

```
apps/saas/
  prisma/schema.prisma            # MODIFY: User.email nullable + phone + phoneVerified; ADD model WaOtp
  lib/wa/
    normalize.ts                  # NEW: normalizePhone + detectChannel (pure)
    normalize.test.ts             # NEW
    client.ts                     # NEW: sendWA + waEnabled
    client.test.ts                # NEW
    otp.ts                        # NEW: issueOtp/verifyOtp/canSend (prisma.waOtp)
    otp.test.ts                   # NEW
    session.ts                    # NEW: upsertUserByPhone + createUserSession
    session.test.ts               # NEW
  app/api/auth/wa/
    start/route.ts                # NEW: POST — phone→OTP→WA send
    verify/route.ts               # NEW: POST — code→session
  app/login/page.tsx              # REWRITE: client single-input auto-detect
  app/login/login-form.test.tsx   # NEW: component test
  deploy.sh                       # MODIFY: passthrough WA_OMNI_* env
  .env.deploy.example             # MODIFY: WA_OMNI_* keys
  README.md                       # MODIFY: dual-channel auth note
```

---

### Task 1: Skema — User email nullable + phone + WaOtp

**Files:**
- Modify: `apps/saas/prisma/schema.prisma`
- (Validasi via `prisma validate`/`generate`/`build`, bukan unit test)

**Interfaces:**
- Produces: `User.email String? @unique`, `User.phone String? @unique`, `User.phoneVerified DateTime?`; model `WaOtp { phone @id, codeHash, expires, attempts, lastSentAt, sentCount, windowStart }`. Prisma client mengekspos `prisma.waOtp` + `prisma.user.phone`.

- [ ] **Step 1: Ubah model `User`** (jadikan email nullable + tambah phone)

Ganti blok `model User` di `apps/saas/prisma/schema.prisma` menjadi:
```prisma
model User {
  id            String       @id @default(cuid())
  name          String?
  email         String?      @unique
  emailVerified DateTime?
  phone         String?      @unique
  phoneVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  entitlement   Entitlement?
  createdAt     DateTime     @default(now())
}
```

- [ ] **Step 2: Tambah model `WaOtp`** (di akhir file, setelah `model Config`)

```prisma
model WaOtp {
  phone       String   @id
  codeHash    String
  expires     DateTime
  attempts    Int      @default(0)
  lastSentAt  DateTime @default(now())
  sentCount   Int      @default(0)
  windowStart DateTime @default(now())
}
```

- [ ] **Step 3: Validasi + generate**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/saas
pnpm exec prisma validate
pnpm exec prisma generate
```
Expected: `validate` → "The schema is valid"; `generate` → "Generated Prisma Client" (kini punya `prisma.waOtp`).

- [ ] **Step 4: Build hijau**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas build
```
Expected: build sukses (schema baru ter-generate, tak ada referensi rusak — kode belum pakai phone/waOtp).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/prisma/schema.prisma
git commit -m "feat(saas): schema auth dual-channel — email nullable + phone + WaOtp"
```

---

### Task 2: `lib/wa/normalize.ts` — normalisasi nomor + deteksi channel (TDD)

**Files:**
- Create: `apps/saas/lib/wa/normalize.ts`
- Test: `apps/saas/lib/wa/normalize.test.ts`

**Interfaces:**
- Produces:
  - `normalizePhone(input: string): string | null` — `08…/+62…/62…/8…` → `628…`; buang spasi/`-`/`()`; tolak (null) kalau bukan angka atau panjang < 10 / > 15.
  - `detectChannel(input: string): 'email' | 'phone' | null` — ada `@` → `email`; else `normalizePhone` sukses → `phone`; else `null`.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/wa/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizePhone, detectChannel } from "@/lib/wa/normalize";

describe("normalizePhone", () => {
  it("08xx → 628xx", () => { expect(normalizePhone("08123456789")).toBe("628123456789"); });
  it("+62xx → 628xx", () => { expect(normalizePhone("+628123456789")).toBe("628123456789"); });
  it("62xx tetap", () => { expect(normalizePhone("628123456789")).toBe("628123456789"); });
  it("8xx → 628xx", () => { expect(normalizePhone("8123456789")).toBe("628123456789"); });
  it("buang spasi/strip/kurung", () => { expect(normalizePhone("0812-3456-789")).toBe("628123456789"); });
  it("bukan angka → null", () => { expect(normalizePhone("abc")).toBeNull(); });
  it("terlalu pendek → null", () => { expect(normalizePhone("0812")).toBeNull(); });
  it("email-ish → null", () => { expect(normalizePhone("a@b.com")).toBeNull(); });
});

describe("detectChannel", () => {
  it("ada @ → email", () => { expect(detectChannel("a@b.com")).toBe("email"); });
  it("08xx → phone", () => { expect(detectChannel("08123456789")).toBe("phone"); });
  it("+62 → phone", () => { expect(detectChannel("+628123456789")).toBe("phone"); });
  it("ngawur → null", () => { expect(detectChannel("halo123")).toBeNull(); });
  it("kosong → null", () => { expect(detectChannel("")).toBeNull(); });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/normalize.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/wa/normalize'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/wa/normalize.ts`**

```ts
/** Normalisasi nomor Indonesia ke format 628… (yang diminta WA Omni). null jika invalid. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, "");
  let digits: string;
  if (cleaned.startsWith("+62")) digits = "62" + cleaned.slice(3);
  else if (cleaned.startsWith("62")) digits = cleaned;
  else if (cleaned.startsWith("0")) digits = "62" + cleaned.slice(1);
  else if (cleaned.startsWith("8")) digits = "62" + cleaned;
  else return null;
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Tentukan channel dari satu input login. */
export function detectChannel(input: string): "email" | "phone" | null {
  const t = input.trim();
  if (t.includes("@")) return "email";
  if (normalizePhone(t)) return "phone";
  return null;
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/normalize.test.ts
```
Expected: PASS (semua case).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/wa/normalize.ts apps/saas/lib/wa/normalize.test.ts
git commit -m "feat(saas): lib/wa/normalize — normalizePhone + detectChannel (TDD)"
```

---

### Task 3: `lib/wa/client.ts` — kirim pesan WA Omni (TDD)

**Files:**
- Create: `apps/saas/lib/wa/client.ts`
- Test: `apps/saas/lib/wa/client.test.ts`

**Interfaces:**
- Produces:
  - `waEnabled(): boolean` — true bila `WA_OMNI_URL` & `WA_OMNI_TOKEN` & `WA_OMNI_ACCOUNT_ID` ada.
  - `sendWA(phone: string, body: string): Promise<void>` — `POST {WA_OMNI_URL}/api/send` header `Authorization: Bearer {token}`, body `{ phone, body, account_id: Number(WA_OMNI_ACCOUNT_ID) }`, timeout 10s. Throw `Error` bila env absen / non-2xx / timeout.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/wa/client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWA, waEnabled } from "@/lib/wa/client";

const ENV = { ...process.env };
beforeEach(() => {
  process.env.WA_OMNI_URL = "http://wa.local:3020";
  process.env.WA_OMNI_TOKEN = "tok";
  process.env.WA_OMNI_ACCOUNT_ID = "1";
});
afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });

describe("waEnabled", () => {
  it("true saat env lengkap", () => { expect(waEnabled()).toBe(true); });
  it("false saat token absen", () => { delete process.env.WA_OMNI_TOKEN; expect(waEnabled()).toBe(false); });
});

describe("sendWA", () => {
  it("POST /api/send dengan body & Bearer benar", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await sendWA("628123456789", "halo");
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://wa.local:3020/api/send");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(opts.body as string)).toEqual({ phone: "628123456789", body: "halo", account_id: 1 });
  });
  it("env absen → throw", async () => {
    delete process.env.WA_OMNI_URL;
    await expect(sendWA("628123456789", "x")).rejects.toThrow();
  });
  it("non-2xx → throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(sendWA("628123456789", "x")).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/client.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/wa/client'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/wa/client.ts`**

```ts
export function waEnabled(): boolean {
  return !!(process.env.WA_OMNI_URL && process.env.WA_OMNI_TOKEN && process.env.WA_OMNI_ACCOUNT_ID);
}

/** Kirim pesan WA via WA Omni. Throw bila env absen / non-2xx / timeout. */
export async function sendWA(phone: string, body: string): Promise<void> {
  const url = process.env.WA_OMNI_URL;
  const token = process.env.WA_OMNI_TOKEN;
  const accountId = process.env.WA_OMNI_ACCOUNT_ID;
  if (!url || !token || !accountId) throw new Error("WA_OMNI env belum lengkap");
  const res = await fetch(`${url}/api/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, body, account_id: Number(accountId) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`WA Omni send gagal: HTTP ${res.status}`);
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/client.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/wa/client.ts apps/saas/lib/wa/client.test.ts
git commit -m "feat(saas): lib/wa/client — sendWA + waEnabled (TDD)"
```

---

### Task 4: `lib/wa/otp.ts` — issue/verify/canSend (TDD)

**Files:**
- Create: `apps/saas/lib/wa/otp.ts`
- Test: `apps/saas/lib/wa/otp.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`) → `prisma.waOtp`.
- Produces:
  - `issueOtp(phone: string, now?: Date): Promise<{ code: string }>` — generate 6-digit, upsert `codeHash`+`expires(now+10m)`, reset `attempts=0`, `lastSentAt=now`, naikkan `sentCount` (dalam window 1 jam; reset window bila lewat).
  - `verifyOtp(phone: string, code: string, now?: Date): Promise<'ok'|'invalid'|'expired'|'locked'>` — expired bila tak ada/`expires`<now; locked bila `attempts>=5`; cocok → delete row → ok; salah → `attempts++` → invalid.
  - `canSend(phone: string, now?: Date): Promise<{ ok: boolean; waitSec?: number }>` — cooldown 60s dari `lastSentAt` + kuota 5/jam dari `sentCount`/`windowStart`.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/wa/otp.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { waOtp: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn(), update: vi.fn() } },
}));
import { prisma } from "@/lib/db";
import { issueOtp, verifyOtp, canSend } from "@/lib/wa/otp";
import crypto from "crypto";

const hash = (phone: string, code: string) => crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
const NOW = new Date("2026-07-18T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("issueOtp", () => {
  it("upsert kode 6 digit + hash + sentCount 1 saat baris baru", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue(null);
    const { code } = await issueOtp("628111", NOW);
    expect(code).toMatch(/^\d{6}$/);
    const arg = (prisma.waOtp.upsert as any).mock.calls[0][0];
    expect(arg.where).toEqual({ phone: "628111" });
    expect(arg.create.codeHash).toBe(hash("628111", code));
    expect(arg.create.sentCount).toBe(1);
  });
});

describe("verifyOtp", () => {
  it("kode cocok → ok + hapus row", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: hash("628111", "123456"), expires: new Date(NOW.getTime() + 60000), attempts: 0 });
    expect(await verifyOtp("628111", "123456", NOW)).toBe("ok");
    expect(prisma.waOtp.delete).toHaveBeenCalledWith({ where: { phone: "628111" } });
  });
  it("kode salah → invalid + attempts++", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: hash("628111", "123456"), expires: new Date(NOW.getTime() + 60000), attempts: 1 });
    expect(await verifyOtp("628111", "000000", NOW)).toBe("invalid");
    expect(prisma.waOtp.update).toHaveBeenCalledWith({ where: { phone: "628111" }, data: { attempts: 2 } });
  });
  it("expired", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: "x", expires: new Date(NOW.getTime() - 1), attempts: 0 });
    expect(await verifyOtp("628111", "123456", NOW)).toBe("expired");
  });
  it("tak ada row → expired", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue(null);
    expect(await verifyOtp("628111", "123456", NOW)).toBe("expired");
  });
  it(">=5 attempts → locked", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ phone: "628111", codeHash: "x", expires: new Date(NOW.getTime() + 60000), attempts: 5 });
    expect(await verifyOtp("628111", "123456", NOW)).toBe("locked");
  });
});

describe("canSend", () => {
  it("tak ada row → boleh", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue(null);
    expect(await canSend("628111", NOW)).toEqual({ ok: true });
  });
  it("dalam cooldown 60s → tolak + waitSec", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ lastSentAt: new Date(NOW.getTime() - 30000), sentCount: 1, windowStart: NOW });
    const r = await canSend("628111", NOW);
    expect(r.ok).toBe(false); expect(r.waitSec).toBe(30);
  });
  it("kuota 5/jam habis → tolak", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ lastSentAt: new Date(NOW.getTime() - 120000), sentCount: 5, windowStart: new Date(NOW.getTime() - 600000) });
    expect((await canSend("628111", NOW)).ok).toBe(false);
  });
  it("cooldown lewat & kuota belum habis → boleh", async () => {
    (prisma.waOtp.findUnique as any).mockResolvedValue({ lastSentAt: new Date(NOW.getTime() - 120000), sentCount: 2, windowStart: new Date(NOW.getTime() - 600000) });
    expect((await canSend("628111", NOW)).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/otp.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/wa/otp'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/wa/otp.ts`**

```ts
import crypto from "crypto";
import { prisma } from "@/lib/db";

const EXPIRY_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const HOURLY_CAP = 5;
const MAX_ATTEMPTS = 5;

function hashCode(phone: string, code: string): string {
  return crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export async function canSend(phone: string, now = new Date()): Promise<{ ok: boolean; waitSec?: number }> {
  const row = await prisma.waOtp.findUnique({ where: { phone } });
  if (!row) return { ok: true };
  const sinceSent = now.getTime() - row.lastSentAt.getTime();
  if (sinceSent < COOLDOWN_MS) return { ok: false, waitSec: Math.ceil((COOLDOWN_MS - sinceSent) / 1000) };
  const windowElapsed = now.getTime() - row.windowStart.getTime();
  if (windowElapsed <= HOUR_MS && row.sentCount >= HOURLY_CAP) {
    return { ok: false, waitSec: Math.ceil((HOUR_MS - windowElapsed) / 1000) };
  }
  return { ok: true };
}

export async function issueOtp(phone: string, now = new Date()): Promise<{ code: string }> {
  const code = String(crypto.randomInt(100000, 1000000)); // 6 digit
  const existing = await prisma.waOtp.findUnique({ where: { phone } });
  const inWindow = existing ? now.getTime() - existing.windowStart.getTime() <= HOUR_MS : false;
  const windowStart = inWindow ? existing!.windowStart : now;
  const sentCount = (inWindow ? existing!.sentCount : 0) + 1;
  const codeHash = hashCode(phone, code);
  const expires = new Date(now.getTime() + EXPIRY_MS);
  await prisma.waOtp.upsert({
    where: { phone },
    create: { phone, codeHash, expires, attempts: 0, lastSentAt: now, sentCount: 1, windowStart: now },
    update: { codeHash, expires, attempts: 0, lastSentAt: now, sentCount, windowStart },
  });
  return { code };
}

export async function verifyOtp(
  phone: string, code: string, now = new Date(),
): Promise<"ok" | "invalid" | "expired" | "locked"> {
  const row = await prisma.waOtp.findUnique({ where: { phone } });
  if (!row || row.expires.getTime() < now.getTime()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  if (row.codeHash === hashCode(phone, code)) {
    await prisma.waOtp.delete({ where: { phone } });
    return "ok";
  }
  await prisma.waOtp.update({ where: { phone }, data: { attempts: row.attempts + 1 } });
  return "invalid";
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/otp.test.ts
```
Expected: PASS (issue/verify/canSend semua case).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/wa/otp.ts apps/saas/lib/wa/otp.test.ts
git commit -m "feat(saas): lib/wa/otp — issue/verify/canSend OTP (TDD)"
```

---

### Task 5: `lib/wa/session.ts` — upsert user by phone + buat sesi DB (TDD)

**Files:**
- Create: `apps/saas/lib/wa/session.ts`
- Test: `apps/saas/lib/wa/session.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`) → `prisma.user`, `prisma.session`, `prisma.entitlement`; `cookies` (`next/headers`).
- Produces:
  - `upsertUserByPhone(phone: string): Promise<User>` — cari user by phone; baru → create `{ phone, phoneVerified: now }` + `entitlement.create({ data: { userId } })`; lama tanpa `phoneVerified` → set; return user.
  - `createUserSession(userId: string, now?: Date): Promise<void>` — buat `sessionToken` (`crypto.randomUUID()`), `prisma.session.create({ data: { sessionToken, userId, expires: now+30hari } })`, set cookie `authjs.session-token` (atau `__Secure-…` bila https) httpOnly/lax/path=/.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/wa/session.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: cookieSet })) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    entitlement: { create: vi.fn() },
    session: { create: vi.fn() },
  },
}));
import { prisma } from "@/lib/db";
import { upsertUserByPhone, createUserSession } from "@/lib/wa/session";

beforeEach(() => { vi.clearAllMocks(); process.env.NEXTAUTH_URL = "http://192.168.88.113:3300"; });

describe("upsertUserByPhone", () => {
  it("nomor baru → create user + entitlement", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({ id: "u1", phone: "628111" });
    const u = await upsertUserByPhone("628111");
    expect(u.id).toBe("u1");
    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ phone: "628111" }) });
    expect(prisma.entitlement.create).toHaveBeenCalledWith({ data: { userId: "u1" } });
  });
  it("nomor lama sudah verified → tak create ulang", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u2", phone: "628111", phoneVerified: new Date() });
    const u = await upsertUserByPhone("628111");
    expect(u.id).toBe("u2");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.entitlement.create).not.toHaveBeenCalled();
  });
});

describe("createUserSession", () => {
  it("buat Session row + set cookie authjs.session-token (http)", async () => {
    (prisma.session.create as any).mockResolvedValue({});
    await createUserSession("u1", new Date("2026-07-18T10:00:00Z"));
    const arg = (prisma.session.create as any).mock.calls[0][0].data;
    expect(arg.userId).toBe("u1");
    expect(typeof arg.sessionToken).toBe("string");
    const [name, value, opts] = cookieSet.mock.calls[0];
    expect(name).toBe("authjs.session-token");
    expect(value).toBe(arg.sessionToken);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
  });
  it("https origin → cookie __Secure- + secure true", async () => {
    process.env.NEXTAUTH_URL = "https://app.slizebiz.com";
    (prisma.session.create as any).mockResolvedValue({});
    await createUserSession("u1", new Date("2026-07-18T10:00:00Z"));
    const [name, , opts] = cookieSet.mock.calls[0];
    expect(name).toBe("__Secure-authjs.session-token");
    expect(opts.secure).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/session.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/wa/session'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/wa/session.ts`**

```ts
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
// Auth.js v5: nama cookie sesi. Build note: verifikasi via cookie login email sukses.
const SESSION_COOKIE = "authjs.session-token";

export async function upsertUserByPhone(phone: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.phoneVerified) {
      return prisma.user.update({ where: { phone }, data: { phoneVerified: new Date() } });
    }
    return existing;
  }
  const user = await prisma.user.create({ data: { phone, phoneVerified: new Date() } });
  await prisma.entitlement.create({ data: { userId: user.id } }).catch(() => {});
  return user;
}

export async function createUserSession(userId: string, now = new Date()): Promise<void> {
  const sessionToken = crypto.randomUUID();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_MS);
  await prisma.session.create({ data: { sessionToken, userId, expires } });
  const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const jar = await cookies();
  jar.set(secure ? `__Secure-${SESSION_COOKIE}` : SESSION_COOKIE, sessionToken, {
    httpOnly: true, sameSite: "lax", path: "/", secure, expires,
  });
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/wa/session.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/wa/session.ts apps/saas/lib/wa/session.test.ts
git commit -m "feat(saas): lib/wa/session — upsertUserByPhone + createUserSession (TDD)"
```

---

### Task 6: Route `app/api/auth/wa/{start,verify}`

**Files:**
- Create: `apps/saas/app/api/auth/wa/start/route.ts`, `apps/saas/app/api/auth/wa/verify/route.ts`
- Test: `apps/saas/app/api/auth/wa/wa-routes.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` (`@/lib/wa/normalize`), `waEnabled`/`sendWA` (`@/lib/wa/client`), `canSend`/`issueOtp`/`verifyOtp` (`@/lib/wa/otp`), `upsertUserByPhone`/`createUserSession` (`@/lib/wa/session`).
- Produces:
  - `POST /api/auth/wa/start` `{input}` → 503 `wa_disabled` (env absen) / 400 `invalid_phone` / 429 `rate_limited`+`waitSec` / 502 `send_failed` / 200 `{ok:true}`.
  - `POST /api/auth/wa/verify` `{input,code}` → 400 `invalid` / 401 `{error: reason}` / 200 `{ok:true}` (+ cookie sesi).

> **Catatan privasi:** `start` **tidak** melihat tabel user (akun dibuat lazy saat `verify`), jadi tak ada enumerasi — aman menyurfacekan `send_failed`/`rate_limited` sebagai error nyata (UX lebih baik daripada diam-diam), sesuai maksud spec §5.

- [ ] **Step 1: Tulis failing test** (mock layer lib)

`apps/saas/app/api/auth/wa/wa-routes.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wa/client", () => ({ waEnabled: vi.fn(() => true), sendWA: vi.fn() }));
vi.mock("@/lib/wa/otp", () => ({ canSend: vi.fn(), issueOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/wa/session", () => ({ upsertUserByPhone: vi.fn(), createUserSession: vi.fn() }));

import { waEnabled, sendWA } from "@/lib/wa/client";
import { canSend, issueOtp, verifyOtp } from "@/lib/wa/otp";
import { upsertUserByPhone, createUserSession } from "@/lib/wa/session";
import { POST as startPOST } from "@/app/api/auth/wa/start/route";
import { POST as verifyPOST } from "@/app/api/auth/wa/verify/route";

const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());

describe("wa/start", () => {
  it("env absen → 503 wa_disabled", async () => {
    (waEnabled as any).mockReturnValue(false);
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(503);
  });
  it("nomor invalid → 400", async () => {
    const res = await startPOST(req({ input: "abc" }));
    expect(res.status).toBe(400);
  });
  it("rate-limited → 429 + waitSec", async () => {
    (canSend as any).mockResolvedValue({ ok: false, waitSec: 42 });
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(429);
    expect((await res.json()).waitSec).toBe(42);
  });
  it("sukses → kirim WA + 200", async () => {
    (canSend as any).mockResolvedValue({ ok: true });
    (issueOtp as any).mockResolvedValue({ code: "123456" });
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(200);
    expect(sendWA).toHaveBeenCalledWith("628123456789", expect.stringContaining("123456"));
  });
  it("WA gagal → 502", async () => {
    (canSend as any).mockResolvedValue({ ok: true });
    (issueOtp as any).mockResolvedValue({ code: "123456" });
    (sendWA as any).mockRejectedValue(new Error("down"));
    const res = await startPOST(req({ input: "08123456789" }));
    expect(res.status).toBe(502);
  });
});

describe("wa/verify", () => {
  it("kode salah → 401", async () => {
    (verifyOtp as any).mockResolvedValue("invalid");
    const res = await verifyPOST(req({ input: "08123456789", code: "000000" }));
    expect(res.status).toBe(401);
  });
  it("sukses → buat sesi + 200", async () => {
    (verifyOtp as any).mockResolvedValue("ok");
    (upsertUserByPhone as any).mockResolvedValue({ id: "u1" });
    const res = await verifyPOST(req({ input: "08123456789", code: "123456" }));
    expect(res.status).toBe(200);
    expect(createUserSession).toHaveBeenCalledWith("u1");
  });
  it("format code salah → 400", async () => {
    const res = await verifyPOST(req({ input: "08123456789", code: "12" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test app/api/auth/wa/wa-routes.test.ts
```
Expected: FAIL — module route belum ada.

- [ ] **Step 3: Implementasi `apps/saas/app/api/auth/wa/start/route.ts`**

```ts
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/wa/normalize";
import { waEnabled, sendWA } from "@/lib/wa/client";
import { canSend, issueOtp } from "@/lib/wa/otp";

export async function POST(req: Request) {
  if (!waEnabled()) return NextResponse.json({ error: "wa_disabled" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.input ?? ""));
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  const gate = await canSend(phone);
  if (!gate.ok) return NextResponse.json({ error: "rate_limited", waitSec: gate.waitSec }, { status: 429 });
  const { code } = await issueOtp(phone);
  try {
    await sendWA(phone, `Kode masuk Slizebiz: ${code}. Berlaku 10 menit, jangan dibagikan.`);
  } catch {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implementasi `apps/saas/app/api/auth/wa/verify/route.ts`**

```ts
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/wa/normalize";
import { verifyOtp } from "@/lib/wa/otp";
import { upsertUserByPhone, createUserSession } from "@/lib/wa/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.input ?? ""));
  const code = String(body?.code ?? "");
  if (!phone || !/^\d{6}$/.test(code)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const result = await verifyOtp(phone, code);
  if (result !== "ok") return NextResponse.json({ error: result }, { status: 401 });
  const user = await upsertUserByPhone(phone);
  await createUserSession(user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Jalankan — lolos + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test app/api/auth/wa/wa-routes.test.ts
pnpm --filter @3pb/saas build
```
Expected: test PASS; build sukses (dua route ter-compile).

- [ ] **Step 6: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/app/api/auth/wa
git commit -m "feat(saas): route WA OTP start+verify (rate-limit, send, sesi)"
```

---

### Task 7: Halaman login satu-input auto-detect (+ email redirect:false)

**Files:**
- Modify (rewrite): `apps/saas/app/login/page.tsx`
- Test: `apps/saas/app/login/login-form.test.tsx`

**Interfaces:**
- Consumes: `signIn` (`next-auth/react`), `detectChannel` (`@/lib/wa/normalize`), `GlassButton`/`GlassInput` (`@3pb/ui`).
- Produces: satu-input login: `@`→email (`signIn("resend",{email,redirect:false})`→"cek email"); phone→`POST /api/auth/wa/start`→step kode 6-digit→`/api/auth/wa/verify`→redirect `/`; null→hint.

- [ ] **Step 1: Rewrite `apps/saas/app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { GlassButton, GlassInput } from "@3pb/ui";
import { detectChannel } from "@/lib/wa/normalize";

type Step = "idle" | "email_sent" | "wa_code";

export default function LoginPage() {
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setPending(true);
    const channel = detectChannel(input);
    if (channel === "email") {
      await signIn("resend", { email: input.trim(), redirect: false });
      setStep("email_sent"); setPending(false); return;
    }
    if (channel === "phone") {
      const res = await fetch("/api/auth/wa/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      setPending(false);
      if (res.ok) { setStep("wa_code"); return; }
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) setMsg("Login WhatsApp belum aktif, pakai email dulu.");
      else if (res.status === 429) setMsg(`Terlalu sering, tunggu ${data.waitSec ?? 60} detik.`);
      else if (res.status === 502) setMsg("Gagal kirim kode via WhatsApp, coba lagi.");
      else setMsg("Nomor tidak valid.");
      return;
    }
    setPending(false);
    setMsg("Masukkan email (ada @) atau nomor WhatsApp (08…/+62…).");
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setPending(true);
    const res = await fetch("/api/auth/wa/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, code }),
    });
    setPending(false);
    if (res.ok) { window.location.href = "/"; return; }
    const data = await res.json().catch(() => ({}));
    if (data.error === "expired") setMsg("Kode kadaluarsa. Kirim ulang.");
    else if (data.error === "locked") setMsg("Terlalu banyak percobaan. Kirim ulang kode.");
    else setMsg("Kode salah, coba lagi.");
  }

  return (
    <main className="max-w-sm mx-auto p-6 mt-16">
      <img src="/logo.svg" alt="Slizebiz" width={44} height={44} className="mb-3" />
      <h1 className="text-lg font-semibold g-t1 mb-1">Masuk Slizebiz</h1>
      <p className="text-[12px] g-t4 mb-4">Tanpa password.</p>

      {step === "idle" && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <GlassInput value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Email atau nomor WhatsApp" required />
          <GlassButton type="submit" disabled={pending}>{pending ? "Memproses…" : "Lanjut"}</GlassButton>
        </form>
      )}

      {step === "email_sent" && (
        <p className="text-[13px] g-t2">Link masuk dikirim ke <b>{input}</b>. Cek inbox/spam.</p>
      )}

      {step === "wa_code" && (
        <form onSubmit={onVerify} className="flex flex-col gap-3">
          <p className="text-[12px] g-t4">Kode dikirim via WhatsApp ke {input}. Masukkan 6 digit:</p>
          <GlassInput value={code} onChange={(e) => setCode(e.target.value)}
            inputMode="numeric" maxLength={6} placeholder="123456" required />
          <GlassButton type="submit" disabled={pending}>{pending ? "Memverifikasi…" : "Verifikasi"}</GlassButton>
          <button type="button" className="text-[12px] g-t4 underline"
            onClick={() => { setStep("idle"); setCode(""); setMsg(""); }}>Kirim ulang / ganti nomor</button>
        </form>
      )}

      {msg && <p className="text-[12px] mt-3" style={{ color: "#dc2626" }}>{msg}</p>}
    </main>
  );
}
```

> Catatan: tombol "Kirim ulang" versi sederhana = balik ke `idle` (submit ulang men-trigger cooldown server-side). Countdown 60s eksplisit = polish opsional, tak wajib fase ini (server sudah menegakkan cooldown).

- [ ] **Step 2: Tambah dev dep + tulis component test**

Pastikan `@testing-library/react`, `@testing-library/dom`, `jsdom` sudah ada (dari 1a-1 Task 7). `apps/saas/app/login/login-form.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signInMock(...a) }));
import LoginPage from "@/app/login/page";

beforeEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("LoginPage auto-detect", () => {
  it("input email → panggil signIn resend + tampil 'cek inbox'", async () => {
    signInMock.mockResolvedValue({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(/Email atau nomor/i), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByText("Lanjut"));
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith("resend", { email: "a@b.com", redirect: false }));
    expect(screen.getByText(/Cek inbox/i)).toBeTruthy();
  });

  it("input nomor → POST wa/start + tampil input kode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(/Email atau nomor/i), { target: { value: "08123456789" } });
    fireEvent.click(screen.getByText("Lanjut"));
    await waitFor(() => expect(screen.getByPlaceholderText("123456")).toBeTruthy());
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe("/api/auth/wa/start");
  });

  it("input ngawur → hint", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(/Email atau nomor/i), { target: { value: "halo123" } });
    fireEvent.click(screen.getByText("Lanjut"));
    await waitFor(() => expect(screen.getByText(/Masukkan email/i)).toBeTruthy());
  });
});
```

- [ ] **Step 3: Jalankan test**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test app/login/login-form.test.tsx
```
Expected: PASS (email path, phone path, hint).

- [ ] **Step 4: Build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas build
```
Expected: build sukses (login jadi client component).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/app/login/page.tsx apps/saas/app/login/login-form.test.tsx
git commit -m "feat(saas): login satu-input auto-detect (email redirect:false + WA OTP)"
```

---

### Task 8: Env/config + deploy + docs + verifikasi akhir

**Files:**
- Modify: `apps/saas/deploy.sh`, `apps/saas/.env.deploy.example`, `apps/saas/README.md`

**Interfaces:**
- Consumes: seluruh hasil Task 1–7.
- Produces: passthrough env WA di deploy.sh; docs; bukti `pnpm turbo test`/`build` hijau. Redeploy homelab = **GATED**.

- [ ] **Step 1: Tambah env WA ke `apps/saas/.env.deploy.example`** (append)

```
# Login via WhatsApp (WA Omni) — opsional; absen = login WA nonaktif, email tetap jalan
WA_OMNI_URL=http://192.168.88.92:3020
WA_OMNI_TOKEN=ganti-dengan-token-wa-omni
WA_OMNI_ACCOUNT_ID=1
```

- [ ] **Step 2: Passthrough env WA di `apps/saas/deploy.sh`**

Di blok `docker run` (setelah baris `-e CLOUDFLARE_API_TOKEN=...`), tambah:
```bash
  -e WA_OMNI_URL="${WA_OMNI_URL:-}" \
  -e WA_OMNI_TOKEN="${WA_OMNI_TOKEN:-}" \
  -e WA_OMNI_ACCOUNT_ID="${WA_OMNI_ACCOUNT_ID:-}" \
```
(Env WA TIDAK ditambah ke `REQUIRED_VARS` — opsional.)

- [ ] **Step 3: Update `apps/saas/README.md`** — di bagian Arsitektur, ganti baris auth:

Cari baris `- Auth: magic-link (NextAuth v5 + Resend), sesi database.` dan ganti jadi:
```markdown
- Auth: dual-channel — email magic-link (NextAuth v5 + Resend) + nomor WhatsApp OTP (via WA Omni, `lib/wa/*` + `/api/auth/wa/*`). Sesi database. Login satu-input auto-detect (@ = email, 08…/+62… = WA). Env WA opsional (`WA_OMNI_URL/TOKEN/ACCOUNT_ID`); absen = WA nonaktif, email tetap jalan.
```

- [ ] **Step 4: Seluruh suite + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas exec prisma generate
pnpm turbo test
pnpm turbo build
```
Expected: semua package hijau (termasuk `@3pb/saas` test baru: normalize/client/otp/session/wa-routes/login-form + test 1a-1 tetap lulus); build sukses.

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/deploy.sh apps/saas/.env.deploy.example apps/saas/README.md
git commit -m "chore(saas): env WA di deploy.sh + .env.example + README dual-channel"
```

- [ ] **Step 6: Deploy homelab (GATED — controller, setelah izin user)**

Prasyarat: isi `WA_OMNI_URL/TOKEN/ACCOUNT_ID` di `apps/saas/.env.deploy` (token dari CLAUDE.md global). Lalu:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
bash apps/saas/deploy.sh
```
Expected: container `slizebiz` :3300 rebuild + jalan; entrypoint `prisma db push` menerapkan skema baru (email nullable + phone + WaOtp) — pelebaran aman, data existing utuh. Smoke: `/login` 200, coba login WA → kode masuk WhatsApp → verifikasi → masuk kalkulator.

---

## Self-Review

**1. Spec coverage:**
- Skema email nullable + phone + WaOtp → Task 1 ✅ (spec §2)
- normalize + detect → Task 2 ✅ (§3)
- WA client → Task 3 ✅ (§3)
- OTP issue/verify/canSend + default keamanan → Task 4 ✅ (§2/§3/§5)
- session (upsert phone + createSession + entitlement) → Task 5 ✅ (§3)
- routes start/verify + error mapping (503/400/429/502/401) → Task 6 ✅ (§3/§5)
- login satu-input auto-detect + email redirect:false → Task 7 ✅ (§4)
- env/config/deploy → Task 8 ✅ (§6/§9)
- Testing tiap unit → Task 2-7 ✅ (§7)
- Linking/merge DITUNDA → tidak ada task (sesuai §8) ✅

**2. Placeholder scan:** tak ada TBD/TODO. Countdown 60s eksplisit sengaja opsional (server enforce cooldown) — dicatat, bukan placeholder. `account_id` default 1 = keputusan.

**3. Type consistency:** `normalizePhone`/`detectChannel` (Task 2) dipakai Task 6/7. `issueOtp`→`{code}`, `verifyOtp`→`'ok'|'invalid'|'expired'|'locked'`, `canSend`→`{ok,waitSec?}` (Task 4) dipakai Task 6 konsisten. `upsertUserByPhone`→`User`, `createUserSession(userId)` (Task 5) dipakai Task 6. Cookie `authjs.session-token` konsisten Task 5 (+ build note verifikasi). Route error string (`wa_disabled/invalid_phone/rate_limited/send_failed/invalid/expired/locked`) konsisten Task 6 ↔ Task 7 handler.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-18-fase1a2-auth-dual-channel.md`. Dua opsi eksekusi:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review antar task.

**2. Inline Execution** — via executing-plans, batch + checkpoint.

**Which approach?**
