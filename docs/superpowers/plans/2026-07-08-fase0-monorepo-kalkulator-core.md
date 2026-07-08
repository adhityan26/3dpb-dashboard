# Fase 0: Monorepo + Ekstraksi kalkulator-core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformasi repo jadi monorepo pnpm+Turborepo, pindahkan shopee-dashboard ke `apps/dashboard`, ekstrak formula kalkulator ke `packages/kalkulator-core`, dan implementasikan formula v2 (material profile, printer profile, komponen generik, labor cost, channel fee) dengan wrapper kompatibilitas sehingga dashboard internal berperilaku persis seperti sekarang.

**Architecture:** Formula legacy `hitungKalkulasi` dipertahankan sebagai wrapper: adapter memetakan input legacy (gantungan/switch/label/helm/adminEcommerce) ke model v2, `hitungKalkulasiV2` menghitung (pure, tanpa pembulatan), lalu presenter legacy membulatkan persis seperti perilaku lama — existing test suite jadi golden test. Adopsi UI/DB internal untuk v2 = plan terpisah (Fase 0b). SaaS app (Fase 1) langsung konsumsi v2.

**Tech Stack:** pnpm 10 (corepack), Turborepo 2, Next.js 16.2.3, TypeScript 5, Vitest 1, Prisma 7, Node 22.

## Global Constraints

- Node 22 (`.nvmrc` berisi `22`); package manager **pnpm via corepack** (root `package.json` punya field `packageManager`).
- Next.js versi **16.2.3** — sebelum mengubah kode Next apa pun, baca guide di `apps/dashboard/node_modules/next/dist/docs/` (instruksi AGENTS.md repo; API bisa beda dari pengetahuan umum).
- **Zero behavior change** untuk dashboard internal, dengan SATU pengecualian yang disengaja: bug fix plate SLA multi-material (Task 6).
- Nama package: `@3pb/kalkulator-core`. Istilah domain Indonesia dipertahankan apa adanya (`hitungKalkulasi`, `gramasi`, `hpp`, dst.).
- Semua path di plan ini relatif ke root monorepo `/Users/adhityatangahu/Documents/shopee-analysis` kecuali ditulis absolut.
- Setiap commit diakhiri trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Spec acuan: `docs/superpowers/specs/2026-07-08-saas-3pb-design.md` dan `docs/kalkulator-formula.md`.

---

### Task 1: Transformasi git — monorepo layout

Repo git saat ini ada di `shopee-dashboard/.git` (remote `git@github.com:adhityan26/3dpb-dashboard.git`). Kita angkat `.git` ke root dan pindahkan working tree ke `apps/dashboard` supaya history terbawa via rename detection.

**Files:**
- Move: `shopee-dashboard/` → `apps/dashboard/` (termasuk `.git` → root)
- Create: `.gitignore` (root)

**Interfaces:**
- Produces: repo git ber-root di `/Users/adhityatangahu/Documents/shopee-analysis` dengan app di `apps/dashboard/`; task berikutnya mengasumsikan layout ini.

- [ ] **Step 1: Pastikan working tree bersih**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard && git status --porcelain`
Expected: kosong. Kalau ada perubahan uncommitted, STOP dan lapor ke user (jangan stash tanpa izin).

- [ ] **Step 2: Angkat .git ke root, pindahkan app**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
mv shopee-dashboard/.git .git
mkdir -p apps
mv shopee-dashboard apps/dashboard
```

- [ ] **Step 3: Buat `.gitignore` root**

File `.gitignore` (root, baru):

```gitignore
node_modules/
.turbo/
.DS_Store

# Session/tool state
/.superpowers/
/.claude/
/.idea/

# File data analisis di root (bukan bagian kode)
/*.xlsx
/*.csv
/*.pdf
```

- [ ] **Step 4: Stage semua & verifikasi rename detection**

```bash
git add -A
git status | head -20
```

Expected: mayoritas entri berstatus `renamed: <path> -> apps/dashboard/<path>`. Kalau muncul `deleted:` massal tanpa pasangan `new file:`, STOP — ada yang salah dengan move.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: restructure repo jadi monorepo — shopee-dashboard pindah ke apps/dashboard" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Verifikasi history terbawa**

Run: `git log --follow --oneline -- apps/dashboard/lib/kalkulator/formula.ts | head -5`
Expected: ≥2 commit (commit rename barusan + history lama file itu).

---

### Task 2: Bootstrap pnpm workspace + Turborepo

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.nvmrc` (root)
- Delete: `apps/dashboard/package-lock.json`

**Interfaces:**
- Produces: perintah `pnpm --filter shopee-dashboard <script>` dan `pnpm turbo <task>` yang dipakai semua task berikutnya.

- [ ] **Step 1: Tulis file workspace**

File `package.json` (root, baru):

```json
{
  "name": "3pb",
  "private": true,
  "packageManager": "pnpm@10.12.1",
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "dev": "turbo dev"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  }
}
```

File `pnpm-workspace.yaml` (baru):

```yaml
packages:
  - apps/*
  - packages/*

# pnpm 10 memblokir postinstall script by default — izinkan yang dibutuhkan
onlyBuiltDependencies:
  - '@prisma/client'
  - '@prisma/engines'
  - prisma
  - esbuild
  - sharp
  - lightningcss
  - '@tailwindcss/oxide'
```

File `turbo.json` (baru):

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "test": {},
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

File `.npmrc` (root, baru):

```ini
auto-install-peers=true
```

File `.nvmrc` (root, baru) — isi persis:

```
22
```

- [ ] **Step 2: Ganti lockfile npm → pnpm**

```bash
rm apps/dashboard/package-lock.json
corepack enable
pnpm install
```

Expected: `pnpm-lock.yaml` terbentuk di root, install sukses. Kalau ada error peer dependency yang menghentikan install, catat paketnya dan tambahkan resolusi — jangan pakai `--force`.

- [ ] **Step 3: Verifikasi dashboard masih sehat**

```bash
pnpm --filter shopee-dashboard exec prisma generate
pnpm --filter shopee-dashboard test
pnpm --filter shopee-dashboard build
```

Expected: prisma generate sukses, vitest PASS (suite formula + bot), `next build` selesai tanpa error (env lokal `.env` dashboard sudah ada dan ikut terbawa move).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: bootstrap pnpm workspace + turborepo (npm lockfile diganti pnpm-lock)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Update Dockerfile, deploy.sh, entrypoint & CI untuk layout monorepo

Deploy internal harus tetap jalan. Build context pindah ke root monorepo; image build pakai pnpm.

**Files:**
- Modify: `apps/dashboard/Dockerfile` (rewrite penuh)
- Modify: `apps/dashboard/deploy.sh` (baris build context)
- Modify: `apps/dashboard/docker-entrypoint.sh` (path server & prisma)
- Create: `.dockerignore` (root)
- Modify: file di `apps/dashboard/.github/workflows/` yang menjalankan docker build (jika ada)

**Interfaces:**
- Consumes: workspace pnpm dari Task 2.
- Produces: `./apps/dashboard/deploy.sh` yang bisa dipakai user seperti biasa.

- [ ] **Step 1: Tulis ulang `apps/dashboard/Dockerfile`**

```dockerfile
# ── Stage 1: Build (monorepo, pnpm via corepack) ─────────────────────────────
FROM node:22-alpine AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

# Generate Prisma client (dibutuhkan saat build untuk type checking)
RUN pnpm --filter shopee-dashboard exec prisma generate

# Build Next.js standalone
RUN pnpm --filter shopee-dashboard build

# ── Stage 2: Production runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output (layout monorepo: server.js ada di apps/dashboard/)
COPY --from=builder /repo/apps/dashboard/.next/standalone ./
COPY --from=builder /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /repo/apps/dashboard/public ./apps/dashboard/public

# Prisma schema + migrations (untuk `prisma migrate deploy` di entrypoint)
COPY --from=builder /repo/apps/dashboard/prisma ./apps/dashboard/prisma
COPY --from=builder /repo/apps/dashboard/prisma.config.ts ./apps/dashboard/prisma.config.ts

# Full node_modules untuk prisma CLI + seed script (pola sama seperti sebelumnya).
# Symlink pnpm relatif, jadi copy root + app node_modules mempertahankan resolusi.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/dashboard/node_modules ./apps/dashboard/node_modules

COPY --from=builder /repo/apps/dashboard/scripts ./apps/dashboard/scripts
COPY --from=builder /repo/apps/dashboard/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
```

- [ ] **Step 2: Buat `.dockerignore` di root**

```
**/node_modules
**/.next
**/.turbo
.git
.superpowers
.claude
.idea
docs
*.xlsx
*.csv
*.pdf
apps/dashboard/authentik
apps/dashboard/nginx-proxy-manager
```

(Two entri terakhir: config infra yang tidak dibutuhkan image. JANGAN exclude `apps/dashboard/prisma`, `scripts`, atau `public`.)

- [ ] **Step 3: Update `apps/dashboard/docker-entrypoint.sh`**

Baca file existing dulu (`cat apps/dashboard/docker-entrypoint.sh`), pertahankan logika yang ada (mis. guard migrasi), lalu sesuaikan path: semua perintah prisma dijalankan dari `/app/apps/dashboard`, dan server dijalankan dengan `node /app/apps/dashboard/server.js`. Bentuk akhir minimal:

```sh
#!/bin/sh
set -e

cd /app/apps/dashboard
npx prisma migrate deploy

exec node /app/apps/dashboard/server.js
```

(Kalau entrypoint existing punya langkah lain — seed, wait-for-db — pertahankan dengan path yang disesuaikan.)

- [ ] **Step 4: Update `apps/dashboard/deploy.sh`**

Ubah HANYA baris build shopee-dashboard (baris ~60). Tambahkan variabel root di blok config:

```bash
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
```

dan ganti:

```bash
  docker build -t "$LOCAL_IMAGE" "$(dirname "$0")"
```

menjadi:

```bash
  docker build -t "$LOCAL_IMAGE" -f "$REPO_ROOT/apps/dashboard/Dockerfile" "$REPO_ROOT"
```

`STL_BUILD_CONTEXT="$(dirname "$0")/services/stl-service"` sudah benar relatif terhadap lokasi script — biarkan.

- [ ] **Step 5: Update GitHub Actions (jika ada)**

Run: `grep -rn "docker" apps/dashboard/.github/workflows/ 2>/dev/null`
Jika ada workflow yang build image: ubah `context:` menjadi root repo (`.` dari root checkout) dan `file:`/`dockerfile:` menjadi `apps/dashboard/Dockerfile`; sesuaikan juga step setup Node → tambah `corepack enable` + pnpm. Jika tidak ada docker workflow, skip step ini.

- [ ] **Step 6: Verifikasi build image**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker build -t shopee-dashboard:monorepo-test \
  -f apps/dashboard/Dockerfile .
```

Expected: build sukses sampai stage runner. (JANGAN deploy/restart container — itu keputusan user.) Kalau host homelab tidak reachable, jalankan build di Docker lokal bila tersedia; kalau dua-duanya tidak bisa, tandai step ini untuk diverifikasi user saat deploy berikutnya dan catat di commit message.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: Dockerfile + deploy.sh + entrypoint untuk build monorepo pnpm" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Scaffold `packages/kalkulator-core`

**Files:**
- Create: `packages/kalkulator-core/package.json`
- Create: `packages/kalkulator-core/tsconfig.json`
- Create: `packages/kalkulator-core/vitest.config.ts`
- Create: `packages/kalkulator-core/src/index.ts`
- Test: `packages/kalkulator-core/src/index.test.ts` (smoke, dihapus di Task 5)

**Interfaces:**
- Produces: package `@3pb/kalkulator-core` yang bisa di-import app lain via `workspace:*`; entry point `src/index.ts` (konsumsi source TS langsung, tanpa build step — Next pakai `transpilePackages`).

- [ ] **Step 1: Tulis scaffold**

File `packages/kalkulator-core/package.json`:

```json
{
  "name": "@3pb/kalkulator-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^1.6.1"
  }
}
```

File `packages/kalkulator-core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

File `packages/kalkulator-core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

File `packages/kalkulator-core/src/index.ts`:

```ts
export const KALKULATOR_CORE_VERSION = '0.1.0'
```

File `packages/kalkulator-core/src/index.test.ts`:

```ts
import { KALKULATOR_CORE_VERSION } from './index'

it('package resolves', () => {
  expect(KALKULATOR_CORE_VERSION).toBe('0.1.0')
})
```

- [ ] **Step 2: Install & jalankan test package**

```bash
pnpm install
pnpm --filter @3pb/kalkulator-core test
```

Expected: 1 test PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: scaffold packages/kalkulator-core" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Pindahkan formula verbatim ke package

Pindahkan formula + tipe kalkulasi + test-nya tanpa mengubah perilaku. App mengimpor dari package; tipe app-specific tetap di app dengan re-export supaya ~15 file lain tidak perlu diubah.

**Files:**
- Create: `packages/kalkulator-core/src/types.ts` (tipe kalkulasi dari `apps/dashboard/lib/kalkulator/types.ts`)
- Create: `packages/kalkulator-core/src/formula.ts` (verbatim dari `apps/dashboard/lib/kalkulator/formula.ts`)
- Create: `packages/kalkulator-core/src/formula.test.ts` (verbatim dari `apps/dashboard/lib/kalkulator/formula.test.ts`)
- Modify: `packages/kalkulator-core/src/index.ts`
- Delete: `apps/dashboard/lib/kalkulator/formula.ts`, `apps/dashboard/lib/kalkulator/formula.test.ts`, `packages/kalkulator-core/src/index.test.ts`
- Modify: `apps/dashboard/lib/kalkulator/types.ts` (re-export + sisakan tipe app)
- Modify: `apps/dashboard/lib/kalkulator/service.ts:2`, `apps/dashboard/app/api/bot/kalkulator/route.ts:4`
- Modify: `apps/dashboard/next.config.ts`, `apps/dashboard/package.json`

**Interfaces:**
- Produces: `import { hitungKalkulasi } from '@3pb/kalkulator-core'` — signature SAMA seperti sekarang: `hitungKalkulasi(plates, aksesori, batch, rates, marginTier, hargaShopeeAktual?, customRiskPct?, helmOptions?)`. Tipe yang diekspor package: `PrintTipe, MarginTier, KalkulasiStatus, PackingType, ProduktType, FinishType, HelmTier, HelmOptions, HELM_TIER_DEFAULTS, FilamentEntry, PlateInput, KomponenKustomInput, KalkulatorRates, HasilKalkulasi`.

- [ ] **Step 1: Pindahkan tipe kalkulasi ke package**

Buat `packages/kalkulator-core/src/types.ts` berisi COPY PERSIS blok-blok berikut dari `apps/dashboard/lib/kalkulator/types.ts` (baris 1–58 dan 65–102): `PrintTipe`, `MarginTier`, `KalkulasiStatus`, `PackingType`, `ProduktType`, `FinishType`, `HelmTier`, `HelmOptions`, `HELM_TIER_DEFAULTS`, `FilamentEntry`, `PlateInput`, `KomponenKustomInput`, `KalkulatorRates`, `HasilKalkulasi`. JANGAN sertakan `PlateData`, `KomponenKustomData`, `KalkulasiInput`, `KalkulasiData`, `KalkulasiProduk*`, `FilamentHargaData`, `ResinHargaData`, `KalkulasiListResponse` (itu tipe app).

- [ ] **Step 2: Pindahkan formula & test**

```bash
git mv apps/dashboard/lib/kalkulator/formula.ts packages/kalkulator-core/src/formula.ts
git mv apps/dashboard/lib/kalkulator/formula.test.ts packages/kalkulator-core/src/formula.test.ts
rm packages/kalkulator-core/src/index.test.ts
```

Di `packages/kalkulator-core/src/formula.ts`, import path tetap `from './types'` — sudah benar. Di `formula.test.ts` juga (`from './formula'`, `from './types'`) — sudah benar.

- [ ] **Step 3: Ekspor dari index**

Ganti isi `packages/kalkulator-core/src/index.ts`:

```ts
export * from './types'
export { hitungKalkulasi } from './formula'
```

- [ ] **Step 4: Ubah `apps/dashboard/lib/kalkulator/types.ts` jadi re-export + tipe app**

Hapus definisi yang sudah pindah, ganti bagian atas file dengan:

```ts
export type {
  PrintTipe, MarginTier, KalkulasiStatus, PackingType, ProduktType,
  FinishType, HelmTier, HelmOptions, FilamentEntry, PlateInput,
  KomponenKustomInput, KalkulatorRates, HasilKalkulasi,
} from '@3pb/kalkulator-core'
export { HELM_TIER_DEFAULTS } from '@3pb/kalkulator-core'

import type {
  PlateInput, KomponenKustomInput, HasilKalkulasi, MarginTier,
  PackingType, ProduktType, FinishType,
} from '@3pb/kalkulator-core'
```

Tipe app yang tersisa di file ini (`PlateData`, `KalkulasiInput`, `KalkulasiData`, dst.) TIDAK berubah isinya.

- [ ] **Step 5: Update import call sites & wiring workspace**

`apps/dashboard/lib/kalkulator/service.ts:2`:

```ts
import { hitungKalkulasi } from '@3pb/kalkulator-core'
```

`apps/dashboard/app/api/bot/kalkulator/route.ts:4`:

```ts
import { hitungKalkulasi } from "@3pb/kalkulator-core"
```

`apps/dashboard/package.json` — tambah di `dependencies`:

```json
"@3pb/kalkulator-core": "workspace:*",
```

`apps/dashboard/next.config.ts` — tambah di object config (baca file dulu, sisipkan key):

```ts
transpilePackages: ['@3pb/kalkulator-core'],
```

- [ ] **Step 6: Install & verifikasi semua**

```bash
pnpm install
pnpm --filter @3pb/kalkulator-core test
pnpm --filter shopee-dashboard test
pnpm --filter shopee-dashboard build
```

Expected: 13 test formula PASS di package; test dashboard PASS; build sukses.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: ekstrak formula kalkulator ke @3pb/kalkulator-core (verbatim)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Fix bug — plate SLA multi-material pakai rate FDM

**Files:**
- Modify: `packages/kalkulator-core/src/formula.ts` (cabang `materials`, baris ~38–44)
- Test: `packages/kalkulator-core/src/formula.test.ts`

**Interfaces:**
- Consumes: `hitungKalkulasi` dari Task 5.
- Produces: perilaku baru — fallback rate cabang multi-material mengikuti `p.tipe`.

- [ ] **Step 1: Tulis failing test**

Tambah di `formula.test.ts` (dalam `describe('hitungKalkulasi', ...)`):

```ts
it('SLA plate with materials[] falls back to SLA rates, not FDM', () => {
  const result = hitungKalkulasi(
    [{ tipe: 'SLA', durasiJam: 0.5, materials: [{ brand: 'AnyCubic', material: 'ABS-like', color: 'Grey', gramasi: 5 }] }],
    { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
    1, DEFAULT_RATES, 'A'
  )
  // matHpp = 5 × 1750 = 8750; mesin = 0.5 × 4000 = 2000 → 10750
  expect(result.hppProduksi).toBeCloseTo(10750, 0)
  // matJual = 5 × 3500 = 17500; + mesin 2000 → 19500
  expect(result.floorPrice).toBeCloseTo(19500, 0)
})
```

- [ ] **Step 2: Verifikasi gagal**

Run: `pnpm --filter @3pb/kalkulator-core test`
Expected: FAIL — `hppProduksi` terhitung 3500 (5×300+2000) karena fallback FDM.

- [ ] **Step 3: Fix implementasi**

Di `formula.ts`, dalam cabang `if (p.materials && p.materials.length > 0)`, ganti reduce menjadi:

```ts
      const isSLA = p.tipe === 'SLA'
      const baseHpp  = isSLA ? rates.slaHppPerGram  : rates.fdmHppPerGram
      const baseJual = isSLA ? rates.slaJualPerGram : rates.fdmJualPerGram
      const { totalHpp, totalJual } = p.materials.reduce((s, m) => {
        const hppRate  = m.hargaPerGram ?? baseHpp
        const jualRate = Math.max(baseJual, m.hargaPerGram ?? baseJual)
        return { totalHpp: s.totalHpp + m.gramasi * hppRate, totalJual: s.totalJual + m.gramasi * jualRate }
      }, { totalHpp: 0, totalJual: 0 })
```

dan sesuaikan cabang `else` agar tidak mendeklarasikan ulang (`const` lokal per cabang, hapus deklarasi `let baseHpp, baseJual` di atas kalau jadi tidak terpakai).

- [ ] **Step 4: Verifikasi pass** — `pnpm --filter @3pb/kalkulator-core test` → semua PASS (14 test).

- [ ] **Step 5: Commit**

```bash
git add packages/kalkulator-core
git commit -m "fix(kalkulator-core): plate SLA multi-material pakai rate SLA, bukan FDM" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Rates — margin multiplier & reseller bulk jadi setting; hapus dead param `marginTier`

**Files:**
- Modify: `packages/kalkulator-core/src/types.ts` (`KalkulatorRates`)
- Modify: `packages/kalkulator-core/src/formula.ts` (signature + pakai rates)
- Test: `packages/kalkulator-core/src/formula.test.ts`
- Modify: `apps/dashboard/lib/kalkulator/rates.ts`
- Modify: `apps/dashboard/lib/kalkulator/service.ts` (call site ~baris 50)
- Modify: `apps/dashboard/app/api/bot/kalkulator/route.ts` (call site ~baris 23)
- Modify: `apps/dashboard/lib/bot/__tests__/kalkulator-route.test.ts` (fixture rates, jika mendefinisikan `KalkulatorRates`)

**Interfaces:**
- Produces: signature BARU `hitungKalkulasi(plates, aksesori, batch, rates, hargaShopeeAktual?, customRiskPct?, helmOptions?)` (param `marginTier` DIHAPUS) dan `KalkulatorRates` bertambah `marginMultipliers: Record<MarginTier, number>` + `resellerBulkMultiplier: number`. Task 9–10 memakai bentuk ini.

- [ ] **Step 1: Update tipe & test fixture (failing dulu)**

Di `packages/kalkulator-core/src/types.ts`, tambah ke `KalkulatorRates`:

```ts
  marginMultipliers: Record<MarginTier, number>  // default { A: 1.1, B: 1.5, C: 2.0 }
  resellerBulkMultiplier: number                 // default 1.05
```

Di `formula.test.ts`, tambah ke `DEFAULT_RATES`:

```ts
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
```

dan hapus argumen `'A'` dari SEMUA pemanggilan `hitungKalkulasi` (posisi ke-5). Contoh: `hitungKalkulasi(plates, aksesori, 1, DEFAULT_RATES, 'A', 50000)` → `hitungKalkulasi(plates, aksesori, 1, DEFAULT_RATES, 50000)`.

Run: `pnpm --filter @3pb/kalkulator-core test`
Expected: FAIL (type error / hasil salah) — signature belum berubah.

- [ ] **Step 2: Update formula**

Di `formula.ts`: hapus const `MARGIN_MULTIPLIERS`; hapus param `marginTier: MarginTier` dari signature; ganti pemakaian:

```ts
  const m = rates.marginMultipliers
  const offlineA = floorPriceWithFinishing * m.A
  const offlineB = floorPriceWithFinishing * m.B
  const offlineC = floorPriceWithFinishing * m.C
  ...
  const resellerBulk = floorPriceWithFinishing * rates.resellerBulkMultiplier
```

Sekalian rapikan double-pass: ganti dua `reduce` terpisah (baris ~66–67) dengan satu loop:

```ts
  let totalHppBatch = 0, totalJualBatch = 0
  for (const p of plates) {
    const c = plateCost(p)
    totalHppBatch += c.hpp
    totalJualBatch += c.jual
  }
```

Run: `pnpm --filter @3pb/kalkulator-core test` → PASS (14 test, angka tidak berubah).

- [ ] **Step 3: Update loader rates & call sites app**

`apps/dashboard/lib/kalkulator/rates.ts` — tambah di object return `loadRates()`:

```ts
    marginMultipliers: {
      A: parseFloat(map['kalk.margin.a'] ?? '1.1'),
      B: parseFloat(map['kalk.margin.b'] ?? '1.5'),
      C: parseFloat(map['kalk.margin.c'] ?? '2.0'),
    },
    resellerBulkMultiplier: parseFloat(map['kalk.resellerBulk.multiplier'] ?? '1.05'),
```

`apps/dashboard/lib/kalkulator/service.ts` — di call `hitungKalkulasi(...)` hapus baris `input.marginTier as MarginTier,`. (Field `marginTier` di `KalkulasiInput`/DB TETAP ada — hanya tidak dikirim ke formula.) Hapus `MarginTier` dari import type kalau jadi tidak terpakai.

`apps/dashboard/app/api/bot/kalkulator/route.ts` — hapus argumen `tier,` dari call; hapus baris `const tier = ...` dan `MarginTier` dari import (tidak terpakai lagi).

`apps/dashboard/lib/bot/__tests__/kalkulator-route.test.ts` — baca file; kalau ada fixture object bertipe `KalkulatorRates`, tambahkan dua properti baru yang sama seperti `DEFAULT_RATES` di atas.

- [ ] **Step 4: Verifikasi seluruh workspace**

```bash
pnpm turbo test
pnpm --filter shopee-dashboard build
```

Expected: semua PASS, build sukses.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(kalkulator-core): margin multiplier & reseller bulk jadi rates; hapus dead param marginTier" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: `hitungMesinPerJam` — kalkulator biaya mesin per printer

**Files:**
- Create: `packages/kalkulator-core/src/printer.ts`
- Test: `packages/kalkulator-core/src/printer.test.ts`
- Modify: `packages/kalkulator-core/src/types.ts`, `src/index.ts`

**Interfaces:**
- Produces: `hitungMesinPerJam(input: PrinterCostInput): number` dan tipe `PrinterProfile`, `PrinterCostInput` — dipakai UI settings (Fase 0b/1) untuk mengisi `mesinPerJam`.

- [ ] **Step 1: Tambah tipe**

Di `types.ts`:

```ts
// ── V2: printer ──
export interface PrinterProfile {
  id: string
  nama: string
  mesinPerJam: number
}

export interface PrinterCostInput {
  watt: number              // konsumsi rata-rata printer
  tarifPerKwh: number       // tarif listrik Rp/kWh
  hargaPrinter: number      // harga beli printer
  umurPakaiJam: number      // estimasi umur pakai dalam jam print
  maintenancePerJam?: number
}
```

- [ ] **Step 2: Failing test**

File `packages/kalkulator-core/src/printer.test.ts`:

```ts
import { hitungMesinPerJam } from './printer'

describe('hitungMesinPerJam', () => {
  it('listrik + depresiasi + maintenance', () => {
    // 300W × Rp1500/kWh = 450; Rp6.000.000 / 6000 jam = 1000; maintenance 100
    expect(hitungMesinPerJam({ watt: 300, tarifPerKwh: 1500, hargaPrinter: 6_000_000, umurPakaiJam: 6000, maintenancePerJam: 100 })).toBeCloseTo(1550)
  })

  it('maintenance opsional default 0', () => {
    expect(hitungMesinPerJam({ watt: 300, tarifPerKwh: 1500, hargaPrinter: 6_000_000, umurPakaiJam: 6000 })).toBeCloseTo(1450)
  })
})
```

Run: `pnpm --filter @3pb/kalkulator-core test` → FAIL (module not found).

- [ ] **Step 3: Implementasi**

File `packages/kalkulator-core/src/printer.ts`:

```ts
import type { PrinterCostInput } from './types'

/** Estimasi biaya mesin per jam: listrik + depresiasi + maintenance. */
export function hitungMesinPerJam(i: PrinterCostInput): number {
  return (i.watt / 1000) * i.tarifPerKwh + i.hargaPrinter / i.umurPakaiJam + (i.maintenancePerJam ?? 0)
}
```

Tambah di `index.ts`: `export { hitungMesinPerJam } from './printer'`.

- [ ] **Step 4: Verifikasi pass** — `pnpm --filter @3pb/kalkulator-core test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/kalkulator-core
git commit -m "feat(kalkulator-core): hitungMesinPerJam + tipe PrinterProfile" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Formula v2 — `hitungKalkulasiV2`

Model baru: material per entry membawa harga & failure rate sendiri (dari material profile), mesin per plate (dari printer profile), komponen generik, labor generik, harga per channel. Semua nilai hasil TIDAK dibulatkan (pembulatan urusan presenter).

**Files:**
- Modify: `packages/kalkulator-core/src/types.ts` (tipe v2)
- Create: `packages/kalkulator-core/src/formula-v2.ts`
- Test: `packages/kalkulator-core/src/formula-v2.test.ts`
- Modify: `packages/kalkulator-core/src/index.ts`

**Interfaces:**
- Consumes: `MarginTier`, `KalkulasiStatus`, `PrintTipe` dari `types.ts`.
- Produces: `hitungKalkulasiV2(input: KalkulasiInputV2, settings: SettingsV2): HasilKalkulasiV2` + semua tipe v2 di bawah. Task 10 dan SaaS (Fase 1) memakai ini.

- [ ] **Step 1: Tambah tipe v2 di `types.ts`**

```ts
// ── V2: model settings-driven ──
export interface MaterialProfile {
  id: string
  nama: string             // 'PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Resin ABS-like', …
  tipe: PrintTipe
  hppPerGram: number       // harga modal per gram
  jualPerGram: number      // basis floor price per gram
  failureRatePct: number   // failure rate khas material ini
}

export interface KomponenItem { nama: string; harga: number; qty: number }

/** Biaya = (jam × ratePerJam) + flat. Field yang tidak diisi dianggap 0. */
export interface LaborItem {
  nama: string
  jam?: number
  ratePerJam?: number
  flat?: number
}

export interface ChannelDef {
  id: string               // 'offline', 'shopee', 'tokopedia', …
  nama: string
  feeMultiplier: number    // offline = 1; Shopee ≈ 1.2
}

export interface SettingsV2 {
  failureSpreadPct: number
  testLayerPct: number
  marginMultipliers: Record<MarginTier, number>
  resellerBulkMultiplier: number
  channels: ChannelDef[]
}

/** Pemakaian material di satu plate — nilai SUDAH resolved (dari profile/katalog/override). */
export interface MaterialUsageV2 {
  gramasi: number
  hppPerGram: number
  jualPerGram: number
  failureRatePct: number
  materialProfileId?: string
}

export interface PlateInputV2 {
  namaPart?: string
  durasiJam: number
  mesinPerJam: number      // resolved dari printer profile
  materials: MaterialUsageV2[]
  printerProfileId?: string
}

export interface KalkulasiInputV2 {
  plates: PlateInputV2[]
  batch: number
  komponen: KomponenItem[]
  labor: LaborItem[]
  customRiskPct?: number   // override failure rate SEMUA material
  hargaAktual?: { channelId: string; harga: number }
}

export interface HargaChannelV2 {
  channelId: string
  A: number
  B: number
  C: number
  margin: number           // margin % pada harga A (net setelah fee) vs hppTotal
}

/** Semua nilai TIDAK dibulatkan. */
export interface HasilKalkulasiV2 {
  hppProduksi: number
  hppKomponen: number
  hppLabor: number
  hppTotal: number
  jualBase: number
  floorPrice: number
  hargaPerChannel: HargaChannelV2[]
  resellerStd: number
  resellerBulk: number
  status: KalkulasiStatus
}
```

- [ ] **Step 2: Failing tests**

File `packages/kalkulator-core/src/formula-v2.test.ts`:

```ts
import { hitungKalkulasiV2 } from './formula-v2'
import type { SettingsV2, KalkulasiInputV2 } from './types'

const SETTINGS: SettingsV2 = {
  failureSpreadPct: 50,
  testLayerPct: 0,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
  channels: [
    { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
    { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
  ],
}

function baseInput(over: Partial<KalkulasiInputV2> = {}): KalkulasiInputV2 {
  return {
    plates: [{
      durasiJam: 1,
      mesinPerJam: 1000,
      materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 0 }],
    }],
    batch: 1,
    komponen: [],
    labor: [],
    ...over,
  }
}

describe('hitungKalkulasiV2', () => {
  it('single material tanpa failure: hpp & floor dasar', () => {
    const r = hitungKalkulasiV2(baseInput(), SETTINGS)
    expect(r.hppProduksi).toBeCloseTo(4000)   // 10×300 + 1000
    expect(r.floorPrice).toBeCloseTo(10000)   // 10×900 + 1000
  })

  it('failure rate = weighted average berdasarkan gramasi', () => {
    const r = hitungKalkulasiV2(baseInput({
      plates: [{
        durasiJam: 2, mesinPerJam: 4000,
        materials: [
          { gramasi: 80, hppPerGram: 300, jualPerGram: 900, failureRatePct: 10 },
          { gramasi: 20, hppPerGram: 500, jualPerGram: 1200, failureRatePct: 30 },
        ],
      }],
    }), SETTINGS)
    // matHpp = 24000 + 10000 = 34000; mesin = 8000
    // weighted failure = (80×10 + 20×30)/100 = 14% → failureCost = 42000 × 0.14 = 5880
    // spread 50 → HPP kena 2940
    expect(r.hppProduksi).toBeCloseTo(34000 + 8000 + 2940)
  })

  it('customRiskPct override semua failure rate material', () => {
    const r = hitungKalkulasiV2(baseInput({
      customRiskPct: 20,
      plates: [{
        durasiJam: 1, mesinPerJam: 1000,
        materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 5 }],
      }],
    }), SETTINGS)
    // failureCost = 4000 × 0.20 = 800 → HPP kena 400
    expect(r.hppProduksi).toBeCloseTo(4400)
  })

  it('komponen & labor dijumlahkan ke hpp dan floor', () => {
    const r = hitungKalkulasiV2(baseInput({
      komponen: [{ nama: 'Packing', harga: 1500, qty: 1 }, { nama: 'Magnet', harga: 500, qty: 4 }],
      labor: [
        { nama: 'Sanding', jam: 1.5, ratePerJam: 35000 },
        { nama: 'Consumables', flat: 10000 },
      ],
    }), SETTINGS)
    expect(r.hppKomponen).toBeCloseTo(3500)
    expect(r.hppLabor).toBeCloseTo(62500)
    expect(r.hppTotal).toBeCloseTo(4000 + 3500 + 62500)
    expect(r.floorPrice).toBeCloseTo(10000 + 3500 + 62500)
  })

  it('harga per channel = floor × margin × fee; margin dihitung dari net', () => {
    const r = hitungKalkulasiV2(baseInput(), SETTINGS)
    const offline = r.hargaPerChannel.find(c => c.channelId === 'offline')!
    const shopee = r.hargaPerChannel.find(c => c.channelId === 'shopee')!
    expect(offline.A).toBeCloseTo(11000)
    expect(offline.C).toBeCloseTo(20000)
    expect(shopee.A).toBeCloseTo(13200)
    // net Shopee A = 13200/1.2 = 11000; margin = (11000−4000)/11000
    expect(shopee.margin).toBeCloseTo(((11000 - 4000) / 11000) * 100)
    expect(r.resellerStd).toBeCloseTo(11000)
    expect(r.resellerBulk).toBeCloseTo(10500)
  })

  it('batch membagi biaya produksi', () => {
    const r = hitungKalkulasiV2(baseInput({
      batch: 10,
      plates: [{
        durasiJam: 10, mesinPerJam: 1000,
        materials: [{ gramasi: 100, hppPerGram: 300, jualPerGram: 900, failureRatePct: 0 }],
      }],
    }), SETTINGS)
    expect(r.hppProduksi).toBeCloseTo(4000)
  })

  it('status per channel: AMAN / BAWAH_REKM / RUGI / TIDAK_DISET', () => {
    expect(hitungKalkulasiV2(baseInput(), SETTINGS).status).toBe('TIDAK_DISET')
    expect(hitungKalkulasiV2(baseInput({ hargaAktual: { channelId: 'shopee', harga: 13200 } }), SETTINGS).status).toBe('AMAN')
    expect(hitungKalkulasiV2(baseInput({ hargaAktual: { channelId: 'shopee', harga: 10000 } }), SETTINGS).status).toBe('BAWAH_REKM')
    expect(hitungKalkulasiV2(baseInput({ hargaAktual: { channelId: 'shopee', harga: 9999 } }), SETTINGS).status).toBe('RUGI')
  })

  it('gramasi total 0 tidak menghasilkan NaN', () => {
    const r = hitungKalkulasiV2(baseInput({
      plates: [{ durasiJam: 1, mesinPerJam: 1000, materials: [] }],
    }), SETTINGS)
    expect(r.hppProduksi).toBeCloseTo(1000)
    expect(Number.isNaN(r.hppTotal)).toBe(false)
  })
})
```

Run: `pnpm --filter @3pb/kalkulator-core test` → FAIL (module not found).

- [ ] **Step 3: Implementasi `formula-v2.ts`**

```ts
import type {
  KalkulasiInputV2, SettingsV2, HasilKalkulasiV2, PlateInputV2,
  KalkulasiStatus, HargaChannelV2,
} from './types'

/**
 * Formula HPP v2 — settings-driven, tanpa pembulatan.
 * Konsep inti sama dengan legacy: dua jalur harga material (modal vs jual),
 * failure cost dibelah spread (owner vs customer), test layer material-only.
 */
export function hitungKalkulasiV2(input: KalkulasiInputV2, settings: SettingsV2): HasilKalkulasiV2 {
  const safeBatch = Math.max(1, input.batch)
  const spread = settings.failureSpreadPct / 100
  const testPct = settings.testLayerPct / 100

  function plateCost(p: PlateInputV2): { hpp: number; jual: number } {
    const mesin = p.durasiJam * p.mesinPerJam
    let matHpp = 0, matJual = 0, gramTotal = 0, failWeighted = 0
    for (const m of p.materials) {
      matHpp += m.gramasi * m.hppPerGram
      matJual += m.gramasi * Math.max(m.jualPerGram, m.hppPerGram)
      gramTotal += m.gramasi
      failWeighted += m.gramasi * m.failureRatePct
    }
    const failureRatePct = input.customRiskPct ?? (gramTotal > 0 ? failWeighted / gramTotal : 0)
    const failureCost = (matHpp + mesin) * (failureRatePct / 100)
    const testCost = matHpp * testPct
    return {
      hpp:  matHpp  + mesin + failureCost * (1 - spread) + testCost,
      jual: matJual + mesin + failureCost * spread,
    }
  }

  let hppBatch = 0, jualBatch = 0
  for (const p of input.plates) {
    const c = plateCost(p)
    hppBatch += c.hpp
    jualBatch += c.jual
  }
  const hppProduksi = hppBatch / safeBatch
  const jualBase = jualBatch / safeBatch

  const hppKomponen = input.komponen.reduce((s, k) => s + k.harga * k.qty, 0)
  const hppLabor = input.labor.reduce((s, l) => s + (l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0), 0)

  const hppTotal = hppProduksi + hppKomponen + hppLabor
  const floorPrice = jualBase + hppKomponen + hppLabor

  const m = settings.marginMultipliers
  const hargaPerChannel: HargaChannelV2[] = settings.channels.map(ch => {
    const A = floorPrice * m.A * ch.feeMultiplier
    const net = ch.feeMultiplier > 0 ? A / ch.feeMultiplier : 0
    return {
      channelId: ch.id,
      A,
      B: floorPrice * m.B * ch.feeMultiplier,
      C: floorPrice * m.C * ch.feeMultiplier,
      margin: net > 0 ? ((net - hppTotal) / net) * 100 : 0,
    }
  })

  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (input.hargaAktual) {
    const ch = hargaPerChannel.find(c => c.channelId === input.hargaAktual!.channelId)
    if (ch) {
      if (input.hargaAktual.harga >= ch.A) status = 'AMAN'
      else if (input.hargaAktual.harga >= floorPrice) status = 'BAWAH_REKM'
      else status = 'RUGI'
    }
  }

  return {
    hppProduksi, hppKomponen, hppLabor, hppTotal, jualBase, floorPrice,
    hargaPerChannel,
    resellerStd: floorPrice * m.A,
    resellerBulk: floorPrice * settings.resellerBulkMultiplier,
    status,
  }
}
```

Tambah di `index.ts`: `export { hitungKalkulasiV2 } from './formula-v2'`.

- [ ] **Step 4: Verifikasi pass** — `pnpm --filter @3pb/kalkulator-core test` → semua PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/kalkulator-core
git commit -m "feat(kalkulator-core): formula v2 — material/printer profile, komponen & labor generik, harga per channel" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Adapter legacy→v2 + legacy `hitungKalkulasi` jadi wrapper

Existing test suite (14 test) adalah golden test: setelah task ini, `hitungKalkulasi` mendelegasikan ke v2 dan SEMUA test lama harus tetap hijau tanpa diubah.

**Files:**
- Create: `packages/kalkulator-core/src/adapter.ts`
- Test: `packages/kalkulator-core/src/adapter.test.ts`
- Modify: `packages/kalkulator-core/src/formula.ts` (rewrite jadi wrapper)
- Modify: `packages/kalkulator-core/src/index.ts`

**Interfaces:**
- Consumes: `hitungKalkulasiV2` (Task 9), signature `hitungKalkulasi` (Task 7).
- Produces: `legacyPlateToV2(plate, rates)`, `legacyKomponenToV2(aksesori, rates)`, `helmToLabor(helm?)`, `legacySettingsToV2(rates)`, tipe `LegacyAksesori`. `hitungKalkulasi` output & signature TIDAK berubah dari Task 7.

- [ ] **Step 1: Failing test adapter**

File `packages/kalkulator-core/src/adapter.test.ts`:

```ts
import { legacyKomponenToV2, helmToLabor, legacySettingsToV2 } from './adapter'
import type { KalkulatorRates, HelmOptions } from './types'

const RATES: KalkulatorRates = {
  fdmHppPerGram: 300, fdmJualPerGram: 900,
  slaHppPerGram: 1750, slaJualPerGram: 3500,
  mesinPerJam: 4000, adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
  gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
  switchPerPcs: 2500, labelPerLembar: 750,
  failureRatePct: 12, failureSpreadPct: 50, testLayerPct: 5,
  preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
}

describe('legacyKomponenToV2', () => {
  it('memetakan packing/gantungan/switch/label/kustom jadi KomponenItem', () => {
    const items = legacyKomponenToV2({
      packingType: 'S', gantunganType: 'kew_kew', switchQty: 3, hasLabel: true,
      komponenKustom: [{ nama: 'Magnet', harga: 500, qty: 4 }],
    }, RATES)
    const total = items.reduce((s, k) => s + k.harga * k.qty, 0)
    expect(total).toBe(1500 + 900 + 3 * 2500 + 750 + 2000)
  })

  it('tipe packing/gantungan tak dikenal → dilewati (perilaku legacy ?? 0)', () => {
    const items = legacyKomponenToV2({
      packingType: 'XXL', gantunganType: 'unknown', switchQty: 0, hasLabel: false, komponenKustom: [],
    }, RATES)
    expect(items).toHaveLength(0)
  })
})

describe('helmToLabor', () => {
  it('RAW / undefined → tanpa labor', () => {
    expect(helmToLabor(undefined)).toHaveLength(0)
    const raw: HelmOptions = { finishType: 'RAW', jamSanding: 2, jamPainting: 2, jamAssembly: 1, flatFinishingCost: 55000, preparerRatePerJam: 35000, finisherRatePerJam: 75000 }
    expect(helmToLabor(raw)).toHaveLength(0)
  })

  it('FINISHING → preparer + finisher + consumables (total = perilaku legacy)', () => {
    const fin: HelmOptions = { finishType: 'FINISHING', jamSanding: 1, jamPainting: 1, jamAssembly: 0, flatFinishingCost: 10000, preparerRatePerJam: 35000, finisherRatePerJam: 75000 }
    const labor = helmToLabor(fin)
    const total = labor.reduce((s, l) => s + (l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0), 0)
    expect(total).toBe(120000)
  })
})

describe('legacySettingsToV2', () => {
  it('channel offline (fee 1) + shopee (fee adminEcommerce)', () => {
    const s = legacySettingsToV2(RATES)
    expect(s.channels).toEqual([
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
    ])
    expect(s.marginMultipliers).toEqual({ A: 1.1, B: 1.5, C: 2.0 })
  })
})
```

Run: `pnpm --filter @3pb/kalkulator-core test` → FAIL (module not found).

- [ ] **Step 2: Implementasi `adapter.ts`**

```ts
import type {
  PlateInput, PlateInputV2, MaterialUsageV2, KalkulatorRates, HelmOptions,
  KomponenItem, LaborItem, SettingsV2,
} from './types'

export interface LegacyAksesori {
  packingType?: string
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  komponenKustom: { nama?: string; harga: number; qty: number }[]
}

export function legacyPlateToV2(p: PlateInput, rates: KalkulatorRates): PlateInputV2 {
  const isSLA = p.tipe === 'SLA'
  const baseHpp = isSLA ? rates.slaHppPerGram : rates.fdmHppPerGram
  const baseJual = isSLA ? rates.slaJualPerGram : rates.fdmJualPerGram
  const toUsage = (gramasi: number, override?: number): MaterialUsageV2 => ({
    gramasi,
    hppPerGram: override ?? baseHpp,
    jualPerGram: Math.max(baseJual, override ?? baseJual),
    failureRatePct: rates.failureRatePct,
  })
  const materials = (p.materials && p.materials.length > 0)
    ? p.materials.map(m => toUsage(m.gramasi, m.hargaPerGram))
    : [toUsage(p.gramasi ?? 0, p.hargaPerGram)]
  return { namaPart: p.namaPart, durasiJam: p.durasiJam, mesinPerJam: rates.mesinPerJam, materials }
}

export function legacyKomponenToV2(aksesori: LegacyAksesori, rates: KalkulatorRates): KomponenItem[] {
  const items: KomponenItem[] = []
  if (aksesori.packingType && rates.packing[aksesori.packingType] !== undefined) {
    items.push({ nama: `Packing ${aksesori.packingType}`, harga: rates.packing[aksesori.packingType], qty: 1 })
  }
  if (aksesori.gantunganType && rates.gantungan[aksesori.gantunganType] !== undefined) {
    items.push({ nama: `Gantungan ${aksesori.gantunganType}`, harga: rates.gantungan[aksesori.gantunganType], qty: 1 })
  }
  if (aksesori.switchQty > 0) {
    items.push({ nama: 'Switch', harga: rates.switchPerPcs, qty: aksesori.switchQty })
  }
  if (aksesori.hasLabel) {
    items.push({ nama: 'Label', harga: rates.labelPerLembar, qty: 1 })
  }
  for (const k of aksesori.komponenKustom) {
    items.push({ nama: k.nama ?? 'Komponen', harga: k.harga, qty: k.qty })
  }
  return items
}

export function helmToLabor(helm?: HelmOptions): LaborItem[] {
  if (!helm || helm.finishType !== 'FINISHING') return []
  return [
    { nama: 'Preparer (sanding + assembly)', jam: helm.jamSanding + helm.jamAssembly, ratePerJam: helm.preparerRatePerJam },
    { nama: 'Finisher (painting)', jam: helm.jamPainting, ratePerJam: helm.finisherRatePerJam },
    { nama: 'Consumables finishing', flat: helm.flatFinishingCost },
  ]
}

export function legacySettingsToV2(rates: KalkulatorRates): SettingsV2 {
  return {
    failureSpreadPct: rates.failureSpreadPct,
    testLayerPct: rates.testLayerPct,
    marginMultipliers: rates.marginMultipliers,
    resellerBulkMultiplier: rates.resellerBulkMultiplier,
    channels: [
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: rates.adminEcommerce },
    ],
  }
}
```

Run: `pnpm --filter @3pb/kalkulator-core test` → adapter tests PASS (formula tests masih pakai implementasi lama, tetap PASS).

- [ ] **Step 3: Rewrite `formula.ts` jadi wrapper**

Ganti SELURUH isi `packages/kalkulator-core/src/formula.ts`:

```ts
import type {
  PlateInput, KalkulatorRates, HasilKalkulasi, HelmOptions, KalkulasiStatus,
} from './types'
import { hitungKalkulasiV2 } from './formula-v2'
import {
  legacyPlateToV2, legacyKomponenToV2, helmToLabor, legacySettingsToV2,
  type LegacyAksesori,
} from './adapter'

/**
 * API legacy — delegasi ke hitungKalkulasiV2 lewat adapter, lalu presenter
 * mereproduksi pembulatan lama persis (hppFinishing dibulatkan SEBELUM
 * dijumlahkan, sesuai perilaku sebelum refactor).
 */
export function hitungKalkulasi(
  plates: PlateInput[],
  aksesori: LegacyAksesori,
  batch: number,
  rates: KalkulatorRates,
  hargaShopeeAktual?: number,
  customRiskPct?: number,
  helmOptions?: HelmOptions,
): HasilKalkulasi {
  const v2 = hitungKalkulasiV2({
    plates: plates.map(p => legacyPlateToV2(p, rates)),
    batch,
    komponen: legacyKomponenToV2(aksesori, rates),
    labor: helmToLabor(helmOptions),
    customRiskPct,
  }, legacySettingsToV2(rates))

  const hppFinishing = Math.round(v2.hppLabor)
  const hppTotal = v2.hppProduksi + v2.hppKomponen + hppFinishing
  const floorPrice = v2.jualBase + v2.hppKomponen + hppFinishing

  const m = rates.marginMultipliers
  const offlineA = floorPrice * m.A
  const offlineB = floorPrice * m.B
  const offlineC = floorPrice * m.C
  const shopeeA = offlineA * rates.adminEcommerce
  const shopeeB = offlineB * rates.adminEcommerce
  const shopeeC = offlineC * rates.adminEcommerce

  const marginOfflineA = offlineA > 0 ? ((offlineA - hppTotal) / offlineA) * 100 : 0
  const netShopeeA = shopeeA / rates.adminEcommerce
  const marginShopeeA = netShopeeA > 0 ? ((netShopeeA - hppTotal) / netShopeeA) * 100 : 0

  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (hargaShopeeAktual !== undefined) {
    if (hargaShopeeAktual >= shopeeA) status = 'AMAN'
    else if (hargaShopeeAktual >= floorPrice) status = 'BAWAH_REKM'
    else status = 'RUGI'
  }

  return {
    hppProduksi: Math.round(v2.hppProduksi),
    hppKomponen: Math.round(v2.hppKomponen),
    hppFinishing,
    hppTotal: Math.round(hppTotal),
    floorPrice: Math.round(floorPrice),
    offlineA: Math.round(offlineA),
    offlineB: Math.round(offlineB),
    offlineC: Math.round(offlineC),
    shopeeA: Math.round(shopeeA),
    shopeeB: Math.round(shopeeB),
    shopeeC: Math.round(shopeeC),
    resellerStd: Math.round(offlineA),
    resellerBulk: Math.round(floorPrice * rates.resellerBulkMultiplier),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA: Math.round(marginShopeeA * 10) / 10,
    status,
  }
}
```

Tambah di `index.ts`:

```ts
export {
  legacyPlateToV2, legacyKomponenToV2, helmToLabor, legacySettingsToV2,
} from './adapter'
export type { LegacyAksesori } from './adapter'
```

- [ ] **Step 4: Verifikasi golden test — SEMUA test lama harus hijau tanpa diedit**

```bash
pnpm --filter @3pb/kalkulator-core test
pnpm turbo test
pnpm --filter shopee-dashboard build
```

Expected: seluruh suite PASS (formula legacy 14 + v2 8 + printer 2 + adapter 5), build dashboard sukses. Kalau ada test formula legacy yang gagal, itu bug di adapter/wrapper — perbaiki adapter, JANGAN ubah test lama.

- [ ] **Step 5: Commit**

```bash
git add packages/kalkulator-core
git commit -m "refactor(kalkulator-core): hitungKalkulasi jadi wrapper di atas v2 via adapter — golden test hijau" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Verifikasi akhir & dokumentasi

**Files:**
- Modify: `docs/kalkulator-formula.md` (tandai status implementasi)
- Modify: `docs/superpowers/specs/2026-07-08-saas-3pb-design.md` (tidak wajib — hanya jika ada deviasi)

**Interfaces:**
- Consumes: semua task sebelumnya.

- [ ] **Step 1: Jalankan verifikasi penuh dari root**

```bash
pnpm turbo test
pnpm turbo lint
pnpm turbo build
```

Expected: semua PASS. Lint mungkin memunculkan warning pre-existing — hanya error BARU yang harus diperbaiki.

- [ ] **Step 2: Smoke test manual dashboard**

```bash
pnpm --filter shopee-dashboard dev
```

Buka halaman kalkulator internal, buat kalkulasi FDM sederhana (mis. 21 g, 1,17 jam), pastikan HPP ≈ nilai sebelum refactor (10.980 dengan rates default). Matikan dev server setelahnya.

- [ ] **Step 3: Update dokumentasi**

Di `docs/kalkulator-formula.md`, tambah di bagian paling atas setelah heading:

```markdown
> **Status:** Fase 0 selesai — formula sudah di `packages/kalkulator-core` (legacy `hitungKalkulasi` = wrapper di atas `hitungKalkulasiV2`). Adopsi penuh v2 di dashboard internal (UI settings, migrasi DB helm→labor) menyusul di plan Fase 0b.
```

- [ ] **Step 4: Commit penutup**

```bash
git add -A
git commit -m "docs: tandai Fase 0 monorepo + kalkulator-core selesai" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Laporkan ke user**

Ringkas hasil + ingatkan: (1) deploy internal berikutnya pakai `./apps/dashboard/deploy.sh` dari mana pun (context sudah root-aware) — jalankan HANYA atas perintah user; (2) plan berikutnya: Fase 0b (adopsi v2 internal: settings printer/material profile, migrasi helm→labor, komponen preset) lalu Fase 1 (app SaaS).

---

## Catatan scope

- **Di dalam plan ini:** monorepo, ekstraksi, bug fix SLA multi-material, rates-ification margin, formula v2 + adapter/wrapper. Dashboard internal tidak berubah perilaku (kecuali bug fix).
- **Sengaja DI LUAR plan ini (Fase 0b):** Prisma migration helm→labor & printer/material profile tables, UI settings baru, penghapusan field gantungan/switch/label dari UI internal, halaman kalkulator memakai v2 langsung.
- **Fase 1 (SaaS)** menyusul setelah 0b: `apps/saas` baru, auth, entitlement, payment.
