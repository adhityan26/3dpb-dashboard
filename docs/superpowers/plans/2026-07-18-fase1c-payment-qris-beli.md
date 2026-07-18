# Fase 1c — Payment QRIS Manual (Beli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun flow pembayaran **Beli (sekali, lifetime)** via **dynamic QRIS + verifikasi manual owner** di `apps/saas` Slizebiz: checkout `/beli` → QR bernominal unik → user tandai bayar → admin verifikasi → flip entitlement + notif.

**Architecture:** Model `Payment` (Prisma, aditif). `lib/qris/dynamic.ts` generate dynamic QRIS dari QRIS statis merchant (di Config, di-set owner). `lib/payment/service.ts` = logika checkout/aktivasi (kode unik antar invoice hidup, amount = harga − buffer + kode). Route `/api/beli/*` (user) + `/api/admin/payment/*` (owner). UI `/beli` (render QR via lib `qrcode`) + tab admin Pembayaran. `capabilities()` tak berubah — flip `lifetimeOwned` bikin `paidCore=true`.

**Tech Stack:** Next.js 16.2.3, Prisma 7 + Postgres, `qrcode` (render QR), `crypto` (Node), NextAuth session (`auth()`), WA Omni `sendWA` (1a-2) + Resend REST (notif), vitest 1.6.1 (+ jsdom komponen).

## Global Constraints

- **Node 22 wajib.** Prefix tiap perintah shell: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. Default Node v10 rusak.
- Filter `pnpm --filter @3pb/saas`. Package `@3pb/saas`.
- **Beli-only** fase ini. Subscribe (siklus bulanan) & **fitur Beli** (save/multi-plate/labor = 1b) **di luar scope**. 1c cuma buka gating.
- **Kode unik via diskon:** `amount = displayPrice − discountBuffer + kode(0..999)`, `discountBuffer` default **1000**. Nominal selalu < harga tampil. Amount **integer rupiah** (tanpa desimal).
- **Invoice hidup** = `status='PENDING'` && `createdAt > now − 3 jam`. Kode unik dijamin beda antar invoice hidup. **Expiry lazy** (tanpa cron).
- **Owner cocokkan by nominal penuh persis.** QRIS statis base di Config `qris.static` (di-set owner di admin, paste teks). Belum diset → checkout **503**.
- **Notif aktivasi best-effort** (nomor→`sendWA`; email→Resend REST); gagal ≠ gagal aktivasi. `activate` **idempoten** (status≠PENDING → no-op) + owner-only.
- `capabilities()` di `lib/entitlement.ts` **JANGAN diubah** (`paidCore = lifetimeOwned || subActive`). JANGAN sentuh `lib/auth.ts`.
- **CRC16-CCITT (FALSE):** poly `0x1021`, init `0xFFFF`, tanpa reflect/xorout. Point-of-init tag 01 `11`→`12`.
- Regresi: seluruh test 1a-1/1a-2 existing tetap hijau. DRY, YAGNI, TDD, commit sering.
- Deploy homelab `:3300` (`bash apps/saas/deploy.sh`, `prisma db push` aditif) = **GATED** (controller, izin user; owner set `qris.static`+`price.beli` di `/admin` sebelum checkout jalan).

---

## File Structure

```
apps/saas/
  package.json                          # MODIFY: +qrcode, +@types/qrcode
  prisma/schema.prisma                  # MODIFY: model Payment + User.payments relation
  lib/config.ts                         # MODIFY: DEFAULT_CONFIG + price.discountBuffer/qris.static/copy.refund
  lib/qris/dynamic.ts                   # NEW: crc16ccitt + generateDynamicQris
  lib/qris/dynamic.test.ts              # NEW
  lib/payment/errors.ts                 # NEW: error classes
  lib/payment/service.ts                # NEW: checkout + admin fns
  lib/payment/service.test.ts           # NEW
  lib/payment/notify.ts                 # NEW: notifyActivated
  lib/payment/notify.test.ts            # NEW
  app/api/beli/checkout/route.ts        # NEW
  app/api/beli/[id]/mark-paid/route.ts  # NEW
  app/api/admin/payment/[id]/activate/route.ts  # NEW
  app/api/admin/payment/[id]/cancel/route.ts    # NEW
  app/api/admin/payment/deactivate/route.ts     # NEW
  app/api/beli/wa-routes.. (test)       # payment-routes.test.ts
  app/beli/page.tsx                     # NEW: checkout + QR + countdown
  components/BeliCheckout.tsx           # NEW: client checkout widget
  components/admin/PaymentQueue.tsx     # NEW: pending list + activate/cancel
  components/admin/PaidList.tsx         # NEW: paid list + deactivate
  app/admin/page.tsx                    # MODIFY: +section Pembayaran
  components/Calculator.tsx             # MODIFY: "Beli 🔒" → link /beli
```

---

### Task 1: Schema Payment + Config defaults + deps

**Files:**
- Modify: `apps/saas/prisma/schema.prisma`, `apps/saas/lib/config.ts`, `apps/saas/package.json`

**Interfaces:**
- Produces: model `Payment` (fields per §2 spec) + `User.payments Payment[]`; `prisma.payment`. `DEFAULT_CONFIG` gains `price.discountBuffer`/`qris.static`/`copy.refund`. Deps `qrcode`+`@types/qrcode`.

- [ ] **Step 1: Tambah model `Payment` + relasi di `apps/saas/prisma/schema.prisma`**

Tambah ke model `User` (di dalam blok, setelah baris `entitlement Entitlement?`):
```prisma
  payments      Payment[]
```
Tambah model baru (setelah `model WaOtp`):
```prisma
model Payment {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tier         String
  displayPrice Int
  amount       Int
  uniqueCode   Int
  qrPayload    String
  status       String    @default("PENDING")
  paidMarkedAt DateTime?
  verifiedAt   DateTime?
  verifiedBy   String?
  createdAt    DateTime  @default(now())

  @@index([status, createdAt])
}
```

- [ ] **Step 2: Tambah dep `qrcode` ke `apps/saas/package.json`**

Di `dependencies` tambah `"qrcode": "^1.5.4"`; di `devDependencies` tambah `"@types/qrcode": "^1.5.6"`.

- [ ] **Step 3: Tambah Config default di `apps/saas/lib/config.ts`**

Di object `DEFAULT_CONFIG`, tambah 3 entri:
```ts
  "price.discountBuffer": "1000",
  "qris.static": "",
  "copy.refund": "Refund 7 hari sejak pembelian — hubungi kami via WhatsApp/email.",
```

- [ ] **Step 4: Install + generate + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm install
pnpm --filter @3pb/saas exec prisma validate
pnpm --filter @3pb/saas exec prisma generate
pnpm --filter @3pb/saas build
```
Expected: install menambah qrcode; `validate` valid; `generate` → `prisma.payment` ada; build sukses.

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/prisma/schema.prisma apps/saas/lib/config.ts apps/saas/package.json pnpm-lock.yaml
git commit -m "feat(saas): schema Payment + Config keys payment + qrcode dep"
```

---

### Task 2: `lib/qris/dynamic.ts` — dynamic QRIS + CRC16 (TDD)

**Files:**
- Create: `apps/saas/lib/qris/dynamic.ts`, `apps/saas/lib/qris/dynamic.test.ts`

**Interfaces:**
- Produces:
  - `crc16ccitt(s: string): string` — CRC16-CCITT(FALSE) → 4 hex uppercase.
  - `generateDynamicQris(staticPayload: string, amount: number): string` — set tag 01 = `12`, sisip/timpa tag 54 = amount, recompute tag 63 CRC.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/qris/dynamic.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { crc16ccitt, generateDynamicQris } from "@/lib/qris/dynamic";

// QRIS statik sintetis: ada point-of-init "010211" + CRC "6304XXXX" di akhir.
const STATIC = "00020101021126610014ID.CO.QRIS.WWW0215ID10200000000000303UMI5204581253033605802ID5909Toko Test6007Bandung6304ABCD";

describe("crc16ccitt", () => {
  it("check value standar '123456789' → 29B1", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
});

describe("generateDynamicQris", () => {
  it("set point-of-init jadi 12 (dinamis)", () => {
    expect(generateDynamicQris(STATIC, 149347)).toContain("010212");
    expect(generateDynamicQris(STATIC, 149347)).not.toContain("010211");
  });
  it("sisip tag 54 dengan panjang benar", () => {
    expect(generateDynamicQris(STATIC, 149347)).toContain("5406149347"); // 6 digit → len 06
    expect(generateDynamicQris(STATIC, 5000)).toContain("54045000");     // 4 digit → len 04
  });
  it("CRC akhir valid (re-validasi ulang)", () => {
    const out = generateDynamicQris(STATIC, 149347);
    const body = out.slice(0, -4);
    const crc = out.slice(-4);
    expect(body.endsWith("6304")).toBe(true);
    expect(crc16ccitt(body)).toBe(crc);
  });
  it("tak ada CRC lama tersisa (63 hanya sekali di akhir)", () => {
    const out = generateDynamicQris(STATIC, 149347);
    expect(out.indexOf("6304")).toBe(out.length - 8);
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/qris/dynamic.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/qris/dynamic'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/qris/dynamic.ts`**

```ts
/** CRC16-CCITT (FALSE): poly 0x1021, init 0xFFFF, tanpa reflect/xorout. 4 hex uppercase. */
export function crc16ccitt(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/**
 * Generate dynamic QRIS dari payload statis + nominal.
 * - Tag 01 (point of initiation) → "12" (dinamis).
 * - Tag 54 (amount) disisipkan/ditimpa.
 * - Tag 63 (CRC) dihitung ulang di akhir.
 */
export function generateDynamicQris(staticPayload: string, amount: number): string {
  let p = staticPayload.trim();
  // buang CRC lama (tag 63, selalu di akhir: "6304" + 4 char)
  const crcIdx = p.lastIndexOf("6304");
  if (crcIdx !== -1 && crcIdx === p.length - 8) p = p.slice(0, crcIdx);
  // point of initiation 11 → 12 (atau sisipkan bila tak ada)
  if (p.includes("010211")) p = p.replace("010211", "010212");
  else if (!p.includes("010212")) p = p.slice(0, 4) + "010212" + p.slice(4); // setelah tag 00 (6 char)
  // timpa tag 54 lama bila ada (cari "54" + len), lalu sisip yang baru sebelum tag 58/59/60/63 area.
  // Sederhana: sisipkan tag 54 setelah tag 53 (currency) bila ada, else sebelum "5802".
  const amountTlv = tlv("54", String(amount));
  // hapus tag 54 existing (jarang di statik, tapi jaga-jaga): pola 54 + 2-digit-len + value
  p = p.replace(/54\d{2}\d+?(?=5[0-9]02|58\d{2}|59\d{2}|60\d{2}|$)/, "");
  const anchor = p.indexOf("5802");
  if (anchor !== -1) p = p.slice(0, anchor) + amountTlv + p.slice(anchor);
  else p = p + amountTlv;
  // CRC baru
  const body = p + "6304";
  return body + crc16ccitt(body);
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/qris/dynamic.test.ts
```
Expected: PASS (CRC 29B1, point-of-init 12, tag 54, re-validasi CRC).

> Bila regex hapus tag-54 terlalu agresif untuk `STATIC` yang tak punya tag 54, test tetap hijau (replace no-op). Kalau ada kasus payload nyata dengan tag 54 di posisi tak terduga, sederhanakan: karena QRIS statik jarang punya amount, cukup pastikan tag 54 baru tersisip sekali sebelum `5802` — implementer boleh drop regex hapus bila STATIC produksi tak punya tag 54 (catat di report).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/qris/dynamic.ts apps/saas/lib/qris/dynamic.test.ts
git commit -m "feat(saas): lib/qris/dynamic — dynamic QRIS + CRC16 (TDD)"
```

---

### Task 3: `lib/payment/errors.ts` + service checkout side (TDD)

**Files:**
- Create: `apps/saas/lib/payment/errors.ts`, `apps/saas/lib/payment/service.ts`, `apps/saas/lib/payment/service.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`), `getConfig`/`parsePrice` (`@/lib/config`), `generateDynamicQris` (`@/lib/qris/dynamic`), `getEntitlement` (`@/lib/entitlement`).
- Produces (errors): `AlreadyOwned`, `PriceNotSet`, `QrisNotSet`, `CodePoolExhausted` (extends Error).
- Produces (service):
  - `LIVE_WINDOW_MS = 3*60*60*1000`; `liveSince(now): Date`.
  - `allocUniqueCode(now?): Promise<number>` — kode 0..999 tak dipakai payment hidup; semua terpakai → `CodePoolExhausted`.
  - `createOrReuseCheckout(userId, now?): Promise<Payment>` — `AlreadyOwned` bila lifetimeOwned; reuse payment hidup milik user; else buat (baca price/buffer/qris.static, `amount=price−buffer+code`).
  - `markPaid(id, userId, now?): Promise<void>` — set `paidMarkedAt` bila payment milik user & hidup; else throw `Error("not_found")`.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/payment/service.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    payment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/config", async () => {
  const actual = await vi.importActual<any>("@/lib/config");
  return { ...actual, getConfig: vi.fn() };
});
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn() }));
vi.mock("@/lib/qris/dynamic", () => ({ generateDynamicQris: vi.fn(() => "QRPAYLOAD") }));

import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { allocUniqueCode, createOrReuseCheckout, markPaid } from "@/lib/payment/service";
import { AlreadyOwned, PriceNotSet, QrisNotSet } from "@/lib/payment/errors";

const NOW = new Date("2026-07-18T10:00:00Z");
beforeEach(() => vi.clearAllMocks());

describe("allocUniqueCode", () => {
  it("lewati kode yang dipakai payment hidup", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([{ uniqueCode: 0 }, { uniqueCode: 1 }]);
    const code = await allocUniqueCode(NOW);
    expect(code).toBeGreaterThanOrEqual(0);
    expect([0, 1]).not.toContain(code);
  });
});

describe("createOrReuseCheckout", () => {
  function cfg(map: Record<string, string>) {
    (getConfig as any).mockImplementation(async (k: string) => map[k] ?? "");
  }
  it("lifetimeOwned → AlreadyOwned", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: true });
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(AlreadyOwned);
  });
  it("ada invoice hidup → reuse (tak create)", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue({ id: "p-existing" });
    const r = await createOrReuseCheckout("u1", NOW);
    expect(r.id).toBe("p-existing");
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
  it("price belum diset → PriceNotSet", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "" });
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(PriceNotSet);
  });
  it("qris.static kosong → QrisNotSet", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "150000", "qris.static": "" });
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(QrisNotSet);
  });
  it("sukses → amount = price − buffer + kode, create PENDING", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]); // semua kode bebas
    cfg({ "price.beli": "150000", "price.discountBuffer": "1000", "qris.static": "00020101021152...6304ABCD" });
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    const r = await createOrReuseCheckout("u1", NOW);
    expect(r.displayPrice).toBe(150000);
    expect(r.amount).toBe(150000 - 1000 + r.uniqueCode);
    expect(r.status).toBe("PENDING");
    expect(r.qrPayload).toBe("QRPAYLOAD");
  });
});

describe("markPaid", () => {
  it("set paidMarkedAt bila payment milik user & PENDING", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({ id: "p1" });
    await markPaid("p1", "u1", NOW);
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { paidMarkedAt: NOW } });
  });
  it("bukan milik user / tak hidup → throw", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    await expect(markPaid("p1", "u1", NOW)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/payment/service.test.ts
```
Expected: FAIL — module belum ada.

- [ ] **Step 3: Implementasi `apps/saas/lib/payment/errors.ts`**

```ts
export class AlreadyOwned extends Error { constructor() { super("already_owned"); this.name = "AlreadyOwned"; } }
export class PriceNotSet extends Error { constructor() { super("price_not_set"); this.name = "PriceNotSet"; } }
export class QrisNotSet extends Error { constructor() { super("qris_not_set"); this.name = "QrisNotSet"; } }
export class CodePoolExhausted extends Error { constructor() { super("code_pool_exhausted"); this.name = "CodePoolExhausted"; } }
```

- [ ] **Step 4: Implementasi `apps/saas/lib/payment/service.ts`** (bagian checkout)

```ts
import crypto from "crypto";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConfig, parsePrice } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { generateDynamicQris } from "@/lib/qris/dynamic";
import { AlreadyOwned, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
export function liveSince(now: Date): Date { return new Date(now.getTime() - LIVE_WINDOW_MS); }

export async function allocUniqueCode(now = new Date()): Promise<number> {
  const live = await prisma.payment.findMany({
    where: { status: "PENDING", createdAt: { gt: liveSince(now) } },
    select: { uniqueCode: true },
  });
  const used = new Set(live.map((p) => p.uniqueCode));
  if (used.size >= 1000) throw new CodePoolExhausted();
  let code = crypto.randomInt(0, 1000);
  while (used.has(code)) code = crypto.randomInt(0, 1000);
  return code;
}

export async function createOrReuseCheckout(userId: string, now = new Date()): Promise<Payment> {
  const ent = await getEntitlement(userId);
  if (ent.lifetimeOwned) throw new AlreadyOwned();

  const existing = await prisma.payment.findFirst({
    where: { userId, status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const price = parsePrice(await getConfig("price.beli"));
  if (price === null || price <= 0) throw new PriceNotSet();
  const staticQ = (await getConfig("qris.static")).trim();
  if (!staticQ) throw new QrisNotSet();
  const buffer = parsePrice(await getConfig("price.discountBuffer")) ?? 1000;

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: { userId, tier: "beli", displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
  });
}

export async function markPaid(id: string, userId: string, now = new Date()): Promise<void> {
  const p = await prisma.payment.findFirst({
    where: { id, userId, status: "PENDING", createdAt: { gt: liveSince(now) } },
  });
  if (!p) throw new Error("not_found");
  await prisma.payment.update({ where: { id }, data: { paidMarkedAt: now } });
}
```

- [ ] **Step 5: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/payment/service.test.ts
```
Expected: PASS (alloc/checkout/markPaid).

- [ ] **Step 6: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/payment/errors.ts apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts
git commit -m "feat(saas): payment service checkout — allocCode/createOrReuse/markPaid (TDD)"
```

---

### Task 4: Payment service — admin side (TDD)

**Files:**
- Modify: `apps/saas/lib/payment/service.ts`, `apps/saas/lib/payment/service.test.ts`

**Interfaces:**
- Consumes: `prisma` (`payment`, `entitlement`).
- Produces (tambahan di service.ts):
  - `listPending(now?): Promise<Payment[]>` — payment hidup, urut `paidMarkedAt` desc (nulls last), `createdAt` desc.
  - `activate(id, ownerEmail, now?): Promise<Payment | null>` — status≠PENDING → `null` (idempoten). Else set `PAID`+`verifiedAt/By`, upsert `Entitlement.lifetimeOwned=true`+`lifetimePurchasedAt`. Return payment.
  - `cancel(id): Promise<void>` — set `CANCELLED`.
  - `deactivate(userId): Promise<void>` — `Entitlement.lifetimeOwned=false`.
  - `listPaid(limit?): Promise<Payment[]>` — payment `PAID` terbaru (default limit 20).

- [ ] **Step 1: Tambah failing test** ke `service.test.ts`

Tambah blok (mock `prisma.entitlement`):
```ts
// tambahkan ke vi.mock("@/lib/db", ...) → entitlement: { update: vi.fn(), upsert: vi.fn() }
// (edit mock db di atas: tambah entitlement key)

import { listPending, activate, cancel, deactivate, listPaid } from "@/lib/payment/service";

describe("activate", () => {
  it("status bukan PENDING → no-op null (idempoten)", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PAID" });
    expect(await activate("p1", "owner@x.com", NOW)).toBeNull();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
  it("PENDING → set PAID + flip lifetimeOwned", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", userId: "u1", status: "PAID" });
    const r = await activate("p1", "owner@x.com", NOW);
    expect(r?.status).toBe("PAID");
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "PAID", verifiedAt: NOW, verifiedBy: "owner@x.com" } });
    expect(prisma.entitlement.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "u1" },
      update: { lifetimeOwned: true, lifetimePurchasedAt: NOW },
    }));
  });
});

describe("deactivate", () => {
  it("set lifetimeOwned false", async () => {
    await deactivate("u1");
    expect(prisma.entitlement.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { lifetimeOwned: false } });
  });
});

describe("cancel", () => {
  it("set CANCELLED", async () => {
    await cancel("p1");
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "CANCELLED" } });
  });
});
```
(Ubah `vi.mock("@/lib/db", ...)` di file itu supaya `prisma` juga punya `entitlement: { update: vi.fn(), upsert: vi.fn() }`.)

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/payment/service.test.ts
```
Expected: FAIL — `activate`/`cancel`/`deactivate` belum diekspor.

- [ ] **Step 3: Tambah implementasi** ke `apps/saas/lib/payment/service.ts`

```ts
export async function listPending(now = new Date()): Promise<Payment[]> {
  const rows = await prisma.payment.findMany({
    where: { status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: [{ paidMarkedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return rows;
}

export async function activate(id: string, ownerEmail: string, now = new Date()): Promise<Payment | null> {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p || p.status !== "PENDING") return null;
  const updated = await prisma.payment.update({
    where: { id },
    data: { status: "PAID", verifiedAt: now, verifiedBy: ownerEmail },
  });
  await prisma.entitlement.upsert({
    where: { userId: p.userId },
    create: { userId: p.userId, lifetimeOwned: true, lifetimePurchasedAt: now },
    update: { lifetimeOwned: true, lifetimePurchasedAt: now },
  });
  return updated;
}

export async function cancel(id: string): Promise<void> {
  await prisma.payment.update({ where: { id }, data: { status: "CANCELLED" } });
}

export async function deactivate(userId: string): Promise<void> {
  await prisma.entitlement.update({ where: { userId }, data: { lifetimeOwned: false } });
}

export async function listPaid(limit = 20): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { status: "PAID" }, orderBy: { verifiedAt: "desc" }, take: limit });
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/payment/service.test.ts
```
Expected: PASS (activate idempoten + flip, cancel, deactivate).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts
git commit -m "feat(saas): payment service admin — listPending/activate/cancel/deactivate/listPaid (TDD)"
```

---

### Task 5: `lib/payment/notify.ts` — notif aktivasi (TDD)

**Files:**
- Create: `apps/saas/lib/payment/notify.ts`, `apps/saas/lib/payment/notify.test.ts`

**Interfaces:**
- Consumes: `sendWA` (`@/lib/wa/client`).
- Produces: `notifyActivated(user: { phone: string | null; email: string | null }): Promise<void>` — nomor → `sendWA`; else email → Resend REST (`POST https://api.resend.com/emails`). Best-effort (try/catch, tak throw).

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/payment/notify.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/wa/client", () => ({ sendWA: vi.fn() }));
import { sendWA } from "@/lib/wa/client";
import { notifyActivated } from "@/lib/payment/notify";

const ENV = { ...process.env };
beforeEach(() => { vi.clearAllMocks(); process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "Slizebiz <halo@slizebiz.com>"; });
afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });

describe("notifyActivated", () => {
  it("punya phone → sendWA (bukan email)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await notifyActivated({ phone: "628111", email: null });
    expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("aktif"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("tanpa phone tapi ada email → Resend REST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await notifyActivated({ phone: null, email: "a@b.com" });
    expect(sendWA).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  });
  it("kegagalan notif tak dilempar (best-effort)", async () => {
    (sendWA as any).mockRejectedValue(new Error("down"));
    await expect(notifyActivated({ phone: "628111", email: null })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/payment/notify.test.ts
```
Expected: FAIL — module belum ada.

- [ ] **Step 3: Implementasi `apps/saas/lib/payment/notify.ts`**

```ts
import { sendWA } from "@/lib/wa/client";

const MSG = "Pembayaran terverifikasi — akun Slizebiz kamu sudah aktif 🎉 Terima kasih!";

async function sendEmail(to: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("resend env absent");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Akun Slizebiz aktif", text: MSG }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`resend HTTP ${res.status}`);
}

/** Best-effort: kabari user aktivasi via channel-nya. Tak pernah throw. */
export async function notifyActivated(user: { phone: string | null; email: string | null }): Promise<void> {
  try {
    if (user.phone) await sendWA(user.phone, MSG);
    else if (user.email) await sendEmail(user.email);
  } catch (e) {
    console.error("[notify] gagal kirim notif aktivasi:", (e as Error).message);
  }
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/payment/notify.test.ts
```
Expected: PASS (WA path, email path, best-effort swallow).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/payment/notify.ts apps/saas/lib/payment/notify.test.ts
git commit -m "feat(saas): payment notify — notifyActivated WA/Resend best-effort (TDD)"
```

---

### Task 6: Route beli + admin payment

**Files:**
- Create: `apps/saas/app/api/beli/checkout/route.ts`, `apps/saas/app/api/beli/[id]/mark-paid/route.ts`, `apps/saas/app/api/admin/payment/[id]/activate/route.ts`, `apps/saas/app/api/admin/payment/[id]/cancel/route.ts`, `apps/saas/app/api/admin/payment/deactivate/route.ts`
- Test: `apps/saas/app/api/beli/payment-routes.test.ts`

**Interfaces:**
- Consumes: `auth` (`@/lib/auth`), `isOwner` (`@/lib/owner`), service fns, `notifyActivated`, `prisma` (load user untuk notif).
- Produces:
  - `POST /api/beli/checkout` → sesi wajib (401 anon); `createOrReuseCheckout` → 200 `{id,amount,qrPayload,displayPrice}`; error mapping (AlreadyOwned→200 `{owned:true}`, PriceNotSet/QrisNotSet→503, CodePoolExhausted→503).
  - `POST /api/beli/[id]/mark-paid` → sesi wajib; `markPaid(id, userId)` → 200; not_found→404.
  - `PUT /api/admin/payment/[id]/activate` → owner (403 else); `activate` → bila payment, load user & `notifyActivated` (non-fatal) → 200 `{ok:true}`.
  - `PUT /api/admin/payment/[id]/cancel` → owner; `cancel` → 200.
  - `PUT /api/admin/payment/deactivate` `{userId}` → owner; `deactivate` → 200.

- [ ] **Step 1: Tulis failing test** (mock service/notify/auth/owner)

`apps/saas/app/api/beli/payment-routes.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/owner", () => ({ isOwner: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({
  createOrReuseCheckout: vi.fn(), markPaid: vi.fn(), activate: vi.fn(), cancel: vi.fn(), deactivate: vi.fn(),
}));
vi.mock("@/lib/payment/notify", () => ({ notifyActivated: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { createOrReuseCheckout, activate } from "@/lib/payment/service";
import { notifyActivated } from "@/lib/payment/notify";
import { prisma } from "@/lib/db";
import { AlreadyOwned, QrisNotSet } from "@/lib/payment/errors";
import { POST as checkoutPOST } from "@/app/api/beli/checkout/route";
import { PUT as activatePUT } from "@/app/api/admin/payment/[id]/activate/route";

const req = (body?: unknown) => new Request("http://x", { method: "POST", body: body ? JSON.stringify(body) : undefined });
beforeEach(() => vi.clearAllMocks());

describe("checkout", () => {
  it("anon → 401", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await checkoutPOST(req())).status).toBe(401);
  });
  it("sukses → 200 payload", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockResolvedValue({ id: "p1", amount: 149347, qrPayload: "Q", displayPrice: 150000 });
    const res = await checkoutPOST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).amount).toBe(149347);
  });
  it("AlreadyOwned → 200 {owned:true}", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockRejectedValue(new AlreadyOwned());
    const res = await checkoutPOST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).owned).toBe(true);
  });
  it("QrisNotSet → 503", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockRejectedValue(new QrisNotSet());
    expect((await checkoutPOST(req())).status).toBe(503);
  });
});

describe("admin activate", () => {
  const ctx = { params: Promise.resolve({ id: "p1" }) };
  it("non-owner → 403", async () => {
    (auth as any).mockResolvedValue({ user: { email: "x@y.com" } });
    (isOwner as any).mockReturnValue(false);
    expect((await activatePUT(req(), ctx)).status).toBe(403);
  });
  it("owner → activate + notif + 200", async () => {
    (auth as any).mockResolvedValue({ user: { email: "owner@x.com" } });
    (isOwner as any).mockReturnValue(true);
    (activate as any).mockResolvedValue({ id: "p1", userId: "u1" });
    (prisma.user.findUnique as any).mockResolvedValue({ phone: "628111", email: null });
    const res = await activatePUT(req(), ctx);
    expect(res.status).toBe(200);
    expect(notifyActivated).toHaveBeenCalledWith({ phone: "628111", email: null });
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test app/api/beli/payment-routes.test.ts
```
Expected: FAIL — route belum ada.

- [ ] **Step 3: `apps/saas/app/api/beli/checkout/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOrReuseCheckout } from "@/lib/payment/service";
import { AlreadyOwned, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const p = await createOrReuseCheckout(userId);
    return NextResponse.json({ id: p.id, amount: p.amount, qrPayload: p.qrPayload, displayPrice: p.displayPrice });
  } catch (e) {
    if (e instanceof AlreadyOwned) return NextResponse.json({ owned: true });
    if (e instanceof PriceNotSet || e instanceof QrisNotSet || e instanceof CodePoolExhausted)
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: `apps/saas/app/api/beli/[id]/mark-paid/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markPaid } from "@/lib/payment/service";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await markPaid(id, userId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
```

- [ ] **Step 5: `apps/saas/app/api/admin/payment/[id]/activate/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { activate } from "@/lib/payment/service";
import { notifyActivated } from "@/lib/payment/notify";
import { prisma } from "@/lib/db";

export async function PUT(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const p = await activate(id, session!.user!.email!);
  if (p) {
    const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { phone: true, email: true } });
    if (user) await notifyActivated(user);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: `apps/saas/app/api/admin/payment/[id]/cancel/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { cancel } from "@/lib/payment/service";

export async function PUT(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  await cancel(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: `apps/saas/app/api/admin/payment/deactivate/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { deactivate } from "@/lib/payment/service";

export async function PUT(req: Request) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "");
  if (!userId) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await deactivate(userId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Jalankan test + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test app/api/beli/payment-routes.test.ts
pnpm --filter @3pb/saas build
```
Expected: test PASS; build sukses (semua route ter-compile).

- [ ] **Step 9: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/app/api/beli apps/saas/app/api/admin/payment
git commit -m "feat(saas): route beli checkout/mark-paid + admin payment activate/cancel/deactivate"
```

---

### Task 7: Halaman `/beli` (checkout + QR) + wire kalkulator

**Files:**
- Create: `apps/saas/app/beli/page.tsx`, `apps/saas/components/BeliCheckout.tsx`
- Modify: `apps/saas/components/Calculator.tsx`
- Test: `apps/saas/components/beli-checkout.test.tsx`

**Interfaces:**
- Consumes: `auth` (page guard), `getConfig` (harga+copy refund), `QRCode` (`qrcode`).
- Produces: `/beli` — login wajib; tampil harga, tombol Beli → `POST /api/beli/checkout` → render QR (`qrPayload`) + nominal + countdown 3 jam + "Saya sudah bayar" (`mark-paid`).

- [ ] **Step 1: `apps/saas/app/beli/page.tsx`** (server: guard + ambil harga/copy)

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { BeliCheckout } from "@/components/BeliCheckout";

export const dynamic = "force-dynamic";

export default async function BeliPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const price = await getConfig("price.beli");
  const refund = await getConfig("copy.refund");
  return (
    <main className="max-w-sm mx-auto p-6 mt-10">
      <h1 className="text-lg font-semibold g-t1 mb-1">Beli Slizebiz</h1>
      {ent.lifetimeOwned
        ? <p className="text-[13px] g-t2 mt-3">Kamu sudah punya akses Beli. Terima kasih! 🎉</p>
        : <BeliCheckout displayPrice={price} refundCopy={refund} />}
    </main>
  );
}
```

- [ ] **Step 2: `apps/saas/components/BeliCheckout.tsx`** (client)

```tsx
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { GlassButton } from "@3pb/ui";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
type Invoice = { id: string; amount: number; qrPayload: string; displayPrice: number };

export function BeliCheckout({ displayPrice, refundCopy }: { displayPrice: string; refundCopy: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [qrSrc, setQrSrc] = useState("");
  const [msg, setMsg] = useState("");
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (inv?.qrPayload) QRCode.toDataURL(inv.qrPayload, { width: 240 }).then(setQrSrc).catch(() => {});
  }, [inv?.qrPayload]);

  async function beli() {
    setPending(true); setMsg("");
    const res = await fetch("/api/beli/checkout", { method: "POST" });
    setPending(false);
    const data = await res.json().catch(() => ({}));
    if (data.owned) { setMsg("Kamu sudah punya akses."); return; }
    if (res.status === 503) { setMsg("Pembayaran belum aktif. Coba lagi nanti."); return; }
    if (!res.ok) { setMsg("Gagal membuat invoice."); return; }
    setInv(data);
  }

  async function sudahBayar() {
    if (!inv) return;
    setPending(true);
    const res = await fetch(`/api/beli/${inv.id}/mark-paid`, { method: "POST" });
    setPending(false);
    if (res.ok) setPaid(true);
  }

  const priceNum = Number(displayPrice);
  return (
    <div className="flex flex-col gap-3 mt-2">
      {!inv ? (
        <>
          <p className="text-[13px] g-t2">Akses Beli (sekali bayar): {displayPrice ? rupiah(priceNum) : "—"}</p>
          <GlassButton onClick={beli} disabled={pending || !displayPrice}>{pending ? "Memproses…" : "Beli sekarang"}</GlassButton>
        </>
      ) : paid ? (
        <p className="text-[13px] g-t2">Terima kasih! Pembayaran kamu sedang <b>diverifikasi admin</b>. Kamu akan dikabari begitu aktif.</p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[12px] g-t4 text-center">Scan QRIS & transfer <b>TEPAT</b> nominal ini:</p>
          <div className="text-xl font-bold" style={{ color: "var(--g-accent)" }}>{rupiah(inv.amount)}</div>
          {qrSrc && <img src={qrSrc} alt="QRIS" width={240} height={240} />}
          <p className="text-[11px] g-t4">Invoice berlaku 3 jam.</p>
          <GlassButton onClick={sudahBayar} disabled={pending} className="w-full">{pending ? "…" : "Saya sudah bayar"}</GlassButton>
        </div>
      )}
      {msg && <p className="text-[12px] g-t3">{msg}</p>}
      <p className="text-[11px] g-t5 mt-2">{refundCopy}</p>
    </div>
  );
}
```

- [ ] **Step 3: Wire kalkulator "Beli 🔒" → `/beli`** di `apps/saas/components/Calculator.tsx`

Cari tombol footer yang membuka `UpgradeModal` (teks "Simpan hasil, multi-plate, labor & settings custom → Beli 🔒"). Ganti `onClick={() => setShowUpgrade(true)}` menjadi navigasi:
```tsx
onClick={() => { window.location.href = "/beli"; }}
```
(Boleh biarkan `UpgradeModal` import/komponen ada — tak dipakai lagi; hapus state `showUpgrade` bila jadi unused agar lint bersih. Kalau menghapus memicu error "unused", hapus juga baris `{showUpgrade && <UpgradeModal ... />}` dan importnya.)

- [ ] **Step 4: Component test**

`apps/saas/components/beli-checkout.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,x") } }));
import { BeliCheckout } from "@/components/BeliCheckout";

beforeEach(() => vi.restoreAllMocks());

describe("BeliCheckout", () => {
  it("klik Beli → checkout → tampil nominal + QR", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ id: "p1", amount: 149347, qrPayload: "Q", displayPrice: 150000 }) } as Response);
    render(<BeliCheckout displayPrice="150000" refundCopy="Refund 7 hari" />);
    fireEvent.click(screen.getByText("Beli sekarang"));
    await waitFor(() => expect(screen.getByText(/149.347/)).toBeTruthy());
    await waitFor(() => expect(screen.getByAltText("QRIS")).toBeTruthy());
  });
  it("owned → pesan sudah punya", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ owned: true }) } as Response);
    render(<BeliCheckout displayPrice="150000" refundCopy="x" />);
    fireEvent.click(screen.getByText("Beli sekarang"));
    await waitFor(() => expect(screen.getByText(/sudah punya/i)).toBeTruthy());
  });
});
```

- [ ] **Step 5: Jalankan test + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test components/beli-checkout.test.tsx
pnpm --filter @3pb/saas build
```
Expected: test PASS; build sukses.

- [ ] **Step 6: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/app/beli apps/saas/components/BeliCheckout.tsx apps/saas/components/Calculator.tsx apps/saas/components/beli-checkout.test.tsx
git commit -m "feat(saas): halaman /beli checkout + QR + wire kalkulator Beli"
```

---

### Task 8: Tab admin Pembayaran

**Files:**
- Create: `apps/saas/components/admin/PaymentQueue.tsx`, `apps/saas/components/admin/PaidList.tsx`
- Modify: `apps/saas/app/admin/page.tsx`

**Interfaces:**
- Consumes: `listPending`/`listPaid` (service), `prisma` (user email/phone untuk display).
- Produces: section "Pembayaran" di `/admin` — tabel pending (nominal, user, umur) + tombol Aktifkan/Batalkan; daftar PAID + tombol Nonaktifkan.

- [ ] **Step 1: `apps/saas/components/admin/PaymentQueue.tsx`** (client)

```tsx
"use client";
import { useState } from "react";
import { GlassButton } from "@3pb/ui";

export type PendingRow = { id: string; amount: number; who: string; ageMin: number; marked: boolean };

export function PaymentQueue({ rows }: { rows: PendingRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function act(id: string, action: "activate" | "cancel") {
    setBusy(id);
    await fetch(`/api/admin/payment/${id}/${action}`, { method: "PUT" });
    setBusy(null);
    window.location.reload();
  }
  if (rows.length === 0) return <p className="text-[12px] g-t4">Tidak ada pembayaran pending.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead><tr className="g-t4 text-left"><th className="pr-3">Nominal</th><th className="pr-3">User</th><th className="pr-3">Umur</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3 font-medium">{"Rp" + r.amount.toLocaleString("id-ID")} {r.marked && <span title="user tandai sudah bayar">✅</span>}</td>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">{r.ageMin}m</td>
              <td className="flex gap-2 py-1">
                <GlassButton onClick={() => act(r.id, "activate")} disabled={busy === r.id} className="h-7 px-2 text-[11px]">Aktifkan</GlassButton>
                <button onClick={() => act(r.id, "cancel")} disabled={busy === r.id} className="text-[11px] g-t4 underline">Batalkan</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: `apps/saas/components/admin/PaidList.tsx`** (client)

```tsx
"use client";
import { useState } from "react";

export type PaidRow = { id: string; userId: string; amount: number; who: string; when: string };

export function PaidList({ rows }: { rows: PaidRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function deactivate(userId: string) {
    if (!confirm("Nonaktifkan akses user ini (refund)?")) return;
    setBusy(userId);
    await fetch("/api/admin/payment/deactivate", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
    });
    setBusy(null);
    window.location.reload();
  }
  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada pembayaran terverifikasi.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead><tr className="g-t4 text-left"><th className="pr-3">Nominal</th><th className="pr-3">User</th><th className="pr-3">Tgl</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3">{"Rp" + r.amount.toLocaleString("id-ID")}</td>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">{r.when}</td>
              <td><button onClick={() => deactivate(r.userId)} disabled={busy === r.userId} className="text-[11px] underline" style={{ color: "#dc2626" }}>Nonaktifkan</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Wire ke `apps/saas/app/admin/page.tsx`**

Tambah import + fetch di server component, dan render section. Tambah setelah section Waitlist:
```tsx
// tambah import:
import { listPending, listPaid } from "@/lib/payment/service";
import { prisma } from "@/lib/db";
import { PaymentQueue, type PendingRow } from "@/components/admin/PaymentQueue";
import { PaidList, type PaidRow } from "@/components/admin/PaidList";

// di dalam AdminPage(), setelah ambil waitlist:
const now = new Date();
const pending = await listPending(now);
const paid = await listPaid(20);
const userIds = [...new Set([...pending, ...paid].map((p) => p.userId))];
const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, phone: true } });
const whoOf = (uid: string) => { const u = users.find((x) => x.id === uid); return u?.email ?? u?.phone ?? uid.slice(0, 6); };
const pendingRows: PendingRow[] = pending.map((p) => ({ id: p.id, amount: p.amount, who: whoOf(p.userId), ageMin: Math.floor((now.getTime() - p.createdAt.getTime()) / 60000), marked: !!p.paidMarkedAt }));
const paidRows: PaidRow[] = paid.map((p) => ({ id: p.id, userId: p.userId, amount: p.amount, who: whoOf(p.userId), when: p.verifiedAt ? p.verifiedAt.toISOString().slice(0, 10) : "" }));
```
Render (setelah section Waitlist):
```tsx
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Pembayaran pending ({pendingRows.length})</h2>
        <PaymentQueue rows={pendingRows} />
      </section>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Terverifikasi (refund/nonaktif)</h2>
        <PaidList rows={paidRows} />
      </section>
```

- [ ] **Step 4: Build (verifikasi wiring)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas build
```
Expected: build sukses (`/admin` server component + komponen client baru).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/components/admin/PaymentQueue.tsx apps/saas/components/admin/PaidList.tsx apps/saas/app/admin/page.tsx
git commit -m "feat(saas): admin tab Pembayaran — antrian pending (aktivasi/batal) + PAID (refund)"
```

---

### Task 9: Verifikasi akhir + docs (deploy GATED)

**Files:**
- Modify: `apps/saas/README.md`

**Interfaces:**
- Consumes: hasil Task 1–8.
- Produces: docs + bukti `pnpm turbo test`/`build` hijau. Deploy = GATED (controller, izin user).

- [ ] **Step 1: Update `apps/saas/README.md`** — tambah baris di Arsitektur:

```markdown
- Payment (Beli, 1c): dynamic QRIS manual (`lib/qris/dynamic.ts` + `lib/payment/*`), checkout `/beli` → QR nominal-unik → user "sudah bayar" → admin verifikasi (`/admin` tab Pembayaran) → flip `lifetimeOwned` + notif (WA/email). Owner set `qris.static` + `price.beli` di `/admin`. Fitur Beli-nya (save/multi-plate) = 1b; Subscribe = 1c-lanjut.
```

- [ ] **Step 2: Seluruh suite + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas exec prisma generate
pnpm turbo test
pnpm turbo build
```
Expected: semua package hijau (termasuk qris/payment/notify/route/beli-checkout baru + test 1a-1/1a-2 tetap lulus); build sukses.

- [ ] **Step 3: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/README.md
git commit -m "docs(saas): README payment 1c (Beli QRIS manual)"
```

- [ ] **Step 4: Deploy homelab (GATED — controller, izin user)**

Setelah izin: `bash apps/saas/deploy.sh` (entrypoint `prisma db push` tambah tabel `Payment`, aditif aman). Lalu owner buka `/admin` → set `qris.static` (paste teks QRIS statik merchant) + `price.beli` (mis. `150000`). Smoke: `/beli` → checkout → QR muncul → "sudah bayar" → `/admin` Pembayaran → Aktifkan → cek notif + `paidCore` aktif.

---

## Self-Review

**1. Spec coverage:** Payment model + Config → T1 ✅; dynamic QRIS+CRC → T2 ✅; checkout service (kode unik/reuse/amount/errors) → T3 ✅; admin service (activate idempoten/cancel/deactivate/listPending/listPaid) → T4 ✅; notif WA/Resend → T5 ✅; route beli+admin (auth/owner-guard/error map/notif) → T6 ✅; UI /beli+QR+wire kalkulator → T7 ✅; admin tab Pembayaran → T8 ✅; docs+deploy → T9 ✅. capabilities() tak diubah (spec §6) ✅. Subscribe/fitur-Beli di luar scope ✅.

**2. Placeholder scan:** tak ada TBD/TODO. `qris.static` default "" = sengaja (owner isi). Regex hapus tag-54 di T2 diberi catatan fallback (bukan placeholder).

**3. Type consistency:** `createOrReuseCheckout→Payment`, `activate→Payment|null`, `markPaid/cancel/deactivate→void`, `listPending/listPaid→Payment[]`, error classes (T3) dipakai T6 map. `notifyActivated({phone,email})` (T5) dipakai T6. Route params `Promise<{id}>` (Next 16 async params) konsisten. `generateDynamicQris(static,amount)` (T2) dipakai T3. Config keys `price.beli/price.discountBuffer/qris.static/copy.refund` konsisten T1↔T3↔T7.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-18-fase1c-payment-qris-beli.md`. Dua opsi eksekusi:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review antar task.
**2. Inline Execution** — via executing-plans, batch + checkpoint.

**Which approach?**
