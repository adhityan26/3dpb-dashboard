# Fase 0b-2b-1: Backend Switch Kalkulasi ke v2 + Mesin Acuan Harga + Migrasi Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Service kalkulasi pindah dari wrapper legacy ke `hitungKalkulasiV2` dengan resolusi printer/material profile + konsep **mesin acuan harga** (HPP pakai profil aktual, harga jual pakai profil acuan), input diperluas (labor[], komponen[], printerProfileId, materialProfileId) sambil tetap **100% paritas untuk input legacy**, plus pagination `listKalkulasi`, script migrasi data lama, dan carry-over P2002. UI form TIDAK berubah (Fase 0b-2b-2).

**Architecture:** Perubahan core minimal-additive: `PlateInputV2.mesinPerJamJual?` (jual path pakai rate acuan; HPP & failure tetap rate aktual). Di app: modul baru `lib/kalkulator/resolve-v2.ts` berisi resolusi input → `KalkulasiInputV2` + presenter `HasilKalkulasiV2` → kolom legacy DB (pembulatan identik wrapper) — `buildHasil` di service diganti jalur ini. Fallback chain menjamin input legacy tanpa profil menghasilkan angka byte-identik dengan sekarang (dibuktikan test paritas vs `hitungKalkulasi`). Persistence: `KalkulasiLabor` tabel baru, `KomponenKustom` jadi tabel komponen unified untuk input bentuk baru, kolom legacy tetap ditulis di jalur legacy (drop kolom = 0b-2b-2).

**Tech Stack:** `@3pb/kalkulator-core`, Prisma 7 + PostgreSQL, Vitest, Next.js 16.2.3 App Router.

## Global Constraints

- Node 22: awali SETIAP bash call `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. Hook RTK transparan; output tertelan → `pnpm --filter <pkg> exec vitest run <path>`.
- **14+2 golden test formula legacy di `packages/kalkulator-core/src/formula.test.ts` TIDAK BOLEH diedit** (aturan repo). Perubahan core hanya aditif-opsional.
- **Paritas legacy WAJIB**: `createKalkulasi`/`updateKalkulasi` dengan input berbentuk lama (tanpa field v2 baru) harus menghasilkan SEMUA kolom hasil yang identik dengan implementasi sekarang. Dibuktikan dengan test yang membandingkan langsung terhadap `hitungKalkulasi(...)`.
- Schema hanya ADITIF (tabel/kolom baru); terapkan via `prisma db push` (cek dulu target `DATABASE_URL` — dev DB `shopee_dashboard_dev`); kalau rencana push menampilkan DROP/ALTER destruktif pada existing → STOP, BLOCKED.
- UI/komponen form TIDAK disentuh. Route/API existing tetap back-compat (response `listKalkulasi` tanpa query param = perilaku lama).
- Sebelum menulis kode Next, baca guide di `apps/dashboard/node_modules/next/dist/docs/` bila ragu (AGENTS.md).
- Konvensi Indonesia; commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Branch baru `fase0b2b1-kalkulasi-v2-switch` dari `master` (Task 1 Step 1).
- Acuan keputusan: `docs/kalkulator-formula.md` §3 "Keputusan tambahan 2026-07-12" + "Permintaan UI 0b-2b".

---

### Task 1: Core — `mesinPerJamJual` (mesin acuan harga) + `materialProfileId` (TDD)

**Files:**
- Modify: `packages/kalkulator-core/src/types.ts`
- Modify: `packages/kalkulator-core/src/formula-v2.ts`
- Test: `packages/kalkulator-core/src/formula-v2.test.ts` (tambah describe baru, JANGAN ubah test lama)

**Interfaces:**
- Produces: `PlateInputV2.mesinPerJamJual?: number` — dipakai jalur `jual` (floor price); `mesinPerJam` tetap dipakai jalur `hpp` DAN basis failure cost. `FilamentEntry.materialProfileId?: string` (metadata, tidak dipakai formula). Task 3 bergantung pada semantik ini.

- [ ] **Step 1: Buat branch**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git checkout master && git pull && git checkout -b fase0b2b1-kalkulasi-v2-switch
```

- [ ] **Step 2: Failing tests**

Tambah di `packages/kalkulator-core/src/formula-v2.test.ts` (setelah describe existing; `SETTINGS` dan `baseInput` sudah ada di file):

```ts
describe('hitungKalkulasiV2 — mesin acuan harga (mesinPerJamJual)', () => {
  it('jual path pakai mesinPerJamJual; HPP & failure tetap pakai mesinPerJam aktual', () => {
    const r = hitungKalkulasiV2(baseInput({
      plates: [{
        durasiJam: 2, mesinPerJam: 1000, mesinPerJamJual: 4000,
        materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 10 }],
      }],
    }), SETTINGS)
    // HPP: mat 3000 + mesin aktual 2000 = 5000; failure = 5000×10% = 500, spread 50 → +250
    expect(r.hppProduksi).toBeCloseTo(5250)
    // Jual: mat 9000 + mesin ACUAN 8000 = 17000; + failure(customer) 250
    expect(r.floorPrice).toBeCloseTo(17250)
  })

  it('tanpa mesinPerJamJual → fallback mesinPerJam (perilaku lama)', () => {
    const a = hitungKalkulasiV2(baseInput(), SETTINGS)
    const b = hitungKalkulasiV2(baseInput({
      plates: [{ durasiJam: 1, mesinPerJam: 1000, mesinPerJamJual: 1000,
        materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 0 }] }],
    }), SETTINGS)
    expect(b.floorPrice).toBeCloseTo(a.floorPrice)
    expect(b.hppProduksi).toBeCloseTo(a.hppProduksi)
  })
})
```

Run: `pnpm --filter @3pb/kalkulator-core exec vitest run src/formula-v2.test.ts`
Expected: test pertama FAIL (floorPrice terhitung 11250 — masih pakai mesin aktual di jual path).

- [ ] **Step 3: Implementasi**

`types.ts` — di `PlateInputV2` tambah setelah `mesinPerJam`:

```ts
  /** Rate mesin untuk jalur HARGA (floor price) — dari printer profile acuan.
   *  Fallback ke mesinPerJam. HPP & failure cost SELALU pakai mesinPerJam (biaya aktual). */
  mesinPerJamJual?: number
```

Di `FilamentEntry` tambah setelah `filamentId?`:

```ts
  materialProfileId?: string   // link ke KalkMaterialProfile (metadata; resolusi dilakukan app)
```

`formula-v2.ts` — di dalam `plateCost`, ganti perhitungan `jual` agar memakai mesin jual:

```ts
  function plateCost(p: PlateInputV2): { hpp: number; jual: number } {
    const mesin = p.durasiJam * p.mesinPerJam
    const mesinJual = p.durasiJam * (p.mesinPerJamJual ?? p.mesinPerJam)
    let matHpp = 0, matJual = 0, gramTotal = 0, failWeighted = 0
    for (const m of p.materials) {
      matHpp += m.gramasi * m.hppPerGram
      matJual += m.gramasi * Math.max(m.jualPerGram, m.hppPerGram)
      gramTotal += m.gramasi
      failWeighted += m.gramasi * m.failureRatePct
    }
    const failureRatePct = input.customRiskPct ?? (gramTotal > 0 ? failWeighted / gramTotal : 0)
    const failureCost = (matHpp + mesin) * (failureRatePct / 100)   // basis BIAYA aktual
    const testCost = matHpp * testPct
    return {
      hpp:  matHpp  + mesin     + failureCost * (1 - spread) + testCost,
      jual: matJual + mesinJual + failureCost * spread,
    }
  }
```

- [ ] **Step 4: Semua test core PASS**

Run: `pnpm --filter @3pb/kalkulator-core test`
Expected: seluruh suite hijau (golden legacy tidak terpengaruh — wrapper tidak pernah men-set `mesinPerJamJual`).

- [ ] **Step 5: Commit**

```bash
git add packages/kalkulator-core
git commit -m "feat(kalkulator-core): mesinPerJamJual — jalur harga pakai mesin acuan, HPP/failure tetap biaya aktual" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Schema + flag acuan harga + carry-over P2002 (TDD)

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma`
- Modify: `apps/dashboard/lib/kalkulator/profiles-service.ts`
- Modify: `apps/dashboard/app/api/kalkulator/printer-profiles/[id]/route.ts` (PUT: P2002)
- Create: `apps/dashboard/app/api/kalkulator/printer-profiles/[id]/pricing-reference/route.ts`
- Test: `apps/dashboard/lib/kalkulator/__tests__/profiles-service.test.ts`, `__tests__/profiles-routes.test.ts`

**Interfaces:**
- Produces: model `KalkulasiLabor`; kolom `KalkulasiPlate.printerProfileId/mesinPerJam`; `KalkulasiHarga.hargaChannelJson`; `KalkPrinterProfile.isPricingReference`; service `setPricingReferencePrinterProfile(id)` (+ `PrinterProfileData.isPricingReference: boolean`); route `PUT /api/kalkulator/printer-profiles/[id]/pricing-reference` (204/404); PUT `[id]` memetakan P2002 → 400 `'Nama printer sudah dipakai'`.

- [ ] **Step 1: Schema**

Di `KalkPrinterProfile`, setelah `isDefault`:

```prisma
  isPricingReference Boolean @default(false) // profil acuan harga jual (manual set)
```

Di `KalkulasiPlate`, setelah `filamentHargaPerGram`:

```prisma
  printerProfileId String? // FK lunak ke KalkPrinterProfile (tanpa relasi — profil bisa dihapus)
  mesinPerJam      Float?  // cache rate aktual saat save
```

Di `KalkulasiHarga`, setelah `hppFinishing`:

```prisma
  hargaChannelJson String? // JSON HargaChannelV2[] snapshot saat save (v2)
```

Model baru setelah `KomponenKustom`:

```prisma
model KalkulasiLabor {
  id          String         @id @default(cuid())
  kalkulasiId String
  kalkulasi   KalkulasiHarga @relation(fields: [kalkulasiId], references: [id], onDelete: Cascade)
  urutan      Int            @default(0)
  nama        String
  jam         Float?
  ratePerJam  Float?
  flat        Float?
}
```

dan tambah relasi di `KalkulasiHarga`: `labor KalkulasiLabor[]` (di dekat `komponenKustom`).

```bash
pnpm --filter shopee-dashboard exec prisma db push
pnpm --filter shopee-dashboard exec prisma generate
```

Expected: hanya CREATE tabel/kolom baru. Rencana DROP/ALTER existing → STOP.

- [ ] **Step 2: Failing tests**

`profiles-service.test.ts` — tambah (perhatikan mock `row()` sudah ada; tambahkan `isPricingReference: false` ke fixture `row()` agar tipe cocok):

```ts
describe('setPricingReferencePrinterProfile', () => {
  it('id tidak ditemukan → NOT_FOUND, tidak meng-unset acuan lain', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(null)
    await expect(setPricingReferencePrinterProfile('ghost')).rejects.toThrow('NOT_FOUND')
    expect(db.kalkPrinterProfile.updateMany).not.toHaveBeenCalled()
  })

  it('unset acuan lain lalu set target', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(row({ id: 'p2' }))
    db.kalkPrinterProfile.updateMany.mockResolvedValue({ count: 1 })
    db.kalkPrinterProfile.update.mockResolvedValue(row({ id: 'p2', isPricingReference: true }))
    await setPricingReferencePrinterProfile('p2')
    expect(db.kalkPrinterProfile.updateMany).toHaveBeenCalledWith({ where: { isPricingReference: true }, data: { isPricingReference: false } })
    expect(db.kalkPrinterProfile.update).toHaveBeenCalledWith({ where: { id: 'p2' }, data: { isPricingReference: true } })
  })
})
```

`profiles-routes.test.ts` — tambah:

```ts
  it('PUT [id] nama duplikat (P2002) → 400', async () => {
    vi.mocked(updatePrinterProfile).mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }))
    const res = await PUT(req({ nama: 'X1C' }), ctx('p1'))
    expect(res.status).toBe(400)
  })
```

(Tambahkan `PUT` dan `updatePrinterProfile` ke import kalau belum; ikuti gaya mock existing file.)

Run kedua file test → FAIL.

- [ ] **Step 3: Implementasi**

`profiles-service.ts`:
- `PrinterProfileData` + `isPricingReference: boolean`; `toPrinterData` otomatis membawa (destructure existing sudah spread — pastikan field ikut).
- Fungsi baru (pola sama `setDefaultPrinterProfile`):

```ts
export async function setPricingReferencePrinterProfile(id: string): Promise<void> {
  const existing = await prisma.kalkPrinterProfile.findUnique({ where: { id } })
  if (!existing) throw new Error('NOT_FOUND')
  await prisma.kalkPrinterProfile.updateMany({ where: { isPricingReference: true }, data: { isPricingReference: false } })
  await prisma.kalkPrinterProfile.update({ where: { id }, data: { isPricingReference: true } })
}
```

Route baru `printer-profiles/[id]/pricing-reference/route.ts` — salin pola `[id]/default/route.ts` (auth → 401; try/catch NOT_FOUND → 404; sukses 204), panggil `setPricingReferencePrinterProfile`.

Route `[id]/route.ts` PUT — di catch tambah cabang sebelum mapping lain:

```ts
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'Nama printer sudah dipakai' }, { status: 400 })
    }
```

- [ ] **Step 4: Test PASS + full suite**

```bash
pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/profiles-service.test.ts lib/kalkulator/__tests__/profiles-routes.test.ts
pnpm --filter shopee-dashboard test
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/prisma apps/dashboard/lib/kalkulator apps/dashboard/app/api/kalkulator
git commit -m "feat(kalkulator): schema labor/kolom v2 + flag isPricingReference + PUT P2002 400" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `resolve-v2.ts` — resolusi input + presenter (TDD, jantung plan ini)

**Files:**
- Create: `apps/dashboard/lib/kalkulator/resolve-v2.ts`
- Modify: `apps/dashboard/lib/kalkulator/types.ts` (perluas `KalkulasiInput` + tipe hasil v2)
- Test: `apps/dashboard/lib/kalkulator/__tests__/resolve-v2.test.ts`

**Interfaces:**
- Consumes: `hitungKalkulasi`, `hitungKalkulasiV2`, tipe core; `SettingsV2` dari `loadSettingsV2` (di-inject, bukan di-load di sini — pure & testable).
- Produces (dipakai Task 4):

```ts
// types.ts — perluasan KalkulasiInput (semua opsional = back-compat):
interface KalkulasiInput {
  ...existing,
  komponen?: KomponenItem[]          // bentuk baru — kalau ada, MENGGANTIKAN packing/gantungan/switch/label/komponenKustom
  labor?: LaborItem[]                // bentuk baru — kalau ada, MENGGANTIKAN field helm
}
// PlateInput core sudah punya materials[].materialProfileId; tambah di app-level PlateInput? — TIDAK perlu (re-export core).
// PlateInput gains printerProfileId? → tambahkan di core? TIDAK — app-level: perluas via intersection di types.ts:
type PlateInputApp = PlateInput & { printerProfileId?: string }

// resolve-v2.ts:
interface ResolveDeps {
  rates: KalkulatorRates
  settings: SettingsV2
  printerProfiles: PrinterProfileData[]
  materialProfiles: MaterialProfileData[]
}
resolveInputV2(input: KalkulasiInput, deps: ResolveDeps): KalkulasiInputV2
presentHasilV2(v2: HasilKalkulasiV2, settings: SettingsV2, hargaShopeeAktual?: number): HasilKalkulasi & { hargaChannelJson: string }
buildHasilV2(input: KalkulasiInput, deps: ResolveDeps): HasilKalkulasi & { hargaChannelJson: string }
resolveMesinAktual(p: PlateInputApp, deps: ResolveDeps): number   // profil byId ?? rates.mesinPerJam — dipakai Task 4 utk cache kolom plate
legacyLabor(input: KalkulasiInput, rates: KalkulatorRates): LaborItem[]      // diekspor — dipakai Task 4 (dual-write rows) & konsisten dgn migrasi
legacyKomponen(input: KalkulasiInput, rates: KalkulatorRates): KomponenItem[] // diekspor
```

- [ ] **Step 1: Failing tests**

File `apps/dashboard/lib/kalkulator/__tests__/resolve-v2.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hitungKalkulasi, type KalkulatorRates, type SettingsV2 } from '@3pb/kalkulator-core'
import { buildHasilV2, resolveInputV2 } from '../resolve-v2'
import type { KalkulasiInput } from '../types'

const RATES: KalkulatorRates = {
  fdmHppPerGram: 300, fdmJualPerGram: 900, slaHppPerGram: 1750, slaJualPerGram: 3500,
  mesinPerJam: 4000, adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
  gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
  switchPerPcs: 2500, labelPerLembar: 750,
  failureRatePct: 12, failureSpreadPct: 50, testLayerPct: 5,
  preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
}
const SETTINGS: SettingsV2 = {
  failureSpreadPct: 50, testLayerPct: 5,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
  channels: [
    { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
    { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
  ],
}
const PP = [
  { id: 'p1', nama: 'P1P', mesinPerJam: 4000, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: true, isPricingReference: false },
  { id: 'x1', nama: 'X1C', mesinPerJam: 6000, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: false, isPricingReference: true },
]
const MP = [
  { id: 'm1', nama: 'PLA', tipe: 'FDM', hppPerGram: 250, jualPerGram: 800, failureRatePct: 8 },
]
const DEPS = { rates: RATES, settings: SETTINGS, printerProfiles: PP, materialProfiles: MP }
const DEPS_NO_PROFILES = { rates: RATES, settings: SETTINGS, printerProfiles: [], materialProfiles: [] }

const legacyInput = (over: Partial<KalkulasiInput> = {}): KalkulasiInput => ({
  nama: 'X', batch: 1, marginTier: 'A',
  packingType: 'S', gantunganType: 'kew_kew', switchQty: 2, hasLabel: true,
  plates: [
    { tipe: 'FDM', gramasi: 21, durasiJam: 1.17 },
    { tipe: 'SLA', gramasi: 5, durasiJam: 0.5 },
  ],
  komponenKustom: [{ nama: 'Magnet', harga: 500, qty: 4 }],
  produktType: 'HELM', finishType: 'FINISHING',
  jamSanding: 1, jamPainting: 1, jamAssembly: 0.5, flatFinishingCost: 10000,
  hargaShopeeAktual: 50000, customRiskPct: 20,
  ...over,
})

describe('PARITAS: input legacy tanpa profil == hitungKalkulasi wrapper', () => {
  it('semua field HasilKalkulasi identik (helm + aksesori lengkap + customRisk)', () => {
    const input = legacyInput()
    const expected = hitungKalkulasi(
      input.plates,
      { packingType: input.packingType, gantunganType: input.gantunganType, switchQty: input.switchQty, hasLabel: input.hasLabel, komponenKustom: input.komponenKustom },
      input.batch, RATES, input.hargaShopeeAktual, input.customRiskPct,
      { finishType: 'FINISHING', jamSanding: 1, jamPainting: 1, jamAssembly: 0.5, flatFinishingCost: 10000, preparerRatePerJam: 35000, finisherRatePerJam: 75000 },
    )
    const actual = buildHasilV2(input, DEPS_NO_PROFILES)
    for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(actual[k], String(k)).toEqual(expected[k])
    }
  })

  it('paritas juga saat profil ADA tapi input tidak memakainya (tanpa printerProfileId/materialProfileId, tanpa acuan efek ke legacy? — TIDAK: profil acuan hanya berlaku saat plate ber-profil)', () => {
    const input = legacyInput()
    const expected = buildHasilV2(input, DEPS_NO_PROFILES)
    const actual = buildHasilV2(input, DEPS)
    expect(actual.floorPrice).toEqual(expected.floorPrice)
    expect(actual.hppTotal).toEqual(expected.hppTotal)
  })
})

describe('resolusi profil', () => {
  it('plate ber-printerProfileId: HPP pakai rate profil, jual pakai rate acuan', () => {
    const input = legacyInput({
      produktType: 'SIMPLE', finishType: 'RAW',
      packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [],
      customRiskPct: undefined,
      plates: [{ tipe: 'FDM', gramasi: 0, durasiJam: 1, printerProfileId: 'p1' } as any],
    })
    const v2 = resolveInputV2(input, DEPS)
    expect(v2.plates[0].mesinPerJam).toBe(4000)      // aktual = profil p1
    expect(v2.plates[0].mesinPerJamJual).toBe(6000)  // acuan = X1C (isPricingReference)
  })

  it('materialProfileId di material entry → hpp/jual/failure dari profil', () => {
    const input = legacyInput({
      plates: [{ tipe: 'FDM', durasiJam: 1, materials: [{ brand: 'eSUN', material: 'PLA', color: 'Red', gramasi: 10, materialProfileId: 'm1' }] } as any],
    })
    const v2 = resolveInputV2(input, DEPS)
    expect(v2.plates[0].materials[0]).toMatchObject({ hppPerGram: 250, jualPerGram: 800, failureRatePct: 8 })
  })

  it('override hargaPerGram menang atas material profile (hpp saja, jual tetap profil)', () => {
    const input = legacyInput({
      plates: [{ tipe: 'FDM', durasiJam: 1, materials: [{ brand: 'X', material: 'PLA', color: 'R', gramasi: 10, hargaPerGram: 280, materialProfileId: 'm1' }] } as any],
    })
    const v2 = resolveInputV2(input, DEPS)
    expect(v2.plates[0].materials[0].hppPerGram).toBe(280)
    expect(v2.plates[0].materials[0].jualPerGram).toBe(800)
  })

  it('input bentuk baru: komponen[] & labor[] menggantikan aksesori/helm', () => {
    const input = legacyInput({
      komponen: [{ nama: 'Packing S', harga: 1500, qty: 1 }],
      labor: [{ nama: 'Sanding', jam: 2, ratePerJam: 35000 }],
    })
    const v2 = resolveInputV2(input, DEPS_NO_PROFILES)
    expect(v2.komponen).toEqual([{ nama: 'Packing S', harga: 1500, qty: 1 }])
    expect(v2.labor).toEqual([{ nama: 'Sanding', jam: 2, ratePerJam: 35000 }])
  })

  it('hargaChannelJson berisi seluruh channel dari settings', () => {
    const out = buildHasilV2(legacyInput(), DEPS_NO_PROFILES)
    const channels = JSON.parse(out.hargaChannelJson)
    expect(channels.map((c: any) => c.channelId)).toEqual(['offline', 'shopee'])
  })
})
```

Run → FAIL (module not found).

- [ ] **Step 2: Perluas types app**

Di `apps/dashboard/lib/kalkulator/types.ts`:
- Tambah ke import type dari core: `KomponenItem, LaborItem` (re-export juga: `export type { KomponenItem, LaborItem } from '@3pb/kalkulator-core'`).
- Di `KalkulasiInput` tambah:

```ts
  /** Bentuk baru v2 — kalau diisi, menggantikan packing/gantungan/switch/label/komponenKustom */
  komponen?: KomponenItem[]
  /** Bentuk baru v2 — kalau diisi, menggantikan field helm (produktType/finishType/jam*) */
  labor?: LaborItem[]
```

- `plates` di `KalkulasiInput`: ganti tipe elemen jadi `PlateInputApp` dengan:

```ts
export type PlateInputApp = PlateInput & { printerProfileId?: string }
```

(dan `KalkulasiData.plates` elemen `PlateData & { printerProfileId?: string | null; mesinPerJam?: number | null }`.)

- [ ] **Step 3: Implementasi `resolve-v2.ts`**

```ts
import {
  hitungKalkulasiV2,
  type KalkulatorRates, type SettingsV2, type KalkulasiInputV2, type HasilKalkulasiV2,
  type HasilKalkulasi, type KalkulasiStatus, type MaterialUsageV2, type PlateInputV2,
  type KomponenItem, type LaborItem, type FilamentEntry,
} from '@3pb/kalkulator-core'
import type { KalkulasiInput, PlateInputApp } from './types'
import type { PrinterProfileData, MaterialProfileData } from './profiles-service'

export interface ResolveDeps {
  rates: KalkulatorRates
  settings: SettingsV2
  printerProfiles: PrinterProfileData[]
  materialProfiles: MaterialProfileData[]
}

/** Resolusi satu material entry → MaterialUsageV2.
 *  Prioritas hpp: override hargaPerGram → material profile → rate legacy per tipe.
 *  Jual & failure: material profile → rate legacy (jual di-max dengan override oleh formula core). */
function resolveMaterial(
  entry: Pick<FilamentEntry, 'gramasi' | 'hargaPerGram' | 'materialProfileId'>,
  tipe: 'FDM' | 'SLA',
  deps: ResolveDeps,
): MaterialUsageV2 {
  const profile = entry.materialProfileId
    ? deps.materialProfiles.find(m => m.id === entry.materialProfileId)
    : undefined
  const baseHpp = tipe === 'SLA' ? deps.rates.slaHppPerGram : deps.rates.fdmHppPerGram
  const baseJual = tipe === 'SLA' ? deps.rates.slaJualPerGram : deps.rates.fdmJualPerGram
  const hppPerGram = entry.hargaPerGram ?? profile?.hppPerGram ?? baseHpp
  // Paritas legacy: tanpa profil, jual = max(baseJual, override ?? baseJual)
  const jualPerGram = profile?.jualPerGram ?? Math.max(baseJual, entry.hargaPerGram ?? baseJual)
  const failureRatePct = profile?.failureRatePct ?? deps.rates.failureRatePct
  return { gramasi: entry.gramasi, hppPerGram, jualPerGram, failureRatePct, materialProfileId: entry.materialProfileId }
}

function resolvePlate(p: PlateInputApp, deps: ResolveDeps): PlateInputV2 & { printerProfileId?: string } {
  const tipe = (p.tipe === 'SLA' ? 'SLA' : 'FDM') as 'FDM' | 'SLA'
  const aktual = p.printerProfileId
    ? deps.printerProfiles.find(pp => pp.id === p.printerProfileId)
    : undefined
  const mesinPerJam = aktual?.mesinPerJam ?? deps.rates.mesinPerJam
  // Mesin acuan harga hanya berlaku saat plate memakai printer profile —
  // jalur legacy murni (tanpa profil) harus paritas dengan perilaku lama.
  const acuan = aktual
    ? (deps.printerProfiles.find(pp => pp.isPricingReference) ?? aktual)
    : undefined
  const materials = (p.materials && p.materials.length > 0)
    ? p.materials.map(m => resolveMaterial(m, tipe, deps))
    : [resolveMaterial({ gramasi: p.gramasi ?? 0, hargaPerGram: p.hargaPerGram, materialProfileId: undefined }, tipe, deps)]
  return {
    namaPart: p.namaPart,
    durasiJam: p.durasiJam,
    mesinPerJam,
    mesinPerJamJual: acuan?.mesinPerJam,
    materials,
    printerProfileId: p.printerProfileId,
  }
}

/** Rate mesin aktual plate — dipakai service utk cache kolom KalkulasiPlate.mesinPerJam. */
export function resolveMesinAktual(p: PlateInputApp, deps: ResolveDeps): number {
  const aktual = p.printerProfileId ? deps.printerProfiles.find(pp => pp.id === p.printerProfileId) : undefined
  return aktual?.mesinPerJam ?? deps.rates.mesinPerJam
}

export function legacyKomponen(input: KalkulasiInput, rates: KalkulatorRates): KomponenItem[] {
  const items: KomponenItem[] = []
  if (input.packingType && rates.packing[input.packingType] !== undefined) {
    items.push({ nama: `Packing ${input.packingType}`, harga: rates.packing[input.packingType], qty: 1 })
  }
  if (input.gantunganType && rates.gantungan[input.gantunganType] !== undefined) {
    items.push({ nama: `Gantungan ${input.gantunganType}`, harga: rates.gantungan[input.gantunganType], qty: 1 })
  }
  if (input.switchQty > 0) items.push({ nama: 'Switch', harga: rates.switchPerPcs, qty: input.switchQty })
  if (input.hasLabel) items.push({ nama: 'Label', harga: rates.labelPerLembar, qty: 1 })
  for (const k of input.komponenKustom ?? []) items.push({ nama: k.nama ?? 'Komponen', harga: k.harga, qty: k.qty })
  return items
}

export function legacyLabor(input: KalkulasiInput, rates: KalkulatorRates): LaborItem[] {
  if (input.produktType !== 'HELM' || input.finishType !== 'FINISHING') return []
  return [
    { nama: 'Preparer (sanding + assembly)', jam: (input.jamSanding ?? 0) + (input.jamAssembly ?? 0), ratePerJam: rates.preparerRatePerJam },
    { nama: 'Finisher (painting)', jam: input.jamPainting ?? 0, ratePerJam: rates.finisherRatePerJam },
    { nama: 'Consumables finishing', flat: input.flatFinishingCost ?? 0 },
  ]
}

export function resolveInputV2(input: KalkulasiInput, deps: ResolveDeps): KalkulasiInputV2 {
  return {
    plates: input.plates.map(p => resolvePlate(p, deps)),
    batch: input.batch,
    komponen: input.komponen ?? legacyKomponen(input, deps.rates),
    labor: input.labor ?? legacyLabor(input, deps.rates),
    // Paritas wrapper: rate konstan selalu diteruskan supaya plate 0-gram tetap kena buffer.
    // HANYA saat semua material tanpa profil — profil membawa failure rate per jenis.
    customRiskPct: input.customRiskPct ?? (
      input.plates.some(p => p.printerProfileId || p.materials?.some(m => m.materialProfileId))
        ? undefined
        : deps.rates.failureRatePct
    ),
    hargaAktual: input.hargaShopeeAktual !== undefined
      ? { channelId: 'shopee', harga: input.hargaShopeeAktual }
      : undefined,
  }
}

/** Presenter — reproduksi pembulatan wrapper legacy PERSIS + snapshot channel. */
export function presentHasilV2(v2: HasilKalkulasiV2, settings: SettingsV2, hargaShopeeAktual?: number): HasilKalkulasi & { hargaChannelJson: string } {
  const hppFinishing = Math.round(v2.hppLabor)
  const hppTotal = v2.hppProduksi + v2.hppKomponen + hppFinishing
  const floorPrice = v2.jualBase + v2.hppKomponen + hppFinishing
  const m = settings.marginMultipliers
  const shopeeFee = settings.channels.find(c => c.id === 'shopee')?.feeMultiplier ?? 1.2
  const offlineA = floorPrice * m.A
  const offlineB = floorPrice * m.B
  const offlineC = floorPrice * m.C
  const shopeeA = offlineA * shopeeFee
  const shopeeB = offlineB * shopeeFee
  const shopeeC = offlineC * shopeeFee
  const marginOfflineA = offlineA > 0 ? ((offlineA - hppTotal) / offlineA) * 100 : 0
  const netShopeeA = shopeeA / shopeeFee
  const marginShopeeA = netShopeeA > 0 ? ((netShopeeA - hppTotal) / netShopeeA) * 100 : 0

  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (hargaShopeeAktual !== undefined) {
    if (hargaShopeeAktual >= shopeeA) status = 'AMAN'
    else if (hargaShopeeAktual >= floorPrice) status = 'BAWAH_REKM'
    else status = 'RUGI'
  }

  const hargaChannel = settings.channels.map(ch => ({
    channelId: ch.id,
    A: Math.round(floorPrice * m.A * ch.feeMultiplier),
    B: Math.round(floorPrice * m.B * ch.feeMultiplier),
    C: Math.round(floorPrice * m.C * ch.feeMultiplier),
  }))

  return {
    hppProduksi: Math.round(v2.hppProduksi),
    hppKomponen: Math.round(v2.hppKomponen),
    hppFinishing,
    hppTotal: Math.round(hppTotal),
    floorPrice: Math.round(floorPrice),
    offlineA: Math.round(offlineA), offlineB: Math.round(offlineB), offlineC: Math.round(offlineC),
    shopeeA: Math.round(shopeeA), shopeeB: Math.round(shopeeB), shopeeC: Math.round(shopeeC),
    resellerStd: Math.round(offlineA),
    resellerBulk: Math.round(floorPrice * settings.resellerBulkMultiplier),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA: Math.round(marginShopeeA * 10) / 10,
    status,
    hargaChannelJson: JSON.stringify(hargaChannel),
  }
}

export function buildHasilV2(input: KalkulasiInput, deps: ResolveDeps): HasilKalkulasi & { hargaChannelJson: string } {
  const v2 = hitungKalkulasiV2(resolveInputV2(input, deps), deps.settings)
  return presentHasilV2(v2, deps.settings, input.hargaShopeeAktual)
}
```

CATATAN paritas untuk implementer: test paritas #1 adalah HAKIM. Kalau ada selisih, telusuri komponen demi komponen vs wrapper (`packages/kalkulator-core/src/formula.ts`) — kandidat umum: urutan pembulatan, `customRiskPct` konstan, max(jual, override). JANGAN pernah menyesuaikan expected test.

- [ ] **Step 4: Run — PASS (7 test)** lalu full suite dashboard.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator
git commit -m "feat(kalkulator): resolve-v2 — resolusi profil + mesin acuan + presenter paritas legacy" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Service switch — persistence labor/komponen/kolom v2

**Files:**
- Modify: `apps/dashboard/lib/kalkulator/service.ts`
- Test: `apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts` (baru)

**Interfaces:**
- Consumes: `buildHasilV2`, `ResolveDeps` (Task 3); `loadSettingsV2`; `listPrinterProfiles`/`listMaterialProfiles`.
- Produces: `createKalkulasi`/`updateKalkulasi`/`duplicateKalkulasi` jalur v2; `KalkulasiData` + `labor: LaborItem[]` + `hargaChannel?: HargaChannelV2-like[]`; `INCLUDE_ALL` + labor.

- [ ] **Step 1: Failing test**

File `__tests__/service-v2.test.ts` — mock prisma + loadRates + loadSettingsV2 + profiles-service (pola file test existing):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    kalkulasiHarga: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), delete: vi.fn() },
    kalkulasiPlate: { deleteMany: vi.fn() },
    komponenKustom: { deleteMany: vi.fn() },
    kalkulasiLabor: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}))
vi.mock('@/lib/kalkulator/rates', () => ({ loadRates: vi.fn() }))
vi.mock('@/lib/kalkulator/settings-v2', () => ({ loadSettingsV2: vi.fn() }))
vi.mock('@/lib/kalkulator/profiles-service', () => ({ listPrinterProfiles: vi.fn(), listMaterialProfiles: vi.fn() }))

import { prisma } from '@/lib/db'
import { loadRates } from '@/lib/kalkulator/rates'
import { loadSettingsV2 } from '@/lib/kalkulator/settings-v2'
import { listPrinterProfiles, listMaterialProfiles } from '@/lib/kalkulator/profiles-service'
import { createKalkulasi } from '../service'

const db = prisma as any

const RATES = {
  fdmHppPerGram: 300, fdmJualPerGram: 900, slaHppPerGram: 1750, slaJualPerGram: 3500,
  mesinPerJam: 4000, adminEcommerce: 1.2,
  packing: { S: 1500 }, gantungan: {}, switchPerPcs: 2500, labelPerLembar: 750,
  failureRatePct: 0, failureSpreadPct: 50, testLayerPct: 0,
  preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
}
const SETTINGS = {
  failureSpreadPct: 50, testLayerPct: 0,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
  channels: [{ id: 'offline', nama: 'Offline', feeMultiplier: 1 }, { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadRates).mockResolvedValue(RATES as any)
  vi.mocked(loadSettingsV2).mockResolvedValue(SETTINGS as any)
  vi.mocked(listPrinterProfiles).mockResolvedValue([
    { id: 'p1', nama: 'P1P', mesinPerJam: 3000, isDefault: true, isPricingReference: false, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null },
  ] as any)
  vi.mocked(listMaterialProfiles).mockResolvedValue([])
  db.kalkulasiHarga.create.mockImplementation(async (args: any) => ({
    ...args.data, id: 'k1', createdAt: new Date(), updatedAt: new Date(),
    plates: [], komponenKustom: [], labor: [], produkLinks: [],
  }))
})

describe('createKalkulasi (jalur v2)', () => {
  it('input bentuk baru: labor & komponen dipersist sebagai rows; kolom v2 plate & hargaChannelJson terisi', async () => {
    await createKalkulasi({
      nama: 'V2', batch: 1, marginTier: 'A', switchQty: 0, hasLabel: false,
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1, printerProfileId: 'p1' } as any],
      komponenKustom: [],
      komponen: [{ nama: 'Packing S', harga: 1500, qty: 1 }],
      labor: [{ nama: 'Sanding', jam: 1, ratePerJam: 35000 }],
    })
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.labor.create).toEqual([{ urutan: 1, nama: 'Sanding', jam: 1, ratePerJam: 35000, flat: null }])
    expect(data.komponenKustom.create).toEqual([{ nama: 'Packing S', harga: 1500, qty: 1 }])
    expect(data.plates.create[0]).toMatchObject({ printerProfileId: 'p1', mesinPerJam: 3000 })
    expect(typeof data.hargaChannelJson).toBe('string')
    // hppProduksi: mat 10×300 + mesin profil 1×3000 = 6000
    expect(data.hppProduksi).toBe(6000)
  })

  it('input legacy: labor rows dari mapping helm, komponen rows TIDAK menduplikasi aksesori legacy', async () => {
    await createKalkulasi({
      nama: 'L', batch: 1, marginTier: 'A', packingType: 'S', switchQty: 0, hasLabel: false,
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1 }],
      komponenKustom: [{ nama: 'Magnet', harga: 500, qty: 2 }],
      produktType: 'HELM', finishType: 'FINISHING', jamSanding: 1, jamPainting: 1, jamAssembly: 0, flatFinishingCost: 5000,
    } as any)
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    // Legacy path: kolom legacy tetap ditulis, komponenKustom = HANYA kustom user (packing tetap kolom)
    expect(data.packingType).toBe('S')
    expect(data.komponenKustom.create).toEqual([{ nama: 'Magnet', harga: 500, qty: 2 }])
    // Labor rows ditulis dari mapping helm (3 baris)
    expect(data.labor.create).toHaveLength(3)
    expect(data.jamSanding).toBe(1) // kolom helm legacy tetap terisi (drop di 0b-2b-2)
  })
})
```

Run → FAIL.

- [ ] **Step 2: Implementasi di `service.ts`**

1. Ganti import: `hitungKalkulasi` tidak dipakai lagi di service — ganti dengan `buildHasilV2, type ResolveDeps` dari `./resolve-v2`, `loadSettingsV2` dari `./settings-v2`, `listPrinterProfiles, listMaterialProfiles` dari `./profiles-service`.
2. Helper deps:

```ts
async function loadDeps(): Promise<ResolveDeps> {
  const [rates, settings, printerProfiles, materialProfiles] = await Promise.all([
    loadRates(), loadSettingsV2(), listPrinterProfiles(), listMaterialProfiles(),
  ])
  return { rates, settings, printerProfiles, materialProfiles }
}
```

3. `INCLUDE_ALL` + `labor: { orderBy: { urutan: 'asc' as const } }`.
4. `toKalkulasiData`: + `labor: (raw.labor ?? []).map(({ id, kalkulasiId, urutan, ...l }: any) => ({ nama: l.nama, ...(l.jam != null && { jam: l.jam }), ...(l.ratePerJam != null && { ratePerJam: l.ratePerJam }), ...(l.flat != null && { flat: l.flat }) }))` dan `hargaChannel: raw.hargaChannelJson ? JSON.parse(raw.hargaChannelJson) : undefined`; plates membawa `printerProfileId`/`mesinPerJam`.
5. Helper persistence:

```ts
function laborCreate(input: KalkulasiInput, deps: ResolveDeps) {
  const items = input.labor ?? legacyLaborItems(input, deps.rates)
  return items.map((l, i) => ({ urutan: i + 1, nama: l.nama, jam: l.jam ?? null, ratePerJam: l.ratePerJam ?? null, flat: l.flat ?? null }))
}
```

di mana `legacyLaborItems` = ekspor `legacyLabor` dari `resolve-v2.ts` (ekspor fungsi itu — tambah `export` di Task 3 file; konsisten satu sumber mapping).

Komponen rows: `input.komponen` ada → persist SEMUA item `input.komponen` ke `komponenKustom.create` dan set kolom legacy aksesori ke null/0 (`packingType: null, gantunganType: null, switchQty: 0, hasLabel: false`); kalau tidak → perilaku lama (kolom legacy + `input.komponenKustom` saja).
6. `createKalkulasi`/`updateKalkulasi`: `const deps = await loadDeps()`; `const hasil = buildHasilV2(input, deps)` (spread `...hasil` sudah membawa `hargaChannelJson` → kolom baru); plates create + `printerProfileId: p.printerProfileId ?? null, mesinPerJam: resolved rate` — untuk cache rate, ekspor juga helper kecil dari resolve-v2: `resolveMesinAktual(p, deps): number` (profil byId ?? rates.mesinPerJam) dan pakai di kedua tempat. `updateKalkulasi` transaksi deleteMany + `kalkulasiLabor.deleteMany`.
7. `duplicateKalkulasi`: salin juga `labor: source.labor`, `komponen`? — sumber legacy tidak punya `komponen`; cukup salin `labor` bila ada dan tambahkan `printerProfileId` per plate dari source.

- [ ] **Step 3: Run — PASS** lalu `pnpm --filter shopee-dashboard test` + `pnpm --filter shopee-dashboard build`.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/lib/kalkulator
git commit -m "feat(kalkulator): service switch ke buildHasilV2 + persist labor/komponen/kolom v2" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Pagination `listKalkulasi` (back-compat)

**Files:**
- Modify: `apps/dashboard/lib/kalkulator/service.ts` (`listKalkulasi`)
- Modify: `apps/dashboard/app/api/kalkulator/route.ts` (GET)
- Modify: `apps/dashboard/lib/kalkulator/types.ts` (`KalkulasiListResponse`)
- Test: tambah di `__tests__/service-v2.test.ts`

**Interfaces:**
- Produces: `listKalkulasi(opts?: { page?: number; limit?: number })` → `{ items, total, page?, limit? }`; GET `/api/kalkulator?page=1&limit=10`; TANPA param → `{ items: semua, total }` (UI existing baca `.items` — tetap jalan).

- [ ] **Step 1: Failing test**

```ts
describe('listKalkulasi pagination', () => {
  it('dengan page/limit → skip/take + total', async () => {
    db.kalkulasiHarga.findMany.mockResolvedValue([])
    db.kalkulasiHarga.count.mockResolvedValue(37)
    const res = await listKalkulasi({ page: 3, limit: 10 })
    expect(db.kalkulasiHarga.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }))
    expect(res).toMatchObject({ total: 37, page: 3, limit: 10 })
  })

  it('tanpa opts → semua item (tanpa skip/take)', async () => {
    db.kalkulasiHarga.findMany.mockResolvedValue([])
    db.kalkulasiHarga.count.mockResolvedValue(5)
    await listKalkulasi()
    const args = db.kalkulasiHarga.findMany.mock.calls.at(-1)[0]
    expect(args.skip).toBeUndefined()
    expect(args.take).toBeUndefined()
  })
})
```

(import `listKalkulasi` di file test.) Run → FAIL.

- [ ] **Step 2: Implementasi**

`service.ts`:

```ts
export interface ListKalkulasiOpts { page?: number; limit?: number }

export async function listKalkulasi(opts?: ListKalkulasiOpts): Promise<{ items: KalkulasiData[]; total: number; page?: number; limit?: number }> {
  const paginate = opts?.page !== undefined && opts?.limit !== undefined && opts.limit > 0
  const [rows, total] = await Promise.all([
    prisma.kalkulasiHarga.findMany({
      include: INCLUDE_ALL,
      orderBy: { createdAt: 'desc' },
      ...(paginate && { skip: (Math.max(1, opts!.page!) - 1) * opts!.limit!, take: opts!.limit! }),
    }),
    prisma.kalkulasiHarga.count(),
  ])
  return { items: rows.map(toKalkulasiData), total, ...(paginate && { page: Math.max(1, opts!.page!), limit: opts!.limit! }) }
}
```

`route.ts` GET: baca `req.nextUrl.searchParams` `page`/`limit` (parseInt, abaikan bila NaN), teruskan; response = hasil langsung (bentuk `{items,total,...}` — back-compat karena sebelumnya... **CEK dulu**: route lama mengembalikan apa? Baca file. Kalau lama `NextResponse.json(await listKalkulasi())` yang bentuknya array→ berubah? Berdasarkan hook `useKalkulasiList` bertipe `KalkulasiListResponse = { items }` — route lama sudah membungkus `{ items }`. Sesuaikan: pastikan bentuk `{ items, total, page?, limit? }`, dan perbarui `KalkulasiListResponse` di types: `{ items: KalkulasiData[]; total: number; page?: number; limit?: number }`.)

- [ ] **Step 3: PASS + full suite + build.** Perhatikan konsumen `listKalkulasi()` lain (grep `listKalkulasi(` di apps/dashboard — mis. `lib/po/service.ts`?) dan sesuaikan destructuring `.items` bila perlu (perubahan minimal, catat di report).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/lib/kalkulator apps/dashboard/app/api/kalkulator/route.ts
git commit -m "feat(kalkulator): pagination listKalkulasi (page/limit, back-compat tanpa param)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Script migrasi data lama (idempoten)

**Files:**
- Create: `apps/dashboard/scripts/migrate-kalkulasi-v2.ts`
- Modify: `apps/dashboard/package.json` (script `db:migrate-kalk-v2`)

**Interfaces:**
- Produces: `pnpm --filter shopee-dashboard db:migrate-kalk-v2` — mengisi `KalkulasiLabor` dari field helm & `KomponenKustom` dari gantungan/switch/label untuk semua kalkulasi lama. Packing TIDAK dimigrasi (tetap kolom). Idempoten: kalkulasi yang sudah punya labor rows dilewati; komponen dicek per-nama.

- [ ] **Step 1: Tulis script**

```ts
/**
 * Migrasi data kalkulasi lama ke bentuk v2 (idempoten):
 * - HELM FINISHING → 3 baris KalkulasiLabor (skip kalau kalkulasi sudah punya labor rows)
 * - gantunganType/switchQty/hasLabel → baris KomponenKustom (skip per-nama kalau sudah ada)
 * Kolom legacy TIDAK dihapus di sini (drop = Fase 0b-2b-2). Harga snapshot dari Config saat migrasi.
 * Jalankan: pnpm --filter shopee-dashboard db:migrate-kalk-v2
 */
import 'dotenv/config'
import { prisma } from '@/lib/db'

async function configNum(key: string, fallback: number): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key } })
  const n = row ? parseFloat(row.value) : NaN
  return Number.isFinite(n) ? n : fallback
}

async function main() {
  const preparer = await configNum('kalk.preparer.perJam', 35000)
  const finisher = await configNum('kalk.finisher.perJam', 75000)
  const switchHarga = await configNum('kalk.switch.perPcs', 2500)
  const labelHarga = await configNum('kalk.label.perLembar', 750)
  const gantunganHarga: Record<string, number> = {
    kew_kew: await configNum('kalk.gantungan.kew_kew', 900),
    ring: await configNum('kalk.gantungan.ring', 800),
    rantai: await configNum('kalk.gantungan.rantai', 350),
    tali: await configNum('kalk.gantungan.tali', 400),
  }

  const all = await prisma.kalkulasiHarga.findMany({
    include: { labor: true, komponenKustom: true },
  })
  let laborMigrated = 0, komponenMigrated = 0

  for (const k of all) {
    // 1. Helm → labor
    if (k.produktType === 'HELM' && k.finishType === 'FINISHING' && k.labor.length === 0) {
      await prisma.kalkulasiLabor.createMany({
        data: [
          { kalkulasiId: k.id, urutan: 1, nama: 'Preparer (sanding + assembly)', jam: k.jamSanding + k.jamAssembly, ratePerJam: preparer },
          { kalkulasiId: k.id, urutan: 2, nama: 'Finisher (painting)', jam: k.jamPainting, ratePerJam: finisher },
          { kalkulasiId: k.id, urutan: 3, nama: 'Consumables finishing', flat: k.flatFinishingCost },
        ],
      })
      laborMigrated++
      console.log(`labor    ${k.nama} (${k.id})`)
    }

    // 2. Aksesori → komponen rows
    const target: { nama: string; harga: number; qty: number }[] = []
    if (k.gantunganType && gantunganHarga[k.gantunganType] !== undefined) {
      target.push({ nama: `Gantungan ${k.gantunganType}`, harga: gantunganHarga[k.gantunganType], qty: 1 })
    }
    if (k.switchQty > 0) target.push({ nama: 'Switch', harga: switchHarga, qty: k.switchQty })
    if (k.hasLabel) target.push({ nama: 'Label', harga: labelHarga, qty: 1 })
    const missing = target.filter(t => !k.komponenKustom.some(existing => existing.nama === t.nama))
    if (missing.length > 0) {
      await prisma.komponenKustom.createMany({ data: missing.map(t => ({ kalkulasiId: k.id, ...t })) })
      komponenMigrated += missing.length
      console.log(`komponen ${k.nama}: +${missing.length}`)
    }
  }

  console.log(`Selesai. ${all.length} kalkulasi diperiksa, ${laborMigrated} dapat labor rows, ${komponenMigrated} baris komponen ditambahkan.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

CATATAN implementer: cek pola import prisma di `scripts/seed-kalkulator-v2.ts` (pakai `@/lib/db` + dotenv) — ikuti persis.

`package.json` scripts, setelah `db:seed-kalk-v2`:

```json
"db:migrate-kalk-v2": "tsx scripts/migrate-kalkulasi-v2.ts",
```

- [ ] **Step 2: Jalankan 2× di dev DB** (bukti idempoten: run 2 → 0 migrasi baru). Laporkan output kedua run + count sebelum/sesudah.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/scripts/migrate-kalkulasi-v2.ts apps/dashboard/package.json
git commit -m "feat(kalkulator): script migrasi data lama helm→labor & aksesori→komponen (idempoten)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Verifikasi akhir & docs

**Files:**
- Modify: `docs/kalkulator-formula.md` (blok Status)

- [ ] **Step 1:** `pnpm turbo test` (ekspektasi: semua PASS — core bertambah 2, dashboard bertambah ±11), `pnpm turbo lint` (0 error baru), `pnpm turbo build`.

- [ ] **Step 2: Smoke API paritas nyata** — dev server + buat kalkulasi legacy via API? Butuh session → cukup: jalankan `pnpm --filter shopee-dashboard dev`, cek `/produk` 200/307 & tidak ada error render; matikan. Paritas sudah dijaga test Task 3.

- [ ] **Step 3: Update docs** — ganti kalimat terakhir blok Status `docs/kalkulator-formula.md` menjadi:

```
**Fase 0b-2b-1 selesai** — service kalkulasi jalur v2: resolusi printer/material profile, mesin acuan harga (`mesinPerJamJual` di core; flag `isPricingReference`), input diperluas (labor[]/komponen[]/printerProfileId/materialProfileId, paritas legacy terjaga via test), `KalkulasiLabor` + kolom plate v2 + `hargaChannelJson`, pagination `listKalkulasi`, script `db:migrate-kalk-v2`. Menyusul Fase 0b-2b-2: UI form/panel/history pindah v2 + total per unit + pagination UI + drop kolom legacy.
```

- [ ] **Step 4: Commit penutup** (`git add -A` — plan doc ikut) pesan `docs: tandai Fase 0b-2b-1 backend switch selesai` + trailer.

- [ ] **Step 5: Laporkan ke user** (controller): ringkasan + opsi merge; deploy note — saat deploy versi ini: `db push` otomatis; jalankan `db:migrate-kalk-v2` (dan `db:seed-kalk-v2` masih idempoten) terhadap DB produksi dari lokal.

---

## Catatan scope

- **Plan ini (0b-2b-1)**: core `mesinPerJamJual`, schema, resolusi+presenter, service switch (paritas legacy), pagination API, migrasi data, P2002 PUT. UI tidak berubah — user belum melihat apa pun yang beda.
- **Plan berikutnya (0b-2b-2, terakhir Fase 0b)**: KalkulasiForm/PlateTable/AksesoriSection/HasilPanel/PrintableQuote/KalkulasiHistory pindah bentuk v2 (labor section, komponen preset picker, printer dropdown dari profil + badge acuan, harga per channel + perbandingan margin per mesin, total per-unit ÷ batch, pagination UI); badge/tombol acuan harga di PrinterProfilesSection; bot route tetap wrapper; drop kolom legacy (helm/gantungan/switch/label) + bersihkan grup lama KalkulatorSettingsCard; jalankan migrasi produksi.
