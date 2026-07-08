# Helm Kalkulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend kalkulator existing untuk mendukung produk helm/topeng dengan dua varian (RAW & FINISHING), labor model Preparer/Finisher, dan tier preset jam yang dapat di-override.

**Architecture:** Semua perubahan bersifat additive — 7 field baru di `KalkulasiHarga`, parameter opsional `helmOptions` di `hitungKalkulasi`, dan conditional UI sections. Existing SIMPLE products tidak terpengaruh; semua field baru punya default.

**Tech Stack:** Prisma (migration), TypeScript (formula + types), React (form UI), vitest (unit tests), existing kalkulator infrastructure di `lib/kalkulator/`.

---

## Codebase Context (Baca Ini Dulu)

Project: `/Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard`

**Key files:**
- `lib/kalkulator/types.ts` — semua TypeScript types
- `lib/kalkulator/formula.ts` — `hitungKalkulasi()` pure function
- `lib/kalkulator/formula.test.ts` — unit tests (vitest)
- `lib/kalkulator/rates.ts` — `loadRates()` baca dari Config table (`kalk.*` keys)
- `lib/kalkulator/service.ts` — `createKalkulasi`, `updateKalkulasi`, `buildHasil`
- `prisma/schema.prisma` — `KalkulasiHarga` model di baris 185
- `components/kalkulator/KalkulasiForm.tsx` — form UI
- `components/kalkulator/HasilPanel.tsx` — hasil kalkulasi display

**Pattern rates:** Semua rates di-store di `Config` table dengan prefix `kalk.`. `loadRates()` baca config dengan default fallback. Kunci baru: `kalk.preparer.perJam` (35000) dan `kalk.finisher.perJam` (75000).

**Pattern formula:** `hitungKalkulasi(plates, aksesori, batch, rates, marginTier, hargaShopeeAktual?, customRiskPct?)` — pure function, returns `HasilKalkulasi`. Perubahan: tambah optional param ke-8 `helmOptions?: HelmOptions`.

---

## File Structure

```
prisma/schema.prisma              MODIFY — +7 fields di KalkulasiHarga
lib/kalkulator/types.ts           MODIFY — +types baru, extend existing interfaces
lib/kalkulator/formula.ts         MODIFY — extend hitungKalkulasi
lib/kalkulator/formula.test.ts    MODIFY — +tests untuk helm formula
lib/kalkulator/rates.ts           MODIFY — +preparerRatePerJam, finisherRatePerJam
lib/kalkulator/service.ts         MODIFY — extend buildHasil, create, update, duplicate
components/kalkulator/KalkulasiForm.tsx   MODIFY — +helm UI sections
components/kalkulator/HasilPanel.tsx      MODIFY — +hppFinishing breakdown display
```

---

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

Context: Tambah 7 field baru ke `KalkulasiHarga` (baris 185). Semua punya `@default` sehingga existing records tidak perlu backfill. `hppFinishing` di-store seperti `hppProduksi` — computed + cached.

- [ ] **Step 1: Tambah 7 field ke `KalkulasiHarga` di `prisma/schema.prisma`**

Setelah baris `status String @default("TIDAK_DISET")` (baris 212), tambahkan:

```prisma
  // Helm/Topeng fields — default "SIMPLE"/"RAW" agar backward-compatible
  produktType       String  @default("SIMPLE")   // "SIMPLE" | "HELM"
  finishType        String  @default("RAW")       // "RAW" | "FINISHING"
  jamSanding        Float   @default(0)           // Preparer hours (sanding + magnet)
  jamPainting       Float   @default(0)           // Finisher hours (painting)
  jamAssembly       Float   @default(0)           // Preparer hours (assembly)
  flatFinishingCost Float   @default(0)           // cat, primer, consumables flat
  hppFinishing      Float   @default(0)           // computed: labor + consumables
```

- [ ] **Step 2: Generate dan jalankan migration**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx prisma migrate dev --name "add_helm_kalkulator_fields"
```

Expected output: `✓ Your database is now in sync with your schema.`

- [ ] **Step 3: Verify Prisma client ter-generate**

```bash
npx prisma generate 2>&1 | tail -3
```

Expected: `✓ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(kalkulator): add helm fields to KalkulasiHarga schema"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `lib/kalkulator/types.ts`

Context: Tambah types baru, extend `KalkulasiInput`, `KalkulatorRates`, `HasilKalkulasi`, dan `KalkulasiData`. Semua additive — tidak ada breaking changes ke existing fields.

- [ ] **Step 1: Tambah tipe baru dan extend interfaces di `lib/kalkulator/types.ts`**

Setelah baris `export type KalkulasiStatus = ...`, tambahkan:

```typescript
export type ProduktType = 'SIMPLE' | 'HELM'
export type FinishType  = 'RAW' | 'FINISHING'
export type HelmTier    = 'MINIMAL' | 'LIGHT' | 'MEDIUM' | 'HEAVY'

export interface HelmOptions {
  finishType: FinishType
  jamSanding: number
  jamPainting: number
  jamAssembly: number
  flatFinishingCost: number
  preparerRatePerJam: number   // from KalkulatorRates
  finisherRatePerJam: number   // from KalkulatorRates
}

export const HELM_TIER_DEFAULTS: Record<HelmTier, { jamSanding: number; jamPainting: number; jamAssembly: number }> = {
  MINIMAL: { jamSanding: 0.5, jamPainting: 0.5,  jamAssembly: 0.25 },
  LIGHT:   { jamSanding: 1.5, jamPainting: 1.0,  jamAssembly: 0.50 },
  MEDIUM:  { jamSanding: 2.5, jamPainting: 2.0,  jamAssembly: 0.75 },
  HEAVY:   { jamSanding: 4.0, jamPainting: 3.5,  jamAssembly: 1.00 },
}
```

Di `HasilKalkulasi` interface, tambah field setelah `hppKomponen`:
```typescript
  hppFinishing: number          // 0 untuk SIMPLE, labor+consumables untuk FINISHING
```

Di `KalkulatorRates` interface, tambah setelah `testLayerPct`:
```typescript
  preparerRatePerJam: number    // default: 35000
  finisherRatePerJam: number    // default: 75000
```

Di `KalkulasiInput` interface, tambah setelah `komponenKustom`:
```typescript
  produktType?: ProduktType          // default: 'SIMPLE'
  finishType?: FinishType            // hanya untuk HELM
  jamSanding?: number
  jamPainting?: number
  jamAssembly?: number
  flatFinishingCost?: number
```

Di `KalkulasiData` interface (extends HasilKalkulasi), tambah setelah `komponenKustom`:
```typescript
  produktType: ProduktType
  finishType: FinishType
  jamSanding: number
  jamPainting: number
  jamAssembly: number
  flatFinishingCost: number
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | grep "kalkulator/types" || echo "no errors in types"
```

Expected: tidak ada error dari file ini (ada error di file lain yang belum diupdate — itu normal, akan difix di task berikutnya).

- [ ] **Step 3: Commit**

```bash
git add lib/kalkulator/types.ts
git commit -m "feat(kalkulator): add ProduktType, FinishType, HelmOptions types"
```

---

### Task 3: Formula Update + Tests

**Files:**
- Modify: `lib/kalkulator/formula.ts`
- Modify: `lib/kalkulator/formula.test.ts`

Context: Tambah optional param `helmOptions` ke `hitungKalkulasi`. Kalau null/undefined → perilaku lama persis. Kalau ada dan `finishType === 'FINISHING'` → hitung `hppFinishing` dan tambahkan ke `hppTotal` dan `floorPrice`.

- [ ] **Step 1: Tulis failing test dulu di `lib/kalkulator/formula.test.ts`**

Tambah di akhir file:

```typescript
describe('hitungKalkulasi — helm finishing', () => {
  it('SIMPLE product: hppFinishing = 0, hppTotal unchanged', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, 'A'
    )
    expect(result.hppFinishing).toBe(0)
  })

  it('HELM RAW: hppFinishing = 0', () => {
    const helmRaw: import('./types').HelmOptions = {
      finishType: 'RAW',
      jamSanding: 2.5, jamPainting: 2.0, jamAssembly: 0.75,
      flatFinishingCost: 55000,
      preparerRatePerJam: 35000,
      finisherRatePerJam: 75000,
    }
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, 'A', undefined, undefined, helmRaw
    )
    expect(result.hppFinishing).toBe(0)
  })

  it('HELM FINISHING: hppFinishing = labor + consumables', () => {
    // jamSanding=1, jamAssembly=0 (preparer @35000) + jamPainting=1 (finisher @75000) + flat=10000
    // = 1*35000 + 1*75000 + 10000 = 120000
    const helmFin: import('./types').HelmOptions = {
      finishType: 'FINISHING',
      jamSanding: 1, jamPainting: 1, jamAssembly: 0,
      flatFinishingCost: 10000,
      preparerRatePerJam: 35000,
      finisherRatePerJam: 75000,
    }
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, 'A', undefined, undefined, helmFin
    )
    expect(result.hppFinishing).toBe(120000)
  })

  it('HELM FINISHING: hppTotal includes hppFinishing', () => {
    const base = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, 'A'
    )
    const helmFin: import('./types').HelmOptions = {
      finishType: 'FINISHING',
      jamSanding: 1, jamPainting: 1, jamAssembly: 0,
      flatFinishingCost: 10000,
      preparerRatePerJam: 35000,
      finisherRatePerJam: 75000,
    }
    const withHelm = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, 'A', undefined, undefined, helmFin
    )
    expect(withHelm.hppTotal).toBe(base.hppTotal + 120000)
    expect(withHelm.floorPrice).toBeGreaterThan(base.floorPrice)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan FAIL**

```bash
npx vitest run lib/kalkulator/formula.test.ts 2>&1 | tail -15
```

Expected: FAIL — `hppFinishing` belum ada.

- [ ] **Step 3: Update `lib/kalkulator/formula.ts`**

Ganti signature fungsi:
```typescript
import type {
  PlateInput, KalkulasiStatus, KalkulatorRates, HasilKalkulasi, MarginTier, HelmOptions
} from './types'

// ...

export function hitungKalkulasi(
  plates: PlateInput[],
  aksesori: AksesoriInput,
  batch: number,
  rates: KalkulatorRates,
  marginTier: MarginTier,
  hargaShopeeAktual?: number,
  customRiskPct?: number,
  helmOptions?: HelmOptions,        // NEW — optional, null = SIMPLE product
): HasilKalkulasi {
```

Setelah baris `const hppTotal = hppProduksi + hppKomponen`, tambahkan:
```typescript
  // Helm finishing labor + consumables (only when FINISHING)
  const hppFinishing = (helmOptions?.finishType === 'FINISHING')
    ? Math.round(
        (helmOptions.jamSanding + helmOptions.jamAssembly) * helmOptions.preparerRatePerJam
        + helmOptions.jamPainting * helmOptions.finisherRatePerJam
        + helmOptions.flatFinishingCost
      )
    : 0

  const hppTotalWithFinishing = hppTotal + hppFinishing
  const floorPriceWithFinishing = floorPrice + hppFinishing
```

Ganti baris `const floorPrice = jualBase + hppKomponen` ke:
```typescript
  const floorPrice = jualBase + hppKomponen   // base, sebelum finishing
```

Lalu ganti semua penggunaan `hppTotal` dan `floorPrice` di pricing calculations dengan `hppTotalWithFinishing` dan `floorPriceWithFinishing`:
```typescript
  const offlineA = floorPriceWithFinishing * MARGIN_MULTIPLIERS.A
  const offlineB = floorPriceWithFinishing * MARGIN_MULTIPLIERS.B
  const offlineC = floorPriceWithFinishing * MARGIN_MULTIPLIERS.C
  const shopeeA  = offlineA * rates.adminEcommerce
  const shopeeB  = offlineB * rates.adminEcommerce
  const shopeeC  = offlineC * rates.adminEcommerce
  const resellerStd  = offlineA
  const resellerBulk = floorPriceWithFinishing * 1.05

  const marginOfflineA = offlineA > 0
    ? ((offlineA - hppTotalWithFinishing) / offlineA) * 100
    : 0
  const netShopeeA = shopeeA / rates.adminEcommerce
  const marginShopeeA = netShopeeA > 0
    ? ((netShopeeA - hppTotalWithFinishing) / netShopeeA) * 100
    : 0

  // status check juga pakai floorPriceWithFinishing
  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (hargaShopeeAktual !== undefined) {
    if (hargaShopeeAktual >= shopeeA) status = 'AMAN'
    else if (hargaShopeeAktual >= floorPriceWithFinishing) status = 'BAWAH_REKM'
    else status = 'RUGI'
  }
```

Di `return {}`, ganti `hppTotal` dan `floorPrice` dengan versi with-finishing, tambah `hppFinishing`:
```typescript
  return {
    hppProduksi:    Math.round(hppProduksi),
    hppKomponen:    Math.round(hppKomponen),
    hppFinishing,                                // already rounded above
    hppTotal:       Math.round(hppTotalWithFinishing),
    floorPrice:     Math.round(floorPriceWithFinishing),
    offlineA:  Math.round(offlineA),
    offlineB:  Math.round(offlineB),
    offlineC:  Math.round(offlineC),
    shopeeA:   Math.round(shopeeA),
    shopeeB:   Math.round(shopeeB),
    shopeeC:   Math.round(shopeeC),
    resellerStd:   Math.round(resellerStd),
    resellerBulk:  Math.round(resellerBulk),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA:  Math.round(marginShopeeA * 10) / 10,
    status,
  }
```

- [ ] **Step 4: Jalankan test, pastikan PASS**

```bash
npx vitest run lib/kalkulator/formula.test.ts 2>&1 | tail -15
```

Expected: semua test PASS termasuk test lama.

- [ ] **Step 5: Commit**

```bash
git add lib/kalkulator/formula.ts lib/kalkulator/formula.test.ts
git commit -m "feat(kalkulator): extend hitungKalkulasi with helm finishing labor"
```

---

### Task 4: Rates + Service Update

**Files:**
- Modify: `lib/kalkulator/rates.ts`
- Modify: `lib/kalkulator/service.ts`

Context: Tambah dua rate baru ke `loadRates()`, lalu update `buildHasil` di service untuk pass `helmOptions` ke formula, dan update `createKalkulasi`/`updateKalkulasi` untuk save/load helm fields.

- [ ] **Step 1: Tambah rates ke `lib/kalkulator/rates.ts`**

Dalam return object `loadRates()`, tambah setelah `testLayerPct`:
```typescript
    preparerRatePerJam: parseFloat(map['kalk.preparer.perJam']  ?? '35000'),
    finisherRatePerJam: parseFloat(map['kalk.finisher.perJam']  ?? '75000'),
```

- [ ] **Step 2: Update `buildHasil` di `lib/kalkulator/service.ts`**

Ganti fungsi `buildHasil`:
```typescript
function buildHasil(input: KalkulasiInput, rates: any) {
  const helmOptions = (input.produktType === 'HELM' && input.finishType === 'FINISHING')
    ? {
        finishType: (input.finishType ?? 'RAW') as import('./types').FinishType,
        jamSanding: input.jamSanding ?? 0,
        jamPainting: input.jamPainting ?? 0,
        jamAssembly: input.jamAssembly ?? 0,
        flatFinishingCost: input.flatFinishingCost ?? 0,
        preparerRatePerJam: rates.preparerRatePerJam,
        finisherRatePerJam: rates.finisherRatePerJam,
      }
    : undefined

  return hitungKalkulasi(
    input.plates,
    {
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      komponenKustom: input.komponenKustom,
    },
    input.batch,
    rates,
    input.marginTier as MarginTier,
    input.hargaShopeeAktual,
    input.customRiskPct,
    helmOptions,
  )
}
```

- [ ] **Step 3: Update `createKalkulasi` untuk save helm fields**

Di `prisma.kalkulasiHarga.create({ data: { ... } })`, tambah setelah `hasLabel: input.hasLabel`:
```typescript
      produktType: input.produktType ?? 'SIMPLE',
      finishType: input.finishType ?? 'RAW',
      jamSanding: input.jamSanding ?? 0,
      jamPainting: input.jamPainting ?? 0,
      jamAssembly: input.jamAssembly ?? 0,
      flatFinishingCost: input.flatFinishingCost ?? 0,
```

- [ ] **Step 4: Update `updateKalkulasi` untuk save helm fields**

Di `prisma.kalkulasiHarga.update({ data: { ... } })`, tambah setelah `hasLabel: input.hasLabel`:
```typescript
      produktType: input.produktType ?? 'SIMPLE',
      finishType: input.finishType ?? 'RAW',
      jamSanding: input.jamSanding ?? 0,
      jamPainting: input.jamPainting ?? 0,
      jamAssembly: input.jamAssembly ?? 0,
      flatFinishingCost: input.flatFinishingCost ?? 0,
```

- [ ] **Step 5: Update `toKalkulasiData` untuk include helm fields**

Di `function toKalkulasiData(raw: any)`, spread tambahan setelah `produkLinks`:
```typescript
    produktType: raw.produktType ?? 'SIMPLE',
    finishType: raw.finishType ?? 'RAW',
    jamSanding: raw.jamSanding ?? 0,
    jamPainting: raw.jamPainting ?? 0,
    jamAssembly: raw.jamAssembly ?? 0,
    flatFinishingCost: raw.flatFinishingCost ?? 0,
```

- [ ] **Step 6: Update `duplicateKalkulasi` untuk copy helm fields**

Di `const input: KalkulasiInput = { ... }`, tambah setelah `komponenKustom: ...`:
```typescript
    produktType: source.produktType as import('./types').ProduktType,
    finishType: source.finishType as import('./types').FinishType,
    jamSanding: source.jamSanding,
    jamPainting: source.jamPainting,
    jamAssembly: source.jamAssembly,
    flatFinishingCost: source.flatFinishingCost,
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "kalkulator/(rates|service)" || echo "no errors"
```

- [ ] **Step 8: Commit**

```bash
git add lib/kalkulator/rates.ts lib/kalkulator/service.ts
git commit -m "feat(kalkulator): update rates and service for helm finishing support"
```

---

### Task 5: KalkulasiForm UI — Helm Section

**Files:**
- Modify: `components/kalkulator/KalkulasiForm.tsx`

Context: File ini sudah punya banyak state (`useState` untuk setiap field). Tambah 6 state baru, conditional sections, dan tier preset buttons. Baca file dulu sebelum edit.

- [ ] **Step 1: Baca file dan temukan lokasi state declarations**

```bash
grep -n "const \[" /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard/components/kalkulator/KalkulasiForm.tsx | head -20
```

- [ ] **Step 2: Tambah 6 state baru setelah state yang ada**

Setelah `const [customRiskEnabled, setCustomRiskEnabled] = useState(...)`, tambah:

```typescript
  // Helm fields
  const [produktType, setProduktType] = useState<import('@/lib/kalkulator/types').ProduktType>(
    initial?.produktType ?? 'SIMPLE'
  )
  const [finishType, setFinishType] = useState<import('@/lib/kalkulator/types').FinishType>(
    initial?.finishType ?? 'RAW'
  )
  const [jamSanding, setJamSanding] = useState<number>(initial?.jamSanding ?? 0)
  const [jamPainting, setJamPainting] = useState<number>(initial?.jamPainting ?? 0)
  const [jamAssembly, setJamAssembly] = useState<number>(initial?.jamAssembly ?? 0)
  const [flatFinishingCost, setFlatFinishingCost] = useState<number>(initial?.flatFinishingCost ?? 0)
```

- [ ] **Step 3: Tambah import HELM_TIER_DEFAULTS**

Di bagian import di atas file, tambah ke import dari `@/lib/kalkulator/types`:
```typescript
import type { ..., ProduktType, FinishType } from '@/lib/kalkulator/types'
import { HELM_TIER_DEFAULTS } from '@/lib/kalkulator/types'
```

- [ ] **Step 4: Update `handleSubmit` untuk include helm fields**

Di dalam `handleSubmit`, di bagian yang membangun `input` (lihat baris `const input = { ... }`), tambah:
```typescript
      produktType,
      finishType,
      jamSanding,
      jamPainting,
      jamAssembly,
      flatFinishingCost,
```

- [ ] **Step 5: Tambah helm sections ke JSX**

Temukan section aksesori/komponen di form. Tambah SEBELUM button submit, tapi setelah section komponen kustom, section berikut:

```tsx
{/* ── Tipe Produk ─────────────────────────────────────────── */}
<div className="space-y-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
  <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
    Tipe Produk
  </div>
  <div className="flex gap-2">
    {(['SIMPLE', 'HELM'] as const).map(t => (
      <button
        key={t}
        type="button"
        onClick={() => { setProduktType(t); if (t === 'SIMPLE') setFinishType('RAW') }}
        className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all"
        style={{
          background: produktType === t ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${produktType === t ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
          color: produktType === t ? "#a5b4fc" : "rgba(255,255,255,0.45)",
        }}
      >
        {t === 'SIMPLE' ? '🧸 Mainan / Keychain' : '🪖 Helm / Topeng'}
      </button>
    ))}
  </div>
</div>

{/* ── Helm Finishing (hanya muncul kalau HELM) ─────────────── */}
{produktType === 'HELM' && (
  <div className="space-y-4 p-4 rounded-[12px]" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
    {/* Finish Type */}
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.6)" }}>
        Finish Type
      </div>
      <div className="flex gap-2">
        {(['RAW', 'FINISHING'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFinishType(f)}
            className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all"
            style={{
              background: finishType === f ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${finishType === f ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
              color: finishType === f ? "#a5b4fc" : "rgba(255,255,255,0.45)",
            }}
          >
            {f === 'RAW' ? '🔩 RAW (as-is)' : '🎨 FINISHING'}
          </button>
        ))}
      </div>
    </div>

    {/* Labor sections — hanya kalau FINISHING */}
    {finishType === 'FINISHING' && (
      <div className="space-y-4">
        {/* Tier quick-pick */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.6)" }}>
            Tier Preset
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['MINIMAL', 'LIGHT', 'MEDIUM', 'HEAVY'] as const).map(tier => (
              <button
                key={tier}
                type="button"
                onClick={() => {
                  const d = HELM_TIER_DEFAULTS[tier]
                  setJamSanding(d.jamSanding)
                  setJamPainting(d.jamPainting)
                  setJamAssembly(d.jamAssembly)
                }}
                className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium transition-all hover:opacity-80"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
              >
                {tier}
              </button>
            ))}
          </div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            Klik tier untuk auto-fill jam. Angka bisa diedit bebas.
          </div>
        </div>

        {/* Sanding */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              🪵 Preparer — Sanding (jam)
              <span className="ml-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>@Rp35.000</span>
            </label>
            <input
              type="number" min={0} step={0.25}
              value={jamSanding || ''}
              onChange={e => setJamSanding(Number(e.target.value))}
              className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              🎨 Finisher — Painting (jam)
              <span className="ml-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>@Rp75.000</span>
            </label>
            <input
              type="number" min={0} step={0.25}
              value={jamPainting || ''}
              onChange={e => setJamPainting(Number(e.target.value))}
              className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
              placeholder="0"
            />
          </div>
        </div>

        {/* Assembly */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              🔩 Preparer — Assembly (jam)
              <span className="ml-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>@Rp35.000</span>
            </label>
            <input
              type="number" min={0} step={0.25}
              value={jamAssembly || ''}
              onChange={e => setJamAssembly(Number(e.target.value))}
              className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              🎨 Consumables (Rp)
            </label>
            <input
              type="number" min={0} step={1000}
              value={flatFinishingCost || ''}
              onChange={e => setFlatFinishingCost(Number(e.target.value))}
              className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
              placeholder="55000"
            />
          </div>
        </div>

        {/* Warning: consumables = 0 */}
        {flatFinishingCost === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] text-[11px]"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}>
            ⚠️ Biaya consumables (cat, primer) belum diisi — sudah di-include di tempat lain?
          </div>
        )}

        {/* Real-time breakdown */}
        {(jamSanding > 0 || jamPainting > 0 || jamAssembly > 0 || flatFinishingCost > 0) && (
          <div className="rounded-[8px] p-3 space-y-1 text-[11px] font-mono"
            style={{ background: "rgba(10,8,40,0.6)", border: "1px solid rgba(99,102,241,0.15)" }}>
            {jamSanding > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Sanding {jamSanding}j × Rp35.000</span>
                <span style={{ color: "#a5b4fc" }}>Rp {(jamSanding * 35000).toLocaleString('id-ID')}</span>
              </div>
            )}
            {jamPainting > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Painting {jamPainting}j × Rp75.000</span>
                <span style={{ color: "#a5b4fc" }}>Rp {(jamPainting * 75000).toLocaleString('id-ID')}</span>
              </div>
            )}
            {jamAssembly > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Assembly {jamAssembly}j × Rp35.000</span>
                <span style={{ color: "#a5b4fc" }}>Rp {(jamAssembly * 35000).toLocaleString('id-ID')}</span>
              </div>
            )}
            {flatFinishingCost > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Consumables</span>
                <span style={{ color: "#a5b4fc" }}>Rp {flatFinishingCost.toLocaleString('id-ID')}</span>
              </div>
            )}
            <div className="flex justify-between pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Total Finishing</span>
              <span style={{ color: "#4ade80", fontWeight: 700 }}>
                Rp {(
                  (jamSanding + jamAssembly) * 35000 +
                  jamPainting * 75000 +
                  flatFinishingCost
                ).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "KalkulasiForm" || echo "no errors"
```

- [ ] **Step 7: Commit**

```bash
git add components/kalkulator/KalkulasiForm.tsx
git commit -m "feat(kalkulator): add helm produktType selector and finishing labor UI"
```

---

### Task 6: Settings UI — Helm Rates + Default Consumables

**Files:**
- Modify: `components/settings/KalkulatorSettingsCard.tsx`
- Modify: `lib/kalkulator/rates.ts` (tambah `helmConsumablesDefault`)
- Modify: `lib/kalkulator/types.ts` (tambah field ke `KalkulatorRates`)
- Modify: `components/kalkulator/KalkulasiForm.tsx` (pre-fill dari rates)

Context: Tambah 3 field baru ke Settings UI kalkulator: Preparer/jam, Finisher/jam, dan default consumables helm. Default consumables Rp55.000 dipakai sebagai pre-fill di form kalkulasi saat user switch ke HELM FINISHING.

- [ ] **Step 1: Tambah `helmConsumablesDefault` ke `KalkulatorRates` di `lib/kalkulator/types.ts`**

Di `KalkulatorRates` interface, tambah setelah `finisherRatePerJam`:
```typescript
  helmConsumablesDefault: number   // default flat consumables untuk helm finishing
```

- [ ] **Step 2: Update `loadRates()` di `lib/kalkulator/rates.ts`**

Tambah setelah `finisherRatePerJam`:
```typescript
    helmConsumablesDefault: parseFloat(map['kalk.helm.consumables.default'] ?? '55000'),
```

- [ ] **Step 3: Tambah 3 field ke `KalkulatorSettingsCard.tsx`**

Baca file dulu:
```bash
grep -n "FIELDS\|fields\|kalk\." /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard/components/settings/KalkulatorSettingsCard.tsx | head -15
```

Tambah 3 entry baru ke array field (di bagian yang punya `kalk.mesin.perJam`, dll):
```typescript
{ key: "kalk.preparer.perJam",          label: "Preparer (Sanding+Assembly)/jam", suffix: "Rp/jam", default: 35000 },
{ key: "kalk.finisher.perJam",          label: "Finisher (Painting)/jam",          suffix: "Rp/jam", default: 75000 },
{ key: "kalk.helm.consumables.default", label: "Default consumables helm",          suffix: "Rp",     default: 55000 },
```

- [ ] **Step 4: Pre-fill `flatFinishingCost` dari rates di `KalkulasiForm.tsx`**

Di `KalkulasiForm`, hook `useRates()` sudah ada (atau `useMemo` dari rates prop). Tambah logic: saat `produktType` berubah ke `'HELM'` dan `flatFinishingCost === 0`, set dari `rates.helmConsumablesDefault`.

Temukan baris dimana `setProduktType` dipanggil di form, dan update handler:
```typescript
onClick={() => {
  setProduktType(t)
  if (t === 'SIMPLE') {
    setFinishType('RAW')
  } else if (t === 'HELM' && flatFinishingCost === 0) {
    // Pre-fill default consumables dari rates
    setFlatFinishingCost(rates?.helmConsumablesDefault ?? 55000)
  }
}}
```

Catatan: `rates` perlu tersedia di form — cek apakah sudah ada via hook `useRates()` atau prop. Kalau belum ada, import `useRates` dari existing hooks.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "KalkulatorSettings|rates" || echo "no errors"
```

- [ ] **Step 6: Commit**

```bash
git add components/settings/KalkulatorSettingsCard.tsx lib/kalkulator/rates.ts lib/kalkulator/types.ts components/kalkulator/KalkulasiForm.tsx
git commit -m "feat(kalkulator): add helm rates + default consumables to Settings UI"
```

---

### Task 7: HasilPanel + Build + Deploy

**Files:**
- Modify: `components/kalkulator/HasilPanel.tsx`

Context: Tambah baris `HPP Finishing` di HPP Breakdown section — hanya muncul kalau `hppFinishing > 0`.

- [ ] **Step 1: Baca HasilPanel untuk temukan HPP Breakdown section**

```bash
grep -n "hppProduksi\|hppKomponen\|HPP Breakdown\|HPP Produksi" /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard/components/kalkulator/HasilPanel.tsx | head -15
```

- [ ] **Step 2: Tambah baris HPP Finishing di HasilPanel**

Temukan bagian yang render `HPP Produksi (cetak)` dan `HPP Komponen (aksesori)`. Tambah baris baru setelah HPP Komponen:

```tsx
{hasil.hppFinishing > 0 && (
  <div className="flex justify-between items-center">
    <span className="text-sm text-muted-foreground">HPP Finishing (labor + consumables)</span>
    <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>
      {fmt(hasil.hppFinishing)}
    </span>
  </div>
)}
```

- [ ] **Step 3: Build production**

```bash
npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Jalankan semua tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: semua PASS (termasuk test helm baru).

- [ ] **Step 5: Commit**

```bash
git add components/kalkulator/HasilPanel.tsx
git commit -m "feat(kalkulator): show HPP Finishing breakdown in HasilPanel"
```

- [ ] **Step 6: Deploy**

```bash
bash deploy.sh 2>&1 | tail -5
```

- [ ] **Step 7: Smoke test manual**

1. Buka `/produk` → tab Kalkulator → buat kalkulasi baru
2. Set **Tipe Produk = HELM** → muncul Finish Type selector
3. Set **Finish Type = FINISHING** → muncul labor sections
4. Klik tier **MEDIUM** → jam ter-fill (Sanding 2.5, Painting 2.0, Assembly 0.75)
5. Isi Consumables Rp45.000 → warning hilang
6. Lihat breakdown real-time: total ~Rp288.750 + consumables
7. Klik **Simpan** → kalkulasi tersimpan
8. Buka kalkulasi lagi → semua nilai persists
9. Set **Tipe Produk = SIMPLE** → helm sections hilang, form bersih
10. Existing kalkulasi SIMPLE: buka, pastikan `hppFinishing = 0` dan semua nilai normal
