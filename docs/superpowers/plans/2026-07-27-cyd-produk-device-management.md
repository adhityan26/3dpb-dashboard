# CYD Produk — Sub-proyek 1: SaaS Backend & Device Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fondasi backend `apps/saas` supaya customer Pro/Subscribe bisa daftarkan printer (metadata saja), atur layout tampilan CYD lewat editor drag-drop, dan generate token buat Agent (sub-proyek terpisah) autentikasi ke server.

**Architecture:** Ekstrak kontrak layout JSON yang sudah matang dari `apps/dashboard` ke package bersama (`packages/cyd-layout-schema`), pakai di `apps/saas` lewat 3 model Prisma baru (`Device`, `CydLayout`, `AgentToken`) + 1 field baru di `Entitlement`. Dua permukaan API: session-auth (browser, dipakai UI) dan token-auth (dipakai Agent sub-proyek berikutnya, BUKAN Next middleware — helper per-route).

**Tech Stack:** Next.js 16 App Router, Prisma 7 + `@prisma/adapter-pg`, Postgres, Vitest, `@dnd-kit/core` + `framer-motion` (UI drag-drop).

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum perintah apa pun.
- Monorepo pnpm-strict — dependency harus dideklarasikan eksplisit di `package.json` app yang memakainya, jangan andalkan phantom dependency.
- **JANGAN `git add -A`/`git add .`** — selalu `git add <path spesifik>`.
- `apps/saas` & `apps/dashboard` berbagi entri pnpm-store `@prisma/client` — kalau kedua app di-`prisma generate` di sesi yang sama, regenerate app yang di-build TERAKHIR sebelum lanjut (`cd apps/<app> && npx prisma generate`).
- Firmware buffer (WAJIB, sumber `~/Documents/Project/3pb-monitoring-display/apps/internal/src/layout/layout_types.h`): `printerId[24]` (≤23 char), `label[16]` (≤15 char), `labelText[32]` (≤31 char), page `id[16]` (≤15 char). Ini bukan preferensi — kelebihan karakter di-`strlcpy` truncate diam-diam oleh firmware.
- `LAYOUT_LIMITS` existing (JANGAN diubah nilainya, cuma ditambah): `maxPages: 8, maxCellsPerPage: 24, maxGridRows: 8, maxFieldsPerRow: 3, maxRowsPerFieldsPageDefault: 8, maxRowsPerFieldsCellOverride: 3`.
- Semua test service/API baru pakai mock `vi.mock("@/lib/db")` (pola existing project, lihat `apps/saas/lib/payment/service.test.ts`) KECUALI test race condition di Task 6 yang WAJIB jalan ke Postgres asli (tak bisa dibuktikan lewat mock).
- Tier gating: `paidCore` (dari `capabilities()` di `apps/saas/lib/entitlement.ts`) dipakai di SEMUA endpoint fitur ini (device CRUD, layout, agent-token, `/api/agent/*`). TIDAK ADA halaman "Monitor" live-status di sub-proyek ini.

---

## File Structure

**Baru:**
- `packages/cyd-layout-schema/` — package baru: `src/types.ts`, `src/validate.ts`, `src/index.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/validate.test.ts`.
- `apps/saas/lib/id/short-code.ts` — generator `shortCode` (base36, retry-safe).
- `apps/saas/lib/devices/service.ts` — CRUD device + enforcement slot + row-lock.
- `apps/saas/lib/cyd-layout/service.ts` — get/save layout akun.
- `apps/saas/lib/agent-tokens/service.ts` — generate/list/revoke token.
- `apps/saas/lib/agent-auth.ts` — `requireAgentToken()` helper (BUKAN middleware).
- `apps/saas/app/api/devices/route.ts`, `apps/saas/app/api/devices/[id]/route.ts`
- `apps/saas/app/api/cyd-layout/route.ts`
- `apps/saas/app/api/agent-tokens/route.ts`, `apps/saas/app/api/agent-tokens/[id]/route.ts`
- `apps/saas/app/api/agent/devices/route.ts`, `apps/saas/app/api/agent/layout/route.ts`
- `apps/saas/app/printer/page.tsx` — halaman device list.
- `apps/saas/components/printer/DeviceList.tsx`, `apps/saas/components/printer/LayoutEditor.tsx` (+ sub-komponen porting dari dashboard).
- `apps/saas/components/settings/AgentTokenSection.tsx`

**Dimodifikasi:**
- `apps/dashboard/lib/cyd-layout/types.ts`, `build-config.ts` → jadi re-export tipis dari `@3pb/cyd-layout-schema`.
- `apps/saas/prisma/schema.prisma` — 3 model baru + `Entitlement.printerSlots` + relasi balik `User`.
- `apps/saas/lib/config.ts` — `getConfigInt` + `DEFAULT_CONFIG["printer.defaultSlots"]`.
- `apps/saas/components/AppHeader.tsx` — promote tab "printer".
- `apps/saas/app/settings/page.tsx` — mount `AgentTokenSection`.
- `apps/saas/package.json` — 4 dependency baru (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `framer-motion`).
- `apps/dashboard/scripts/backfill-printer-slug.ts` — tambah mode audit-panjang.

---

### Task 1: Audit & perbaiki panjang `Printer.slug` existing (pre-flight, dashboard)

**Files:**
- Modify: `apps/dashboard/scripts/backfill-printer-slug.ts`
- Test: `apps/dashboard/scripts/__tests__/backfill-printer-slug.test.ts` (baru)

**Interfaces:**
- Produces: fungsi murni `truncateSlugSafe(slug: string, maxLen: number): string` — dipakai script ini, diekspor buat testable.

**Kenapa task ini duluan:** Task 2 nanti menambah validasi panjang string (`printerId ≤ 23`) ke kontrak layout yang dipakai `apps/dashboard`. `Printer.slug` hari ini **unbounded** (`slugify(nama)`, tanpa cap) — kalau ada slug existing di DB yang > 23 karakter, begitu Task 2 aktif, simpan layout yang mereferensikan printer itu akan mulai gagal 400 (regresi tersembunyi, karena test existing kebetulan cuma pakai nama pendek). Task ini duluan supaya data sudah bersih sebelum validasi baru mendarat.

- [ ] **Step 1: Tulis test buat fungsi truncate**

```typescript
// apps/dashboard/scripts/__tests__/backfill-printer-slug.test.ts
import { describe, it, expect } from "vitest";
import { truncateSlugSafe } from "../backfill-printer-slug";

describe("truncateSlugSafe", () => {
  it("slug pendek tidak berubah", () => {
    expect(truncateSlugSafe("mars", 23)).toBe("mars");
  });

  it("slug kepanjangan dipotong ke maxLen", () => {
    const long = "bambu-lab-x1-carbon-rack-2"; // 26 char
    const result = truncateSlugSafe(long, 23);
    expect(result.length).toBeLessThanOrEqual(23);
  });

  it("slug yang dipotong tetap unik lewat suffix hash pendek kalau ambigu", () => {
    const a = truncateSlugSafe("bambu-lab-x1-carbon-rack-alpha", 23);
    const b = truncateSlugSafe("bambu-lab-x1-carbon-rack-beta", 23);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/dashboard && npx vitest run scripts/__tests__/backfill-printer-slug.test.ts`
Expected: FAIL — `truncateSlugSafe` belum diekspor/belum ada.

- [ ] **Step 3: Implementasi `truncateSlugSafe` + mode audit di script**

Tambahkan ke `apps/dashboard/scripts/backfill-printer-slug.ts` (di atas `main()`, dan ekspor):

```typescript
import crypto from "crypto";

export function truncateSlugSafe(slug: string, maxLen: number): string {
  if (slug.length <= maxLen) return slug;
  // Potong, sisakan 5 karakter buat suffix hash pendek biar tak collision antar-slug yang truncate ke prefix sama.
  const suffix = crypto.createHash("sha256").update(slug).digest("hex").slice(0, 4);
  return `${slug.slice(0, maxLen - 5)}-${suffix}`;
}
```

Tambahkan mode audit di `main()` (sebelum bagian existing yang isi slug `null`):

```typescript
const MAX_SLUG_LEN = 23; // cocok LAYOUT_LIMITS.maxPrinterIdLength (Task 2)

async function auditLongSlugs(apply: boolean) {
  const printers = await prisma.printer.findMany({ where: { slug: { not: null } } });
  const long = printers.filter((p) => (p.slug as string).length > MAX_SLUG_LEN);
  if (long.length === 0) {
    console.log("Semua slug existing sudah ≤ 23 karakter.");
    return;
  }
  console.log(`${long.length} printer dengan slug > ${MAX_SLUG_LEN} karakter:\n`);
  for (const p of long) {
    const proposed = truncateSlugSafe(p.slug as string, MAX_SLUG_LEN);
    console.log(`  ${(p.slug as string).padEnd(30)} (${(p.slug as string).length}) -> ${proposed} (${proposed.length})`);
  }
  if (!apply) {
    console.log("\nDry-run. Verifikasi manual (slug baru harus match ulang ke id MQTT 3dpb/printers");
    console.log("kalau service printer-monitor juga diupdate), baru jalankan --apply.");
    return;
  }
  for (const p of long) {
    await prisma.printer.update({ where: { id: p.id }, data: { slug: truncateSlugSafe(p.slug as string, MAX_SLUG_LEN) } });
  }
  console.log(`\n${long.length} slug di-update.`);
}
```

Panggil `auditLongSlugs(apply)` di awal `main()`, sebelum logic slug-`null`-existing yang sudah ada.

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/dashboard && npx vitest run scripts/__tests__/backfill-printer-slug.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Jalankan dry-run terhadap DB dev, laporkan hasil (JANGAN --apply tanpa verifikasi manual)**

Run: `cd apps/dashboard && npx tsx scripts/backfill-printer-slug.ts`
Catat output. Kalau ada slug > 23 char yang ketemu, tunjukkan ke controller sebelum `--apply` — controller yang putuskan kapan jalankan `--apply` ke DB produksi (mengikuti pola gated-deploy proyek ini).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/scripts/backfill-printer-slug.ts apps/dashboard/scripts/__tests__/backfill-printer-slug.test.ts
git commit -m "feat(dashboard): audit+fix Printer.slug > 23 char sebelum validasi panjang layout aktif"
```

---

### Task 2: Ekstrak `packages/cyd-layout-schema`

**Files:**
- Create: `packages/cyd-layout-schema/package.json`, `packages/cyd-layout-schema/tsconfig.json`, `packages/cyd-layout-schema/vitest.config.ts`
- Create: `packages/cyd-layout-schema/src/types.ts` (pindah dari `apps/dashboard/lib/cyd-layout/types.ts`, + tambahan)
- Create: `packages/cyd-layout-schema/src/validate.ts` (pindah dari `apps/dashboard/lib/cyd-layout/build-config.ts`)
- Create: `packages/cyd-layout-schema/src/index.ts`
- Create: `packages/cyd-layout-schema/src/validate.test.ts` (pindah dari `apps/dashboard/lib/cyd-layout/__tests__/build-config.test.ts` + test baru)
- Modify: `apps/dashboard/lib/cyd-layout/types.ts` → re-export tipis
- Modify: `apps/dashboard/lib/cyd-layout/build-config.ts` → re-export tipis
- Modify: `apps/dashboard/package.json` — tambah `"@3pb/cyd-layout-schema": "workspace:*"`

**Interfaces:**
- Consumes: (tak ada, package baru mandiri)
- Produces: `FieldId`, `FieldEntry`, `FieldRow`, `LayoutCellPrinterOut`, `LayoutCellLabelOut`, `LayoutCellOut`, `LayoutPageOut`, `LayoutConfigOut`, `LAYOUT_LIMITS`, `validateLayoutConfig(input: unknown): { valid: true; config: LayoutConfigOut } | { valid: false; error: string }`, `validateFieldRows(rows: unknown, maxRows: number, context: string): string | null` — semua diekspor dari `@3pb/cyd-layout-schema`. Task 8 (layout SaaS) dan Task 13 (editor UI) konsumsi ini.

- [ ] **Step 1: Scaffold package**

```json
// packages/cyd-layout-schema/package.json
{
  "name": "@3pb/cyd-layout-schema",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^1.6.1"
  }
}
```

```json
// packages/cyd-layout-schema/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

```typescript
// packages/cyd-layout-schema/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', globals: true } })
```

- [ ] **Step 2: Pindah `types.ts`, tambah batas panjang string**

```typescript
// packages/cyd-layout-schema/src/types.ts
export type FieldId = 'name' | 'type' | 'state' | 'progress' | 'progressBar' | 'timeLeft' | 'eta' | 'filename' | 'error'

export type FieldEntry = FieldId | { id: FieldId; label?: string }
export type FieldRow = FieldEntry[]

export interface LayoutCellPrinterOut {
  printer: string
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
  fields?: FieldRow[]
}

export interface LayoutCellLabelOut {
  type: 'label'
  text: string
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
}

export type LayoutCellOut = LayoutCellPrinterOut | LayoutCellLabelOut

export interface LayoutPageOut {
  id: string
  grid: { cols: number; rows: number; rowWeights?: number[] }
  fields: FieldRow[]
  durationSec: number
  cells: LayoutCellOut[]
}

export interface LayoutConfigOut {
  schemaVersion: 1
  pages: LayoutPageOut[]
}

// Batas validasi — cocok MAX_* di firmware layout_types.h
// (~/Documents/Project/3pb-monitoring-display/apps/internal/src/layout/layout_types.h)
export const LAYOUT_LIMITS = {
  maxPages: 8,
  maxCellsPerPage: 24,
  maxGridRows: 8,
  maxFieldsPerRow: 3,
  maxRowsPerFieldsPageDefault: 8,
  maxRowsPerFieldsCellOverride: 3,
  // Batas panjang string — cocok buffer firmware char[N] (kapasitas = N-1 sebelum null-terminator).
  // BARU: gap ini belum ada sebelumnya di apps/dashboard, ditambah di sini (dipakai KEDUA app).
  maxPrinterIdLength: 23,
  maxLabelLength: 15,
  maxLabelTextLength: 31,
  maxPageIdLength: 15,
} as const
```

- [ ] **Step 3: Pindah `build-config.ts` → `validate.ts`, tambah cek panjang string**

Ambil isi `apps/dashboard/lib/cyd-layout/build-config.ts` verbatim ke `packages/cyd-layout-schema/src/validate.ts`, ganti import `./types` (sama, path relatif tetap benar), lalu tambahkan pengecekan panjang string di 3 titik:

Di `validatePage`, setelah baris `if (typeof page.id !== 'string' || !page.id) return ...`:
```typescript
if ((page.id as string).length > LAYOUT_LIMITS.maxPageIdLength) {
  return `pages[${index}].id melebihi batas ${LAYOUT_LIMITS.maxPageIdLength} karakter`
}
```

Di loop cell, setelah bagian `if ('type' in cell && cell.type === 'label')`, di cabang label tambahkan cek `labelText`:
```typescript
if (typeof cell.text !== 'string') return `pages[${index}].cells[${i}] label wajib punya text string`
if (cell.text.length > LAYOUT_LIMITS.maxLabelTextLength) {
  return `pages[${index}].cells[${i}] text melebihi batas ${LAYOUT_LIMITS.maxLabelTextLength} karakter`
}
```

Di cabang printer-cell, setelah cek `printerCell.printer` non-kosong:
```typescript
if (printerCell.printer.length > LAYOUT_LIMITS.maxPrinterIdLength) {
  return `pages[${index}].cells[${i}] printer id melebihi batas ${LAYOUT_LIMITS.maxPrinterIdLength} karakter`
}
```

Di `FieldEntry` yang berbentuk object (`{ id: FieldId; label?: string }`) dalam `validateFieldRows`, tambah cek panjang `label` kalau ada — sisipkan di dalam loop `for (let i = 0; i < rows.length; i++)`, setelah cek `Array.isArray(rows[i])`:
```typescript
for (const entry of rows[i] as unknown[]) {
  if (typeof entry === 'object' && entry !== null && 'label' in entry) {
    const label = (entry as { label?: unknown }).label
    if (typeof label === 'string' && label.length > LAYOUT_LIMITS.maxLabelLength) {
      return `${context}[${i}] label melebihi batas ${LAYOUT_LIMITS.maxLabelLength} karakter`
    }
  }
}
```

- [ ] **Step 4: `index.ts` barrel export**

```typescript
// packages/cyd-layout-schema/src/index.ts
export * from './types'
export { validateLayoutConfig, validateFieldRows } from './validate'
```

- [ ] **Step 5: Pindah test existing + tambah test panjang string baru**

Copy isi `apps/dashboard/lib/cyd-layout/__tests__/build-config.test.ts` verbatim ke `packages/cyd-layout-schema/src/validate.test.ts` (ganti import path ke `./validate` dan `./types`), lalu tambahkan:

```typescript
describe('validateLayoutConfig — batas panjang string (BARU)', () => {
  it('menolak page.id > 15 karakter', () => {
    const config = {
      schemaVersion: 1,
      pages: [{
        id: 'a'.repeat(16),
        grid: { cols: 2, rows: 2 },
        fields: [],
        durationSec: 5,
        cells: [],
      }],
    }
    const result = validateLayoutConfig(config)
    expect(result.valid).toBe(false)
  })

  it('menolak printer id (shortCode) > 23 karakter', () => {
    const config = {
      schemaVersion: 1,
      pages: [{
        id: 'p1',
        grid: { cols: 2, rows: 2 },
        fields: [],
        durationSec: 5,
        cells: [{ printer: 'x'.repeat(24), col: 0, row: 0 }],
      }],
    }
    const result = validateLayoutConfig(config)
    expect(result.valid).toBe(false)
  })

  it('menolak label text > 31 karakter', () => {
    const config = {
      schemaVersion: 1,
      pages: [{
        id: 'p1',
        grid: { cols: 2, rows: 2 },
        fields: [],
        durationSec: 5,
        cells: [{ type: 'label' as const, text: 'y'.repeat(32), col: 0, row: 0 }],
      }],
    }
    const result = validateLayoutConfig(config)
    expect(result.valid).toBe(false)
  })

  it('menerima string persis di batas (23/15/31 karakter)', () => {
    const config = {
      schemaVersion: 1,
      pages: [{
        id: 'a'.repeat(15),
        grid: { cols: 2, rows: 2 },
        fields: [],
        durationSec: 5,
        cells: [{ printer: 'x'.repeat(23), col: 0, row: 0 }],
      }],
    }
    const result = validateLayoutConfig(config)
    expect(result.valid).toBe(true)
  })
})
```

- [ ] **Step 6: Jalankan test package baru, pastikan semuanya lolos**

Run: `cd packages/cyd-layout-schema && npx vitest run`
Expected: semua test existing (dipindah) + 4 test baru PASS.

- [ ] **Step 7: Refactor `apps/dashboard` jadi re-export tipis**

```typescript
// apps/dashboard/lib/cyd-layout/types.ts (isi baru, seluruhnya)
export * from '@3pb/cyd-layout-schema'
```

```typescript
// apps/dashboard/lib/cyd-layout/build-config.ts (isi baru, seluruhnya)
export { validateLayoutConfig, validateFieldRows } from '@3pb/cyd-layout-schema'
```

Tambah ke `apps/dashboard/package.json` di blok `dependencies`:
```json
"@3pb/cyd-layout-schema": "workspace:*",
```

- [ ] **Step 8: `pnpm install` di root, lalu jalankan test dashboard existing — HARUS tetap hijau persis**

Run: `pnpm install && cd apps/dashboard && npx vitest run lib/cyd-layout/__tests__/build-config.test.ts`
Expected: PASS, jumlah test SAMA seperti sebelum refactor (regresi perilaku = gagal, bukan cuma error import).

- [ ] **Step 9: Jalankan full test suite dashboard buat mastiin tak ada yang lain kebawa rusak**

Run: `cd apps/dashboard && npx vitest run`
Expected: semua PASS (jumlah sama seperti baseline sebelum task ini).

- [ ] **Step 10: Commit**

```bash
git add packages/cyd-layout-schema apps/dashboard/lib/cyd-layout/types.ts apps/dashboard/lib/cyd-layout/build-config.ts apps/dashboard/package.json pnpm-lock.yaml
git commit -m "feat: ekstrak packages/cyd-layout-schema dari apps/dashboard, tambah validasi panjang string"
```

---

### Task 3: Prisma schema `apps/saas` — Device, CydLayout, AgentToken

**Files:**
- Modify: `apps/saas/prisma/schema.prisma`

**Interfaces:**
- Produces: model `Device { id, shortCode, userId, label, printerType, createdAt, updatedAt }`, `CydLayout { userId, config, updatedAt }`, `AgentToken { id, userId, tokenHash, createdAt, revokedAt, lastUsedAt }`, field `Entitlement.printerSlots: Int?`. Task 4-10 semua bergantung pada model ini persis seperti ini.

- [ ] **Step 1: Edit schema — tambah 3 model baru + field Entitlement + relasi balik User**

Di `apps/saas/prisma/schema.prisma`, ubah `model User` (baris 9-22) — tambah 3 field relasi:
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
  payments      Payment[]
  devices       Device[]
  cydLayout     CydLayout?
  agentTokens   AgentToken[]
  createdAt     DateTime     @default(now())
}
```

Ubah `model Entitlement` (baris 58-70) — tambah 1 field nullable:
```prisma
model Entitlement {
  id                  String    @id @default(cuid())
  userId              String    @unique
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  lifetimeOwned       Boolean   @default(false)
  lifetimePurchasedAt DateTime?
  subStatus           String    @default("NONE")
  subStartedAt        DateTime?
  subExpiresAt        DateTime?
  firstCloudMonthUsed Boolean   @default(false)
  printerSlots        Int?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```

Tambahkan 3 model baru di akhir file (setelah `model Payment`):
```prisma
model Device {
  id          String   @id @default(cuid())
  shortCode   String   @unique
  userId      String
  label       String
  printerType String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model CydLayout {
  userId    String   @id
  config    Json
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AgentToken {
  id         String    @id @default(cuid())
  userId     String
  tokenHash  String    @unique
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?
  lastUsedAt DateTime?
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 2: Validasi schema**

Run: `cd apps/saas && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` (kalau ada error relasi balik User yang kurang, akan muncul di sini).

- [ ] **Step 3: Push ke DB dev**

Run: `cd apps/saas && npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` — 3 tabel baru + kolom `printerSlots` dibuat aditif, TANPA data loss (semua kolom baru nullable/punya default).

- [ ] **Step 4: Generate Prisma Client**

Run: `cd apps/saas && npx prisma generate`
Expected: sukses. **PENTING (Global Constraint):** kalau nanti di sesi yang sama ada build `apps/dashboard`, regenerate client dashboard SETELAHNYA (`cd apps/dashboard && npx prisma generate`) karena berbagi entri pnpm-store.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/prisma/schema.prisma
git commit -m "feat(saas): schema Device, CydLayout, AgentToken + Entitlement.printerSlots"
```

---

### Task 4: `shortCode` generator (TDD)

**Files:**
- Create: `apps/saas/lib/id/short-code.ts`
- Test: `apps/saas/lib/id/short-code.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db` (cek `@unique` collision).
- Produces: `async function generateUniqueShortCode(): Promise<string>` — dipakai Task 6 (`createDevice`).

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/saas/lib/id/short-code.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { device: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { generateUniqueShortCode, BASE36_ALPHABET } from "./short-code";

beforeEach(() => vi.clearAllMocks());

describe("generateUniqueShortCode", () => {
  it("hasilnya 10 karakter, semua dari alfabet base36 lowercase", () => {
    (prisma.device.findUnique as any).mockResolvedValue(null);
    return generateUniqueShortCode().then((code) => {
      expect(code).toHaveLength(10);
      expect([...code].every((c) => BASE36_ALPHABET.includes(c))).toBe(true);
    });
  });

  it("retry kalau collision (findUnique nemu row), berhenti pas dapat yang unik", async () => {
    (prisma.device.findUnique as any)
      .mockResolvedValueOnce({ id: "existing-1" }) // collision pertama
      .mockResolvedValueOnce(null); // kedua unik
    const code = await generateUniqueShortCode();
    expect(code).toHaveLength(10);
    expect(prisma.device.findUnique).toHaveBeenCalledTimes(2);
  });

  it("nyerah setelah 3x collision berturut-turut (throw, bukan infinite loop)", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "existing" });
    await expect(generateUniqueShortCode()).rejects.toThrow(/gagal generate shortCode/);
    expect(prisma.device.findUnique).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run lib/id/short-code.test.ts`
Expected: FAIL — `./short-code` belum ada.

- [ ] **Step 3: Implementasi**

```typescript
// apps/saas/lib/id/short-code.ts
import crypto from "crypto";
import { prisma } from "@/lib/db";

export const BASE36_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const LENGTH = 10;
const MAX_ATTEMPTS = 3;

function randomShortCode(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    out += BASE36_ALPHABET[crypto.randomInt(0, BASE36_ALPHABET.length)];
  }
  return out;
}

/** Generate shortCode unik global (dicek terhadap Device.shortCode), retry maks 3x kalau collision. */
export async function generateUniqueShortCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomShortCode();
    const existing = await prisma.device.findUnique({ where: { shortCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("gagal generate shortCode unik setelah 3 percobaan");
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run lib/id/short-code.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/id/short-code.ts apps/saas/lib/id/short-code.test.ts
git commit -m "feat(saas): generator shortCode unik buat Device (buffer firmware char[24])"
```

---

### Task 5: `getConfigInt` + registrasi `printer.defaultSlots`

**Files:**
- Modify: `apps/saas/lib/config.ts`
- Test: `apps/saas/lib/config.test.ts` (kalau belum ada, buat baru; kalau sudah ada, tambah describe block)

**Interfaces:**
- Consumes: `getConfig` (existing, dari file yang sama).
- Produces: `async function getConfigInt(key: string, fallback: number): Promise<number>` — dipakai Task 6 (`createDevice` resolusi limit).

- [ ] **Step 1: Cek apakah test file sudah ada**

Run: `ls apps/saas/lib/config.test.ts 2>/dev/null || echo "belum ada"`

- [ ] **Step 2: Tulis failing test**

Tambahkan (atau buat baru) di `apps/saas/lib/config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { config: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { getConfigInt, DEFAULT_CONFIG } from "./config";

beforeEach(() => vi.clearAllMocks());

describe("getConfigInt", () => {
  it("balikin fallback kalau Config belum ada baris & DEFAULT_CONFIG absen", async () => {
    (prisma.config.findUnique as any).mockResolvedValue(null);
    const n = await getConfigInt("key.belum.ada", 7);
    expect(n).toBe(7);
  });

  it("parse nilai integer valid dari DB", async () => {
    (prisma.config.findUnique as any).mockResolvedValue({ key: "printer.defaultSlots", value: "3" });
    const n = await getConfigInt("printer.defaultSlots", 1);
    expect(n).toBe(3);
  });

  it("balikin fallback kalau nilai di DB bukan integer valid (bukan NaN)", async () => {
    (prisma.config.findUnique as any).mockResolvedValue({ key: "printer.defaultSlots", value: "abc" });
    const n = await getConfigInt("printer.defaultSlots", 1);
    expect(n).toBe(1);
  });

  it("balikin fallback kalau nilai < 1", async () => {
    (prisma.config.findUnique as any).mockResolvedValue({ key: "printer.defaultSlots", value: "0" });
    const n = await getConfigInt("printer.defaultSlots", 1);
    expect(n).toBe(1);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("punya key printer.defaultSlots terdaftar (wajib biar bisa di-PUT dari /admin)", () => {
    expect(DEFAULT_CONFIG).toHaveProperty("printer.defaultSlots");
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run lib/config.test.ts`
Expected: FAIL — `getConfigInt` belum diekspor, `printer.defaultSlots` belum di `DEFAULT_CONFIG`.

- [ ] **Step 4: Implementasi — modifikasi `apps/saas/lib/config.ts`**

Tambah key baru ke `DEFAULT_CONFIG` (baris 4-13):
```typescript
export const DEFAULT_CONFIG: Record<string, string> = {
  "price.beli": "",
  "price.sub.owner": "",
  "price.sub.standalone": "",
  "price.discountBuffer": "1000",
  "copy.hero.headline": "Hitung harga jual produk 3D print-mu dalam hitungan detik",
  "copy.refund": "Refund 7 hari sejak pembelian — hubungi kami via WhatsApp/email.",
  "feature.pos.status": "segera-hadir",
  "qris.static": "",
  "printer.defaultSlots": "1",
};
```

Tambah fungsi baru di akhir file:
```typescript
/** Baca Config sebagai integer; fallback kalau absen/bukan angka valid/< 1. */
export async function getConfigInt(key: string, fallback: number): Promise<number> {
  const raw = await getConfig(key);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}
```

- [ ] **Step 5: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run lib/config.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Jalankan full test suite config-related buat mastiin tak ada regresi**

Run: `cd apps/saas && npx vitest run lib/config.test.ts app/api/admin/config`
Expected: semua PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/lib/config.ts apps/saas/lib/config.test.ts
git commit -m "feat(saas): getConfigInt + daftarkan printer.defaultSlots ke DEFAULT_CONFIG"
```

---

### Task 6: `lib/devices/service.ts` — CRUD device + enforcement slot (row-lock)

**Files:**
- Create: `apps/saas/lib/devices/service.ts`
- Create: `apps/saas/lib/devices/errors.ts`
- Test: `apps/saas/lib/devices/service.test.ts` (mocked, unit)
- Test: `apps/saas/lib/devices/service.integration.test.ts` (Postgres asli — race condition, lihat Step khusus)

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`, `generateUniqueShortCode` dari `@/lib/id/short-code`, `getConfigInt` dari `@/lib/config`.
- Produces: `PRINTER_TYPES = ["bambu", "moonraker"] as const`, `type PrinterType`, `async function listDevices(userId: string)`, `async function createDevice(userId: string, input: { label: string; printerType: string }): Promise<Device>`, `async function updateDevice(userId: string, id: string, input: { label?: string; printerType?: string }): Promise<Device>`, `async function deleteDevice(userId: string, id: string): Promise<void>`, `class SlotLimitExceeded extends Error`, `class InvalidPrinterType extends Error`, `class DeviceNotFound extends Error`. Task 7 (API routes) konsumsi ini. Task 8 (`CydLayout` service) konsumsi `deleteDevice`'s cleanup-transaction pattern secara konsisten (referensi, bukan import langsung).

- [ ] **Step 1: Tulis error class**

```typescript
// apps/saas/lib/devices/errors.ts
export class SlotLimitExceeded extends Error {
  status = 409;
  constructor(public limit: number) {
    super(`Batas ${limit} printer sudah tercapai`);
    this.name = "SlotLimitExceeded";
  }
}

export class InvalidPrinterType extends Error {
  status = 400;
  constructor(public value: string) {
    super(`printerType tidak valid: ${value}`);
    this.name = "InvalidPrinterType";
  }
}

export class DeviceNotFound extends Error {
  status = 404;
  constructor() {
    super("Device tidak ditemukan");
    this.name = "DeviceNotFound";
  }
}
```

- [ ] **Step 2: Tulis failing test (unit, mocked)**

```typescript
// apps/saas/lib/devices/service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    device: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    cydLayout: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/id/short-code", () => ({ generateUniqueShortCode: vi.fn() }));
vi.mock("@/lib/config", () => ({ getConfigInt: vi.fn() }));

import { prisma } from "@/lib/db";
import { generateUniqueShortCode } from "@/lib/id/short-code";
import { getConfigInt } from "@/lib/config";
import { listDevices, createDevice, updateDevice, deleteDevice, PRINTER_TYPES } from "./service";
import { SlotLimitExceeded, InvalidPrinterType, DeviceNotFound } from "./errors";

beforeEach(() => vi.clearAllMocks());

describe("listDevices", () => {
  it("balikin device milik user", async () => {
    (prisma.device.findMany as any).mockResolvedValue([{ id: "d1", userId: "u1" }]);
    const result = await listDevices("u1");
    expect(result).toHaveLength(1);
    expect(prisma.device.findMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});

describe("createDevice", () => {
  function mockTx(count: number, limit: number | null) {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        entitlement: { findUnique: vi.fn().mockResolvedValue({ printerSlots: limit }) },
        device: {
          count: vi.fn().mockResolvedValue(count),
          create: vi.fn().mockResolvedValue({ id: "new-d", userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567" }),
        },
      };
      return fn(tx);
    });
  }

  it("tolak printerType tak dikenal", async () => {
    await expect(createDevice("u1", { label: "X", printerType: "prusa" })).rejects.toThrow(InvalidPrinterType);
  });

  it("berhasil create kalau count < limit (limit dari Entitlement)", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    mockTx(0, 2);
    const device = await createDevice("u1", { label: "Printer A", printerType: "bambu" });
    expect(device.id).toBe("new-d");
  });

  it("tolak kalau count >= limit eksplisit (Entitlement.printerSlots set)", async () => {
    mockTx(2, 2);
    await expect(createDevice("u1", { label: "Printer A", printerType: "bambu" })).rejects.toThrow(SlotLimitExceeded);
  });

  it("fallback ke Config kalau Entitlement.printerSlots null", async () => {
    (getConfigInt as any).mockResolvedValue(1);
    mockTx(1, null); // limit null di Entitlement -> harus fallback ke Config (1) -> count 1 >= 1 -> reject
    await expect(createDevice("u1", { label: "Printer A", printerType: "bambu" })).rejects.toThrow(SlotLimitExceeded);
    expect(getConfigInt).toHaveBeenCalledWith("printer.defaultSlots", 1);
  });
});

describe("updateDevice", () => {
  it("throw DeviceNotFound kalau device bukan milik user / tak ada", async () => {
    (prisma.device.findUnique as any).mockResolvedValue(null);
    await expect(updateDevice("u1", "d-x", { label: "Baru" })).rejects.toThrow(DeviceNotFound);
  });

  it("tolak printerType tak dikenal saat update", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    await expect(updateDevice("u1", "d1", { printerType: "prusa" })).rejects.toThrow(InvalidPrinterType);
  });
});

describe("deleteDevice", () => {
  it("hapus device + bersihkan cell layout yang mereferensikan shortCode-nya, dalam 1 transaksi", async () => {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const tx = {
        device: {
          findUnique: vi.fn().mockResolvedValue({ id: "d1", userId: "u1", shortCode: "abc1234567" }),
          delete: vi.fn().mockResolvedValue({}),
        },
        cydLayout: {
          findUnique: vi.fn().mockResolvedValue({
            userId: "u1",
            config: { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "abc1234567", col: 0, row: 0 }] }] },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    await deleteDevice("u1", "d1");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("throw DeviceNotFound kalau device bukan milik user", async () => {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const tx = { device: { findUnique: vi.fn().mockResolvedValue(null) } };
      return fn(tx);
    });
    await expect(deleteDevice("u1", "d-x")).rejects.toThrow(DeviceNotFound);
  });
});

describe("PRINTER_TYPES", () => {
  it("cuma bambu & moonraker", () => {
    expect(PRINTER_TYPES).toEqual(["bambu", "moonraker"]);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run lib/devices/service.test.ts`
Expected: FAIL — `./service` belum ada.

- [ ] **Step 4: Implementasi service**

```typescript
// apps/saas/lib/devices/service.ts
import { prisma } from "@/lib/db";
import { generateUniqueShortCode } from "@/lib/id/short-code";
import { getConfigInt } from "@/lib/config";
import { SlotLimitExceeded, InvalidPrinterType, DeviceNotFound } from "./errors";
import type { Device } from "@prisma/client";

export const PRINTER_TYPES = ["bambu", "moonraker"] as const;
export type PrinterType = (typeof PRINTER_TYPES)[number];

function assertValidPrinterType(value: string): asserts value is PrinterType {
  if (!(PRINTER_TYPES as readonly string[]).includes(value)) {
    throw new InvalidPrinterType(value);
  }
}

export async function listDevices(userId: string): Promise<Device[]> {
  return prisma.device.findMany({ where: { userId } });
}

/**
 * Row-lock (FOR UPDATE) pada baris Entitlement user sebelum COUNT+create — mencegah 2 request
 * paralel sama-sama lolos di slot terakhir. Transaksi interaktif Prisma default READ COMMITTED,
 * TIDAK cukup sendirian (2 transaksi paralel sama-sama lihat COUNT lama) — lock eksplisit yang
 * benar-benar menutup race-nya (lihat spec §"Race condition").
 */
export async function createDevice(
  userId: string,
  input: { label: string; printerType: string }
): Promise<Device> {
  assertValidPrinterType(input.printerType);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Entitlement" WHERE "userId" = ${userId} FOR UPDATE`;
    const entitlement = await tx.entitlement.findUnique({ where: { userId } });
    const limit = entitlement?.printerSlots ?? (await getConfigInt("printer.defaultSlots", 1));
    const count = await tx.device.count({ where: { userId } });
    if (count >= limit) throw new SlotLimitExceeded(limit);

    const shortCode = await generateUniqueShortCode();
    return tx.device.create({
      data: { userId, label: input.label, printerType: input.printerType, shortCode },
    });
  });
}

export async function updateDevice(
  userId: string,
  id: string,
  input: { label?: string; printerType?: string }
): Promise<Device> {
  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new DeviceNotFound();
  if (input.printerType !== undefined) assertValidPrinterType(input.printerType);
  return prisma.device.update({
    where: { id },
    data: { ...(input.label !== undefined && { label: input.label }), ...(input.printerType !== undefined && { printerType: input.printerType }) },
  });
}

/** Hapus device + drop cell layout yang mereferensikan shortCode-nya, dalam 1 transaksi (cegah race vs PUT /api/cyd-layout). */
export async function deleteDevice(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const device = await tx.device.findUnique({ where: { id } });
    if (!device || device.userId !== userId) throw new DeviceNotFound();

    await tx.device.delete({ where: { id } });

    const layout = await tx.cydLayout.findUnique({ where: { userId } });
    if (!layout) return;
    const config = layout.config as { schemaVersion: 1; pages: Array<{ cells: Array<Record<string, unknown>> }> };
    const cleaned = {
      ...config,
      pages: config.pages.map((p) => ({
        ...p,
        cells: p.cells.filter((c) => (c as { printer?: string }).printer !== device.shortCode),
      })),
    };
    await tx.cydLayout.update({ where: { userId }, data: { config: cleaned } });
  });
}
```

- [ ] **Step 5: Jalankan test unit, pastikan lolos**

Run: `cd apps/saas && npx vitest run lib/devices/service.test.ts`
Expected: PASS (semua describe block).

- [ ] **Step 6: Tulis test integrasi race-condition (Postgres ASLI — WAJIB, mock tak bisa buktikan ini)**

```typescript
// apps/saas/lib/devices/service.integration.test.ts
// Test ini butuh Postgres nyala & DATABASE_URL ke-set (dev DB, BUKAN produksi) — di-skip
// otomatis kalau DATABASE_URL absen, supaya `pnpm test` biasa (semua mock) tak ikut kepengaruh.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("createDevice — race condition (Postgres asli)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let userId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const user = await prisma.user.create({ data: { email: `race-test-${Date.now()}@test.local` } });
    userId = user.id;
    await prisma.entitlement.create({ data: { userId, printerSlots: 1 } });
  });

  afterAll(async () => {
    await prisma.device.deleteMany({ where: { userId } });
    await prisma.entitlement.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("2 create paralel di slot terakhir (limit=1) — cuma 1 yang boleh sukses", async () => {
    const { createDevice } = await import("./service");
    const { SlotLimitExceeded } = await import("./errors");

    const results = await Promise.allSettled([
      createDevice(userId, { label: "A", printerType: "bambu" }),
      createDevice(userId, { label: "B", printerType: "bambu" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotLimitExceeded);

    const finalCount = await prisma.device.count({ where: { userId } });
    expect(finalCount).toBe(1);
  });
});
```

- [ ] **Step 7: Jalankan test integrasi terhadap DB dev lokal**

Pastikan `DATABASE_URL` di environment mengarah ke Postgres dev (BUKAN produksi — pola sama seperti `apps/dashboard` yang punya `shopee_dashboard_dev` terpisah; kalau `apps/saas` belum punya DB dev lokal, buat database baru khusus test, mis. `slizebiz_test`, di Postgres homelab yang sama, sebelum menjalankan ini).

Run: `cd apps/saas && DATABASE_URL="<connection-string-db-dev>" npx vitest run lib/devices/service.integration.test.ts`
Expected: PASS — `fulfilled` length 1, `rejected` length 1, `finalCount` 1. Kalau row-lock di Step 4 SALAH diimplementasi (mis. `FOR UPDATE` dihapus atau `$transaction` dipakai tanpa lock), test ini akan gagal dengan `finalCount` = 2 — itu bukti race masih ada.

- [ ] **Step 8: Commit**

```bash
git add apps/saas/lib/devices
git commit -m "feat(saas): device CRUD service + enforcement slot via row-lock (cegah race sungguhan)"
```

---

### Task 7: API routes `/api/devices`

**Files:**
- Create: `apps/saas/app/api/devices/route.ts`
- Create: `apps/saas/app/api/devices/[id]/route.ts`
- Test: `apps/saas/app/api/devices/route.test.ts`
- Test: `apps/saas/app/api/devices/[id]/route.test.ts`

**Interfaces:**
- Consumes: `auth` dari `@/lib/auth`, `getEntitlement`, `capabilities` dari `@/lib/entitlement`, `listDevices/createDevice/updateDevice/deleteDevice` dari `@/lib/devices/service`, error classes dari `@/lib/devices/errors`.
- Produces: HTTP `GET/POST /api/devices`, `PATCH/DELETE /api/devices/[id]`. Task 11 (UI device list) konsumsi endpoint ini.

- [ ] **Step 1: Tulis failing test buat `route.ts` (collection)**

```typescript
// apps/saas/app/api/devices/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ listDevices: vi.fn(), createDevice: vi.fn() }));

import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { listDevices, createDevice } from "@/lib/devices/service";
import { SlotLimitExceeded } from "@/lib/devices/errors";
import { GET, POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/devices", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("200 + list device kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listDevices as any).mockResolvedValue([{ id: "d1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/devices", () => {
  function req(body: unknown) {
    return new Request("http://x/api/devices", { method: "POST", body: JSON.stringify(body) });
  }

  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(401);
  });

  it("403 kalau bukan paidCore", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: false, cloud: false });
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(403);
  });

  it("409 + pesan upsell kalau SlotLimitExceeded", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    (createDevice as any).mockRejectedValue(new SlotLimitExceeded(1));
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(409);
  });

  it("200 + device baru kalau lolos semua cek", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    (createDevice as any).mockResolvedValue({ id: "new-d" });
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run app/api/devices/route.test.ts`
Expected: FAIL — `./route` belum ada.

- [ ] **Step 3: Implementasi `route.ts`**

```typescript
// apps/saas/app/api/devices/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { listDevices, createDevice } from "@/lib/devices/service";
import { SlotLimitExceeded, InvalidPrinterType } from "@/lib/devices/errors";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const devices = await listDevices(userId);
  return NextResponse.json(devices);
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ent = await getEntitlement(userId);
  if (!capabilities(ent).paidCore) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; printerType?: unknown };
  if (typeof body.label !== "string" || !body.label.trim()) {
    return NextResponse.json({ error: "invalid_body", reason: "label wajib diisi" }, { status: 400 });
  }
  if (typeof body.printerType !== "string") {
    return NextResponse.json({ error: "invalid_body", reason: "printerType wajib diisi" }, { status: 400 });
  }

  try {
    const device = await createDevice(userId, { label: body.label, printerType: body.printerType });
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof SlotLimitExceeded) {
      return NextResponse.json({ error: "slot_limit_exceeded", limit: e.limit }, { status: 409 });
    }
    if (e instanceof InvalidPrinterType) {
      return NextResponse.json({ error: "invalid_printer_type" }, { status: 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run app/api/devices/route.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Tulis failing test buat `[id]/route.ts`**

```typescript
// apps/saas/app/api/devices/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ updateDevice: vi.fn(), deleteDevice: vi.fn() }));

import { auth } from "@/lib/auth";
import { updateDevice, deleteDevice } from "@/lib/devices/service";
import { DeviceNotFound, InvalidPrinterType } from "@/lib/devices/errors";
import { PATCH, DELETE } from "./route";

beforeEach(() => vi.clearAllMocks());

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/devices/[id]", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: "{}" }), ctx("d1"));
    expect(res.status).toBe(401);
  });

  it("404 kalau device bukan milik user", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (updateDevice as any).mockRejectedValue(new DeviceNotFound());
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ label: "Baru" }) }), ctx("d1"));
    expect(res.status).toBe(404);
  });

  it("400 kalau printerType invalid", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (updateDevice as any).mockRejectedValue(new InvalidPrinterType("x"));
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ printerType: "x" }) }), ctx("d1"));
    expect(res.status).toBe(400);
  });

  it("200 kalau sukses", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (updateDevice as any).mockResolvedValue({ id: "d1", label: "Baru" });
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ label: "Baru" }) }), ctx("d1"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/devices/[id]", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("d1"));
    expect(res.status).toBe(401);
  });

  it("204 kalau sukses", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (deleteDevice as any).mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("d1"));
    expect(res.status).toBe(204);
  });

  it("404 kalau device bukan milik user", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (deleteDevice as any).mockRejectedValue(new DeviceNotFound());
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("d1"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run "app/api/devices/[id]/route.test.ts"`
Expected: FAIL.

- [ ] **Step 7: Implementasi `[id]/route.ts`**

```typescript
// apps/saas/app/api/devices/[id]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateDevice, deleteDevice } from "@/lib/devices/service";
import { DeviceNotFound, InvalidPrinterType } from "@/lib/devices/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { label?: unknown; printerType?: unknown };

  try {
    const device = await updateDevice(userId, id, {
      ...(typeof body.label === "string" && { label: body.label }),
      ...(typeof body.printerType === "string" && { printerType: body.printerType }),
    });
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof DeviceNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof InvalidPrinterType) return NextResponse.json({ error: "invalid_printer_type" }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;

  try {
    await deleteDevice(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof DeviceNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 8: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run "app/api/devices/[id]/route.test.ts"`
Expected: PASS (7/7).

- [ ] **Step 9: Commit**

```bash
git add apps/saas/app/api/devices
git commit -m "feat(saas): API routes /api/devices CRUD"
```

---

### Task 8: `CydLayout` service + API `/api/cyd-layout`

**Files:**
- Create: `apps/saas/lib/cyd-layout/service.ts`
- Create: `apps/saas/app/api/cyd-layout/route.ts`
- Test: `apps/saas/lib/cyd-layout/service.test.ts`
- Test: `apps/saas/app/api/cyd-layout/route.test.ts`

**Interfaces:**
- Consumes: `validateLayoutConfig` dari `@3pb/cyd-layout-schema`, `prisma` dari `@/lib/db`, `auth`/`getEntitlement`/`capabilities` (pola sama Task 7).
- Produces: `function defaultSaasLayout(): LayoutConfigOut`, `async function getLayout(userId: string): Promise<LayoutConfigOut>` (balikin default kalau belum ada row), `async function saveLayout(userId: string, config: unknown, ownedShortCodes: string[]): Promise<LayoutConfigOut>` (throw `InvalidLayoutConfig` kalau validasi gagal atau referensi shortCode bukan milik user). Task 10 konsumsi `getLayout` juga (return `null` kalau row absen, versi berbeda buat Agent — lihat Task 10).

- [ ] **Step 1: Tulis failing test service**

```typescript
// apps/saas/lib/cyd-layout/service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    cydLayout: { findUnique: vi.fn(), upsert: vi.fn() },
    device: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getLayout, saveLayout, defaultSaasLayout, InvalidLayoutConfig } from "./service";

beforeEach(() => vi.clearAllMocks());

describe("defaultSaasLayout", () => {
  it("grid kecil (bukan copy 10x8 punya rak internal)", () => {
    const d = defaultSaasLayout();
    expect(d.pages).toHaveLength(1);
    expect(d.pages[0].grid.cols).toBeLessThanOrEqual(3);
    expect(d.pages[0].grid.rows).toBeLessThanOrEqual(3);
    expect(d.pages[0].cells).toHaveLength(0);
  });
});

describe("getLayout", () => {
  it("balikin default eksplisit kalau belum pernah disimpan", async () => {
    (prisma.cydLayout.findUnique as any).mockResolvedValue(null);
    const layout = await getLayout("u1");
    expect(layout.pages).toHaveLength(1);
  });

  it("balikin config tersimpan kalau ada", async () => {
    const saved = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] };
    (prisma.cydLayout.findUnique as any).mockResolvedValue({ userId: "u1", config: saved });
    const layout = await getLayout("u1");
    expect(layout).toEqual(saved);
  });
});

describe("saveLayout", () => {
  it("tolak config yang gagal validateLayoutConfig", async () => {
    await expect(saveLayout("u1", { bukan: "config valid" }, [])).rejects.toThrow(InvalidLayoutConfig);
  });

  it("tolak referensi shortCode yang bukan milik user", async () => {
    const config = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "bukan-punya-user", col: 0, row: 0 }] }] };
    await expect(saveLayout("u1", config, ["punya-user-1"])).rejects.toThrow(InvalidLayoutConfig);
  });

  it("simpan kalau valid & semua shortCode dikenal", async () => {
    const config = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "punya-user-1", col: 0, row: 0 }] }] };
    (prisma.cydLayout.upsert as any).mockResolvedValue({ userId: "u1", config });
    const result = await saveLayout("u1", config, ["punya-user-1"]);
    expect(result).toEqual(config);
    expect(prisma.cydLayout.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", config },
      update: { config },
    });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run lib/cyd-layout/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi service**

```typescript
// apps/saas/lib/cyd-layout/service.ts
import { prisma } from "@/lib/db";
import { validateLayoutConfig } from "@3pb/cyd-layout-schema";
import type { LayoutConfigOut } from "@3pb/cyd-layout-schema";

export class InvalidLayoutConfig extends Error {
  status = 400;
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidLayoutConfig";
  }
}

/** Default SaaS — grid kecil (2x2), sesuai skala customer 1-3 printer, BUKAN copy grid 10x8 rak internal dashboard. */
export function defaultSaasLayout(): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }],
  };
}

export async function getLayout(userId: string): Promise<LayoutConfigOut> {
  const row = await prisma.cydLayout.findUnique({ where: { userId } });
  if (!row) return defaultSaasLayout();
  return row.config as unknown as LayoutConfigOut;
}

/** null = belum ada layout tersimpan (dipakai Task 10 buat Agent, beda semantik dari getLayout di atas). */
export async function getLayoutOrNull(userId: string): Promise<LayoutConfigOut | null> {
  const row = await prisma.cydLayout.findUnique({ where: { userId } });
  return row ? (row.config as unknown as LayoutConfigOut) : null;
}

export async function saveLayout(userId: string, input: unknown, ownedShortCodes: string[]): Promise<LayoutConfigOut> {
  const result = validateLayoutConfig(input);
  if (!result.valid) throw new InvalidLayoutConfig(result.error);

  const owned = new Set(ownedShortCodes);
  for (const page of result.config.pages) {
    for (const cell of page.cells) {
      if (!("type" in cell) && !owned.has(cell.printer)) {
        throw new InvalidLayoutConfig(`printer "${cell.printer}" bukan milik user ini`);
      }
    }
  }

  await prisma.cydLayout.upsert({
    where: { userId },
    create: { userId, config: result.config },
    update: { config: result.config },
  });
  return result.config;
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run lib/cyd-layout/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Tulis failing test API route**

```typescript
// apps/saas/app/api/cyd-layout/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ listDevices: vi.fn() }));
vi.mock("@/lib/cyd-layout/service", () => ({ getLayout: vi.fn(), saveLayout: vi.fn(), InvalidLayoutConfig: class extends Error { status = 400 } }));

import { auth } from "@/lib/auth";
import { listDevices } from "@/lib/devices/service";
import { getLayout, saveLayout } from "@/lib/cyd-layout/service";
import { GET, PUT } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cyd-layout", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("200 + layout (default kalau belum pernah simpan)", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getLayout as any).mockResolvedValue({ schemaVersion: 1, pages: [] });
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/cyd-layout", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400 kalau saveLayout throw InvalidLayoutConfig", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listDevices as any).mockResolvedValue([]);
    const { InvalidLayoutConfig } = await import("@/lib/cyd-layout/service");
    (saveLayout as any).mockRejectedValue(new InvalidLayoutConfig("bad"));
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("200 kalau sukses", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listDevices as any).mockResolvedValue([{ shortCode: "abc1234567" }]);
    (saveLayout as any).mockResolvedValue({ schemaVersion: 1, pages: [] });
    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ schemaVersion: 1, pages: [] }) }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run app/api/cyd-layout/route.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implementasi route**

```typescript
// apps/saas/app/api/cyd-layout/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listDevices } from "@/lib/devices/service";
import { getLayout, saveLayout, InvalidLayoutConfig } from "@/lib/cyd-layout/service";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const layout = await getLayout(userId);
  return NextResponse.json(layout);
}

export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const devices = await listDevices(userId);
  const ownedShortCodes = devices.map((d) => d.shortCode);

  try {
    const saved = await saveLayout(userId, body, ownedShortCodes);
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof InvalidLayoutConfig) {
      return NextResponse.json({ error: "invalid_layout", reason: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 8: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run app/api/cyd-layout/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/saas/lib/cyd-layout apps/saas/app/api/cyd-layout
git commit -m "feat(saas): layout service + API /api/cyd-layout (get/put)"
```

---

### Task 9: `AgentToken` service + API `/api/agent-tokens`

**Files:**
- Create: `apps/saas/lib/agent-tokens/service.ts`
- Create: `apps/saas/app/api/agent-tokens/route.ts`
- Create: `apps/saas/app/api/agent-tokens/[id]/route.ts`
- Test: `apps/saas/lib/agent-tokens/service.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`.
- Produces: `async function generateToken(userId: string): Promise<{ id: string; rawToken: string }>`, `async function listTokens(userId: string)`, `async function revokeToken(userId: string, id: string): Promise<void>`, `async function resolveToken(rawToken: string): Promise<{ userId: string } | null>` (dipakai Task 10). Format token: `slz_<base64url(32 random bytes)>`.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/saas/lib/agent-tokens/service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    agentToken: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { generateToken, listTokens, revokeToken, resolveToken } from "./service";

beforeEach(() => vi.clearAllMocks());

describe("generateToken", () => {
  it("hasilnya diawali slz_, dan tokenHash yang disimpan BUKAN token mentah", async () => {
    (prisma.agentToken.create as any).mockImplementation(({ data }: any) => Promise.resolve({ id: "t1", ...data }));
    const { rawToken } = await generateToken("u1");
    expect(rawToken.startsWith("slz_")).toBe(true);
    const createCall = (prisma.agentToken.create as any).mock.calls[0][0];
    expect(createCall.data.tokenHash).not.toBe(rawToken);
    expect(createCall.data.tokenHash).toHaveLength(64); // hex SHA-256
  });
});

describe("listTokens", () => {
  it("tak pernah balikin tokenHash (cuma metadata)", async () => {
    (prisma.agentToken.findMany as any).mockResolvedValue([{ id: "t1", tokenHash: "secret", createdAt: new Date(), revokedAt: null, lastUsedAt: null }]);
    const list = await listTokens("u1");
    expect(list[0]).not.toHaveProperty("tokenHash");
  });
});

describe("revokeToken", () => {
  it("set revokedAt, bukan hard-delete", async () => {
    await revokeToken("u1", "t1");
    expect(prisma.agentToken.update).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("resolveToken", () => {
  it("null kalau token tak ketemu", async () => {
    (prisma.agentToken.findUnique as any).mockResolvedValue(null);
    expect(await resolveToken("slz_invalid")).toBeNull();
  });

  it("null kalau token sudah revoked", async () => {
    (prisma.agentToken.findUnique as any).mockResolvedValue({ userId: "u1", revokedAt: new Date() });
    expect(await resolveToken("slz_valid")).toBeNull();
  });

  it("balikin userId + update lastUsedAt kalau valid", async () => {
    (prisma.agentToken.findUnique as any).mockResolvedValue({ id: "t1", userId: "u1", revokedAt: null });
    const result = await resolveToken("slz_valid");
    expect(result).toEqual({ userId: "u1" });
    expect(prisma.agentToken.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { lastUsedAt: expect.any(Date) } });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run lib/agent-tokens/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```typescript
// apps/saas/lib/agent-tokens/service.ts
import crypto from "crypto";
import { prisma } from "@/lib/db";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function generateToken(userId: string): Promise<{ id: string; rawToken: string }> {
  const rawToken = `slz_${crypto.randomBytes(32).toString("base64url")}`;
  const row = await prisma.agentToken.create({
    data: { userId, tokenHash: hashToken(rawToken) },
  });
  return { id: row.id, rawToken };
}

export async function listTokens(userId: string) {
  const rows = await prisma.agentToken.findMany({ where: { userId } });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt }));
}

export async function revokeToken(userId: string, id: string): Promise<void> {
  await prisma.agentToken.update({ where: { id, userId }, data: { revokedAt: new Date() } });
}

/** Resolve token mentah -> userId. null kalau tak ketemu/revoked. Update lastUsedAt sekalian (best-effort). */
export async function resolveToken(rawToken: string): Promise<{ userId: string } | null> {
  const row = await prisma.agentToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.revokedAt) return null;
  await prisma.agentToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { userId: row.userId };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run lib/agent-tokens/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Tulis failing test buat kedua route (konsisten TDD dengan task lain)**

```typescript
// apps/saas/app/api/agent-tokens/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/agent-tokens/service", () => ({ generateToken: vi.fn(), listTokens: vi.fn() }));

import { auth } from "@/lib/auth";
import { generateToken, listTokens } from "@/lib/agent-tokens/service";
import { GET, POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent-tokens", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("200 + list token kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listTokens as any).mockResolvedValue([{ id: "t1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/agent-tokens", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("200 + token mentah kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (generateToken as any).mockResolvedValue({ id: "t1", rawToken: "slz_abc" });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("slz_abc");
  });
});
```

```typescript
// apps/saas/app/api/agent-tokens/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/agent-tokens/service", () => ({ revokeToken: vi.fn() }));

import { auth } from "@/lib/auth";
import { revokeToken } from "@/lib/agent-tokens/service";
import { DELETE } from "./route";

beforeEach(() => vi.clearAllMocks());

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/agent-tokens/[id]", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1"));
    expect(res.status).toBe(401);
  });

  it("204 + panggil revokeToken(userId, id) kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1"));
    expect(res.status).toBe(204);
    expect(revokeToken).toHaveBeenCalledWith("u1", "t1");
  });
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run app/api/agent-tokens/route.test.ts "app/api/agent-tokens/[id]/route.test.ts"`
Expected: FAIL — route belum ada.

- [ ] **Step 7: Implementasi kedua route**

```typescript
// apps/saas/app/api/agent-tokens/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateToken, listTokens } from "@/lib/agent-tokens/service";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(await listTokens(userId));
}

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id, rawToken } = await generateToken(userId);
  return NextResponse.json({ id, token: rawToken });
}
```

```typescript
// apps/saas/app/api/agent-tokens/[id]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeToken } from "@/lib/agent-tokens/service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  await revokeToken(userId, id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 8: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run app/api/agent-tokens/route.test.ts "app/api/agent-tokens/[id]/route.test.ts"`
Expected: PASS (4/4).

- [ ] **Step 9: Commit**

```bash
git add apps/saas/lib/agent-tokens apps/saas/app/api/agent-tokens
git commit -m "feat(saas): AgentToken service + API generate/list/revoke (TDD)"
```

---

### Task 10: `lib/agent-auth.ts` + API `/api/agent/*`

**Files:**
- Create: `apps/saas/lib/agent-auth.ts`
- Create: `apps/saas/app/api/agent/devices/route.ts`
- Create: `apps/saas/app/api/agent/layout/route.ts`
- Test: `apps/saas/lib/agent-auth.test.ts`
- Test: `apps/saas/app/api/agent/devices/route.test.ts`

**Interfaces:**
- Consumes: `resolveToken` dari `@/lib/agent-tokens/service`, `getEntitlement`/`capabilities` dari `@/lib/entitlement`, `listDevices` dari `@/lib/devices/service`, `getLayoutOrNull` dari `@/lib/cyd-layout/service`.
- Produces: `async function requireAgentToken(req: Request): Promise<{ userId: string } | NextResponse>` — **BUKAN Next.js middleware**, dipanggil manual sebagai baris pertama tiap handler `/api/agent/*`.

- [ ] **Step 1: Tulis failing test buat `agent-auth.ts`**

```typescript
// apps/saas/lib/agent-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-tokens/service", () => ({ resolveToken: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));

import { resolveToken } from "@/lib/agent-tokens/service";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { requireAgentToken } from "./agent-auth";

beforeEach(() => vi.clearAllMocks());

function req(auth?: string) {
  const headers = new Headers();
  if (auth) headers.set("Authorization", auth);
  return new Request("http://x/api/agent/devices", { headers });
}

describe("requireAgentToken", () => {
  it("401 kalau header Authorization absen", async () => {
    const result = await requireAgentToken(req());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("401 kalau format bukan 'Bearer <token>'", async () => {
    const result = await requireAgentToken(req("Basic xxx"));
    expect((result as NextResponse).status).toBe(401);
  });

  it("401 kalau token tak dikenal/revoked (resolveToken null)", async () => {
    (resolveToken as any).mockResolvedValue(null);
    const result = await requireAgentToken(req("Bearer slz_invalid"));
    expect((result as NextResponse).status).toBe(401);
  });

  it("403 entitlement_expired kalau paidCore false", async () => {
    (resolveToken as any).mockResolvedValue({ userId: "u1" });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: false, cloud: false });
    const result = await requireAgentToken(req("Bearer slz_valid"));
    expect((result as NextResponse).status).toBe(403);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("entitlement_expired");
  });

  it("balikin { userId } kalau semua valid", async () => {
    (resolveToken as any).mockResolvedValue({ userId: "u1" });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    const result = await requireAgentToken(req("Bearer slz_valid"));
    expect(result).toEqual({ userId: "u1" });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run lib/agent-auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi — `lib/agent-auth.ts` (BUKAN `middleware.ts`, helper biasa)**

```typescript
// apps/saas/lib/agent-auth.ts
import { NextResponse } from "next/server";
import { resolveToken } from "@/lib/agent-tokens/service";
import { getEntitlement, capabilities } from "@/lib/entitlement";

/**
 * Helper per-route (BUKAN Next.js middleware — Edge runtime tak bisa akses Postgres
 * lewat @prisma/adapter-pg, dan apps/saas cuma boleh 1 middleware.ts yang berpotensi
 * bentrok NextAuth nanti). Panggil manual di baris pertama tiap handler /api/agent/*.
 */
export async function requireAgentToken(req: Request): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const resolved = await resolveToken(match[1]);
  if (!resolved) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const ent = await getEntitlement(resolved.userId);
  if (!capabilities(ent).paidCore) {
    return NextResponse.json({ error: "entitlement_expired" }, { status: 403 });
  }

  return { userId: resolved.userId };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run lib/agent-auth.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Tulis failing test buat route `/api/agent/devices`**

```typescript
// apps/saas/app/api/agent/devices/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ listDevices: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { listDevices } from "@/lib/devices/service";
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent/devices", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("200 + device list kalau auth sukses", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (listDevices as any).mockResolvedValue([{ id: "d1", shortCode: "abc1234567" }]);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run app/api/agent/devices/route.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implementasi 2 route agent**

```typescript
// apps/saas/app/api/agent/devices/route.ts
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { listDevices } from "@/lib/devices/service";

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const devices = await listDevices(result.userId);
  return NextResponse.json(devices);
}
```

```typescript
// apps/saas/app/api/agent/layout/route.ts
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { getLayoutOrNull } from "@/lib/cyd-layout/service";

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const layout = await getLayoutOrNull(result.userId);
  if (!layout) return NextResponse.json({ error: "no_layout" }, { status: 404 });
  return NextResponse.json(layout);
}
```

- [ ] **Step 8: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run app/api/agent/devices/route.test.ts`
Expected: PASS (2/2).

- [ ] **Step 9: Commit**

```bash
git add apps/saas/lib/agent-auth.ts apps/saas/lib/agent-auth.test.ts apps/saas/app/api/agent
git commit -m "feat(saas): requireAgentToken helper + API /api/agent/devices, /api/agent/layout"
```

---

### Task 11: UI — promote tab Printer + halaman device list

**Files:**
- Modify: `apps/saas/components/AppHeader.tsx`
- Create: `apps/saas/app/printer/page.tsx`
- Create: `apps/saas/components/printer/DeviceList.tsx`
- Test: `apps/saas/components/printer/DeviceList.test.tsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/devices` (Task 7), `PageShell` (existing component, pola sama `settings/page.tsx`).
- Produces: halaman `/printer` yang render `DeviceList`. Task 13 (layout editor) di-mount di halaman yang sama, di bawah `DeviceList`.

- [ ] **Step 1: Promote tab di `AppHeader.tsx`**

Ubah baris 19 (`{ key: "printer", icon: "🖨️", label: "Printer", soon: true }`) jadi:
```typescript
{ key: "printer", href: "/printer", icon: "🖨️", label: "Printer" },
```

- [ ] **Step 2: Tulis failing test `DeviceList`**

```typescript
// apps/saas/components/printer/DeviceList.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeviceList } from "./DeviceList";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("DeviceList", () => {
  it("tampilkan daftar device dari GET /api/devices", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "d1", label: "Printer A", printerType: "bambu" }] });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
  });

  it("tombol tambah disabled + pesan upsell kalau POST balas 409 slot_limit_exceeded", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "d1", label: "Printer A", printerType: "bambu" }] })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "slot_limit_exceeded", limit: 1 }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    await waitFor(() => expect(screen.getByText(/batas.*tercapai/i)).toBeTruthy());
  });

  it("locked view (upsell) kalau paidCore false, tak panggil fetch sama sekali", () => {
    render(<DeviceList paidCore={false} />);
    expect(screen.getByText(/pro/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run components/printer/DeviceList.test.tsx`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Implementasi `DeviceList.tsx`**

```tsx
// apps/saas/components/printer/DeviceList.tsx
"use client";
import { useEffect, useState } from "react";

type Device = { id: string; label: string; printerType: string };

export function DeviceList({ paidCore }: { paidCore: boolean }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(paidCore);

  useEffect(() => {
    if (!paidCore) return;
    fetch("/api/devices")
      .then((r) => r.json())
      .then(setDevices)
      .finally(() => setLoading(false));
  }, [paidCore]);

  if (!paidCore) {
    return (
      <div className="g-card p-6 text-center">
        <p className="text-[13px] g-t4">🔒 Fitur monitoring printer perlu Pro. Buka dengan Pro untuk daftarkan printer & atur layout CYD.</p>
      </div>
    );
  }

  async function handleAdd() {
    setError(null);
    const label = `Printer ${devices.length + 1}`;
    const res = await fetch("/api/devices", {
      method: "POST",
      body: JSON.stringify({ label, printerType: "bambu" }),
    });
    if (!res.ok) {
      const body = await res.json();
      if (body.error === "slot_limit_exceeded") {
        setError(`Batas ${body.limit} printer sudah tercapai. Tambah slot lewat Subscribe/add-on.`);
      } else {
        setError("Gagal menambah printer.");
      }
      return;
    }
    const created = await res.json();
    setDevices((prev) => [...prev, created]);
  }

  if (loading) return <p className="text-[12px] g-t4">Memuat...</p>;

  return (
    <div className="g-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold">Printer ({devices.length})</h3>
        <button type="button" onClick={handleAdd} className="text-[12px] px-3 py-1.5 rounded-md" style={{ background: "var(--g-accent)", color: "#fff" }}>
          + Tambah
        </button>
      </div>
      {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}
      <ul className="space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="text-[13px] flex items-center justify-between">
            <span>{d.label}</span>
            <span className="g-t4 text-[11px]">{d.printerType}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run components/printer/DeviceList.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Halaman `/printer` (pola sama persis `app/settings/page.tsx`)**

```tsx
// apps/saas/app/printer/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { DeviceList } from "@/components/printer/DeviceList";
import { PageShell } from "@/components/PageShell";

export const dynamic = "force-dynamic";

export default async function PrinterPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const ent = await getEntitlement(userId);
  const paidCore = capabilities(ent).paidCore;
  return (
    <PageShell title="Printer" current="printer" owner={isOwner(session?.user?.email)} userLabel={session?.user?.email ?? undefined}>
      <DeviceList paidCore={paidCore} />
    </PageShell>
  );
}
```

- [ ] **Step 6: Cek `NavKey` type di `AppHeader.tsx` — tambah `"printer"` kalau belum ada**

Baris 8: `export type NavKey = "kalkulator" | "setting" | "admin" | "beli";` → ubah jadi:
```typescript
export type NavKey = "kalkulator" | "setting" | "admin" | "beli" | "printer";
```

- [ ] **Step 7: Verifikasi tipe end-to-end**

Run: `cd apps/saas && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/saas/components/AppHeader.tsx apps/saas/app/printer apps/saas/components/printer/DeviceList.tsx apps/saas/components/printer/DeviceList.test.tsx
git commit -m "feat(saas): promote tab Printer, halaman device list"
```

---

### Task 12: UI — section Agent-token di `/settings`

**Files:**
- Create: `apps/saas/components/settings/AgentTokenSection.tsx`
- Modify: `apps/saas/app/settings/page.tsx`
- Test: `apps/saas/components/settings/AgentTokenSection.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/agent-tokens`, `DELETE /api/agent-tokens/[id]` (Task 9).

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/saas/components/settings/AgentTokenSection.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentTokenSection } from "./AgentTokenSection";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("AgentTokenSection", () => {
  it("generate token → tampilkan token mentah SEKALI + peringatan", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial list
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t1", token: "slz_abcdef123456" }) });
    render(<AgentTokenSection />);
    await waitFor(() => screen.getByRole("button", { name: /generate/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(screen.getByText("slz_abcdef123456")).toBeTruthy());
    expect(screen.getByText(/cuma tampil sekali/i)).toBeTruthy();
  });

  it("revoke token → panggil DELETE dengan id yang benar", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "t1", createdAt: new Date().toISOString(), revokedAt: null, lastUsedAt: null }] })
      .mockResolvedValueOnce({ ok: true });
    render(<AgentTokenSection />);
    await waitFor(() => screen.getByRole("button", { name: /revoke/i }));
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent-tokens/t1", { method: "DELETE" }));
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run components/settings/AgentTokenSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```tsx
// apps/saas/components/settings/AgentTokenSection.tsx
"use client";
import { useEffect, useState } from "react";

type TokenMeta = { id: string; createdAt: string; revokedAt: string | null; lastUsedAt: string | null };

export function AgentTokenSection() {
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  function refresh() {
    fetch("/api/agent-tokens").then((r) => r.json()).then(setTokens);
  }

  useEffect(() => refresh(), []);

  async function handleGenerate() {
    const res = await fetch("/api/agent-tokens", { method: "POST" });
    const body = await res.json();
    setFreshToken(body.token);
    refresh();
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/agent-tokens/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="g-card p-4">
      <h3 className="text-[14px] font-semibold mb-2">Agent Token</h3>
      <p className="text-[12px] g-t4 mb-3">Token buat Agent (aplikasi di komputermu) autentikasi ke server.</p>

      {freshToken && (
        <div className="mb-3 p-2 rounded-md border border-amber-500/40 bg-amber-500/5">
          <p className="text-[11px] mb-1">Token cuma tampil sekali, simpan baik-baik:</p>
          <code className="text-[12px] break-all">{freshToken}</code>
        </div>
      )}

      <button type="button" onClick={handleGenerate} className="text-[12px] px-3 py-1.5 rounded-md mb-3" style={{ background: "var(--g-accent)", color: "#fff" }}>
        Generate token baru
      </button>

      <ul className="space-y-1">
        {tokens.map((t) => (
          <li key={t.id} className="text-[12px] flex items-center justify-between">
            <span>{t.id.slice(0, 8)}… {t.revokedAt ? "(revoked)" : ""}</span>
            {!t.revokedAt && (
              <button type="button" onClick={() => handleRevoke(t.id)} className="text-[11px] text-red-500">
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run components/settings/AgentTokenSection.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Mount di `settings/page.tsx`**

Tambahkan import + render setelah `<SettingsPanel .../>` di `apps/saas/app/settings/page.tsx`:
```tsx
import { AgentTokenSection } from "@/components/settings/AgentTokenSection";
// ...
      <SettingsPanel editable={paidCore} userId={userId} />
      {paidCore && <div className="mt-4"><AgentTokenSection /></div>}
```

- [ ] **Step 6: Commit**

```bash
git add apps/saas/components/settings/AgentTokenSection.tsx apps/saas/components/settings/AgentTokenSection.test.tsx apps/saas/app/settings/page.tsx
git commit -m "feat(saas): section Agent token di halaman Settings"
```

---

### Task 13: UI — Layout editor (port dari `apps/dashboard`)

**Files:**
- Modify: `apps/saas/package.json` (4 dependency baru)
- Create: `apps/saas/components/printer/LayoutEditor.tsx`
- Create: `apps/saas/components/printer/layout-editor/GridCanvas.tsx`, `PrinterPalette.tsx`, `PageTabs.tsx`, `CellSettingsPanel.tsx`
- Modify: `apps/saas/app/printer/page.tsx` (mount `LayoutEditor`)
- Test: `apps/saas/components/printer/LayoutEditor.test.tsx`

**Interfaces:**
- Consumes: `LayoutConfigOut`, `LAYOUT_LIMITS` dari `@3pb/cyd-layout-schema`, `GET/PUT /api/cyd-layout` (Task 8), device list dari `DeviceList` (Task 11, dioper sebagai prop).
- Referensi porting: `apps/dashboard/app/(dashboard)/cyd-layout/page.tsx` (350 baris) + `apps/dashboard/components/cyd-layout/{PrinterPalette,GridCanvas,PageTabs,CellSettingsPanel}.tsx`. **Task ini BUKAN copy-paste literal** — sumber data beda (`Device` SaaS via `shortCode`, bukan `Printer.slug` dashboard), preset field di-hardcode (bukan `CydFieldPreset` dari DB), default grid kecil (Task 8's `defaultSaasLayout`).

- [ ] **Step 1: Tambah 4 dependency ke `apps/saas/package.json`**

Di blok `dependencies` (sejajar `@tanstack/react-query`):
```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2",
"framer-motion": "^12.38.0",
```

Run: `pnpm install`
Expected: sukses, `pnpm-lock.yaml` ter-update.

- [ ] **Step 2: Baca referensi dashboard buat paham struktur sebelum menulis ulang**

Run: `cat "apps/dashboard/app/(dashboard)/cyd-layout/page.tsx"` dan `cat apps/dashboard/components/cyd-layout/{PrinterPalette,GridCanvas,PageTabs,CellSettingsPanel}.tsx` — pahami: (a) state shape (`pages: LayoutPageOut[]`, `activePage: number`, `selectedCellId: string | null`), (b) `DndContext` dengan `onDragEnd` yang assign `cell.col`/`cell.row` dari posisi drop di grid, (c) `PrinterPalette` render list yang bisa di-drag (di dashboard: `Printer[]`; di SaaS: ganti jadi `Device[]`, drag payload `device.shortCode` bukan `printer.slug`), (d) `GridCanvas` render grid `page.grid.cols × page.grid.rows`, drop-zone per cell, resize handle pointer-event manual di pojok cell, drag row-divider buat `rowWeights`, (e) `PageTabs` add/remove/reorder `pages[]`, (f) `CellSettingsPanel` — dropdown field-preset (di SaaS: 2 opsi HARDCODE `[{name:"Ringkas", fields:[["name"],["state"]]}, {name:"Detail", fields:[["name"],["state"],["progress"],["timeLeft"]]}]`, BUKAN fetch `CydFieldPreset` dari DB) + input `durationSec` + grid size per page.

- [ ] **Step 3: Tulis failing test level-integrasi (bukan unit tiap sub-komponen — cakupan perilaku observable)**

```typescript
// apps/saas/components/printer/LayoutEditor.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "./LayoutEditor";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("LayoutEditor", () => {
  it("muat layout dari GET /api/cyd-layout, render 1 page default", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] }),
    });
    render(<LayoutEditor devices={[{ id: "d1", shortCode: "abc1234567", label: "Printer A", printerType: "bambu" }]} />);
    await waitFor(() => expect(screen.getByText(/printer a/i)).toBeTruthy());
  });

  it("tombol simpan panggil PUT /api/cyd-layout dengan config saat ini", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 1, pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<LayoutEditor devices={[]} />);
    await waitFor(() => screen.getByRole("button", { name: /simpan/i }));
    screen.getByRole("button", { name: /simpan/i }).click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cyd-layout", expect.objectContaining({ method: "PUT" })));
  });
});
```

- [ ] **Step 4: Jalankan test, pastikan gagal**

Run: `cd apps/saas && npx vitest run components/printer/LayoutEditor.test.tsx`
Expected: FAIL — komponen belum ada.

- [ ] **Step 5: Implementasi `LayoutEditor.tsx` + 4 sub-komponen**

Tulis `LayoutEditor.tsx` sebagai container: `useState<LayoutConfigOut>`, `useEffect` fetch `GET /api/cyd-layout` saat mount, render `PageTabs` + `PrinterPalette` (dari prop `devices`) + `GridCanvas` (page aktif) + `CellSettingsPanel` (cell terpilih), tombol "Simpan" panggil `PUT /api/cyd-layout` dengan `JSON.stringify(config)`. Adaptasi 4 sub-komponen dari referensi Step 2:

- `PrinterPalette.tsx`: props `devices: { shortCode: string; label: string }[]`, tiap item draggable (`useDraggable` dari `@dnd-kit/core`, `id: device.shortCode`), tampilkan `device.label` (bukan `printer.name`/`printer.slug` dashboard).
- `GridCanvas.tsx`: props `page: LayoutPageOut`, `onCellsChange: (cells: LayoutCellOut[]) => void`, `onSelectCell: (id: string | null) => void`. `DndContext` + `useDroppable` per sel grid (kalkulasi posisi dari `page.grid.cols`/`rows`), `DragOverlay` buat preview drag. Resize handle & row-divider drag — port logic pointer-event dashboard verbatim (matematikanya generic, tak terikat sumber data).
- `PageTabs.tsx`: props `pages: LayoutPageOut[]`, `activeIndex: number`, `onChange`, `onAdd`, `onRemove` — cek `pages.length < LAYOUT_LIMITS.maxPages` sebelum enable tombol "+".
- `CellSettingsPanel.tsx`: props `cell: LayoutCellOut | null`, `onChange`. Preset field HARDCODE:
```typescript
const FIELD_PRESETS = [
  { name: "Ringkas", fields: [["name"], ["state"]] as FieldRow[] },
  { name: "Detail", fields: [["name"], ["state"], ["progress"], ["timeLeft"]] as FieldRow[] },
];
```
Dropdown pilih preset → `onChange({ ...cell, fields: preset.fields })` (copy-on-select, sama persis semantik dashboard — bukan referensi by-ID).

**Validasi FE ringan (bukan pengganti validasi server Task 8):** sebelum `PUT`, cek panjang `label`/`text` terhadap `LAYOUT_LIMITS.maxLabelLength`/`maxLabelTextLength` di `CellSettingsPanel`, tampilkan pesan kalau kelebihan — server tetap validasi ulang lewat `validateLayoutConfig` (409/400 kalau FE lolos tapi server nolak).

- [ ] **Step 6: Jalankan test, pastikan lolos**

Run: `cd apps/saas && npx vitest run components/printer/LayoutEditor.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 7: Mount `LayoutEditor` di halaman `/printer` (setelah `DeviceList`)**

```tsx
// apps/saas/app/printer/page.tsx — tambah import + render
import { LayoutEditor } from "@/components/printer/LayoutEditor";
// ...
      <DeviceList paidCore={paidCore} />
      {paidCore && <div className="mt-4"><LayoutEditor devices={await (async () => {
        const { listDevices } = await import("@/lib/devices/service");
        return listDevices(userId);
      })()} /></div>}
```

(Catatan implementer: kalau pola inline-IIFE di atas kerasa kikuk buat App Router server component, boleh direfaktor jadi `const devices = paidCore ? await listDevices(userId) : [];` sebelum `return`, dioper sebagai prop biasa — hasil akhirnya harus sama: `LayoutEditor` dapat device list terbaru dari server saat render.)

- [ ] **Step 8: Verifikasi tipe + lint**

Run: `cd apps/saas && npx tsc --noEmit && npx eslint components/printer app/printer`
Expected: exit 0 keduanya.

- [ ] **Step 9: Commit**

```bash
git add apps/saas/package.json pnpm-lock.yaml apps/saas/components/printer apps/saas/app/printer/page.tsx
git commit -m "feat(saas): layout editor drag-drop (port dari apps/dashboard, sumber data Device SaaS)"
```

---

### Task 14: Verifikasi akhir & dokumentasi

**Files:**
- Modify: `docs/kalkulator-formula.md` atau file docs relevan (TIDAK ADA perubahan formula di sub-proyek ini — skip kalau tak relevan)
- Verifikasi menyeluruh, tanpa file kode baru.

- [ ] **Step 1: Full test suite monorepo**

Run: `pnpm turbo test`
Expected: semua package PASS, termasuk `packages/cyd-layout-schema` (baru), `apps/dashboard` (regresi nol), `apps/saas` (semua task di atas).

- [ ] **Step 2: Typecheck kedua app**

Run: `cd apps/saas && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit`
Expected: exit 0 keduanya. **Ingat Global Constraint prisma-clobber** — kalau salah satu barusan di-`prisma generate`, regenerate yang LAIN dulu sebelum typecheck app itu.

- [ ] **Step 3: Build kedua app**

Run: `cd apps/saas && pnpm build && cd ../dashboard && pnpm build`
Expected: sukses keduanya.

- [ ] **Step 4: Jalankan test integrasi race-condition sekali lagi (final sanity, DB dev)**

Run: `cd apps/saas && DATABASE_URL="<dev>" npx vitest run lib/devices/service.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Review manual checklist spec (self-check, bukan subagent)**

Cocokkan tiap section spec `docs/superpowers/specs/2026-07-27-cyd-produk-device-management-design.md` ke task di plan ini:
- Data Model (Device/CydLayout/AgentToken/Entitlement.printerSlots) → Task 3 ✓
- Package cyd-layout-schema → Task 2 ✓
- API session-auth (devices, cyd-layout, agent-tokens) → Task 6-9 ✓
- API token-auth /api/agent/* → Task 10 ✓
- UI (tab, device list, layout editor, agent-token settings) → Task 11-13 ✓
- Race condition row-lock → Task 6 ✓
- Migrasi Printer.slug dashboard → Task 1 ✓
- shortCode generator → Task 4 ✓
- getConfigInt + DEFAULT_CONFIG → Task 5 ✓

Kalau ada gap, tambahkan task susulan sebelum lanjut ke code review akhir.

- [ ] **Step 6: Commit dokumentasi (kalau ada perubahan) atau tandai plan selesai**

```bash
git add docs/superpowers/plans/2026-07-27-cyd-produk-device-management.md
git commit -m "docs: tandai plan CYD Produk sub-proyek 1 selesai dieksekusi" --allow-empty
```
