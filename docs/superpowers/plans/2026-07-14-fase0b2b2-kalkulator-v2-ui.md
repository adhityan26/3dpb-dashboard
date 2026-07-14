# Fase 0b-2b-2 — Kalkulator v2 UI (penutup Fase 0b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form kalkulator internal pindah sepenuhnya ke input v2 (komponen preset + labor generik + printer/material profile), HasilPanel menampilkan harga per channel + perbandingan margin per printer, RincianPanel jalur v2, pagination history, lalu drop kolom legacy (helm & gantungan/switch/label).

**Architecture:** Preview client-side memakai PERSIS jalur server: `resolveInputV2` + `hitungKalkulasiV2` + `presentHasilV2` dari `lib/kalkulator/resolve-v2.ts` (module ini client-safe: satu-satunya import runtime = `@3pb/kalkulator-core`; import profiles-service/types adalah `import type` — JANGAN tambah import runtime server ke file ini). Deps (rates, settingsV2, printer/material profiles) diambil via hooks TanStack yang sudah ada. Logika form yang bisa diuji diekstrak ke `lib/kalkulator/form-v2.ts` (pure, TDD).

**Tech Stack:** Next.js 16 (baca `apps/dashboard/AGENTS.md` + `node_modules/next/dist/docs/` sebelum menulis kode Next), TanStack Query, Prisma 7, vitest, `@3pb/kalkulator-core`.

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` di setiap shell.
- Test dashboard: `pnpm --filter shopee-dashboard exec vitest run <path>` (bypass RTK). Full suite: `pnpm turbo test`.
- **14 golden test** `packages/kalkulator-core/src/formula.test.ts` TIDAK BOLEH diubah. Fase ini TIDAK menyentuh `packages/kalkulator-core` sama sekali (adapter legacy di core tetap — dipakai wrapper & bot route).
- `apps/dashboard/lib/kalkulator/resolve-v2.ts` harus tetap client-importable: import runtime hanya dari `@3pb/kalkulator-core`; module lokal hanya `import type`.
- Lint baseline pre-existing ±112 error/49 warning — hanya error BARU yang wajib nol.
- Dev DB = `shopee_dashboard_dev` di Postgres homelab (sudah di `.env`). JANGAN pernah mengarahkan `db push`/seed lokal ke DB produksi kecuali di Task 12 (deploy, atas perintah user).
- JANGAN deploy tanpa diminta user (Task 12 gated).
- Commit message bahasa Indonesia, akhiri dengan trailer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Kolom `packingType` TIDAK di-drop (metadata record lama + pengurang packing di picker "Dari kalkulasi"). Kolom `printer` (string bebas) juga tetap (display/quote).

---

### Task 1: Carry-over backend kecil (TDD)

Menuntaskan carry-over 0b-2b-1: normalisasi param pagination GET (param setengah → default), `count()` hanya saat paginate, parse `hargaChannelJson` dengan try/catch, fixture paritas override > baseJual. (Carry-over "NaN guard loadGantunganHarga" GUGUR: script migrasi dihapus di Task 10 — migrasi produksi sudah selesai dijalankan.)

**Files:**
- Modify: `apps/dashboard/lib/kalkulator/service.ts` (listKalkulasi, toKalkulasiData, + export `parsePagination`)
- Modify: `apps/dashboard/app/api/kalkulator/route.ts` (GET pakai parsePagination)
- Test: `apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts` (tambah), `apps/dashboard/lib/kalkulator/__tests__/resolve-v2.test.ts` (tambah fixture)

**Interfaces:**
- Produces: `parsePagination(pageRaw: string | null, limitRaw: string | null): ListKalkulasiOpts` — dipakai route GET.

- [ ] **Step 1: Tulis failing test parsePagination + hargaChannel try/catch**

Tambahkan di `service-v2.test.ts` (ikuti pola mock prisma yang sudah ada di file itu):

```ts
import { parsePagination } from '../service'

describe('parsePagination', () => {
  it('dua param kosong → tanpa pagination', () => {
    expect(parsePagination(null, null)).toEqual({})
  })
  it('hanya page → limit default 10', () => {
    expect(parsePagination('2', null)).toEqual({ page: 2, limit: 10 })
  })
  it('hanya limit → page default 1', () => {
    expect(parsePagination(null, '25')).toEqual({ page: 1, limit: 25 })
  })
  it('nilai rusak/negatif → clamp default', () => {
    expect(parsePagination('abc', '-5')).toEqual({ page: 1, limit: 10 })
    expect(parsePagination('0', '0')).toEqual({ page: 1, limit: 10 })
  })
})
```

Test hargaChannelJson korup (pola mock findUnique/findMany di file yang sama): record dengan `hargaChannelJson: '{rusak'` → `toKalkulasiData` (via `getKalkulasi`) TIDAK throw, `hargaChannel === undefined`. Juga JSON valid tapi bukan array (`'{}'`) → `undefined`.

- [ ] **Step 2: Run test → FAIL**

Run: `pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/service-v2.test.ts`
Expected: FAIL (`parsePagination is not a function` / throw JSON).

- [ ] **Step 3: Implementasi di service.ts**

```ts
export function parsePagination(pageRaw: string | null, limitRaw: string | null): ListKalkulasiOpts {
  if (pageRaw === null && limitRaw === null) return {}
  const page = parseInt(pageRaw ?? '', 10)
  const limit = parseInt(limitRaw ?? '', 10)
  return {
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit: Number.isFinite(limit) && limit >= 1 ? limit : 10,
  }
}
```

`toKalkulasiData`: ganti `raw.hargaChannelJson ? JSON.parse(raw.hargaChannelJson) : undefined` dengan helper:

```ts
function parseHargaChannel(json: string | null | undefined) {
  if (!json) return undefined
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : undefined
  } catch { return undefined }
}
```

`listKalkulasi`: `count()` hanya saat paginate:

```ts
export async function listKalkulasi(opts?: ListKalkulasiOpts): Promise<{ items: KalkulasiData[]; total: number; page?: number; limit?: number }> {
  const paginate = opts?.page !== undefined && opts?.limit !== undefined && opts.limit > 0
  if (!paginate) {
    const rows = await prisma.kalkulasiHarga.findMany({ include: INCLUDE_ALL, orderBy: { createdAt: 'desc' } })
    return { items: rows.map(toKalkulasiData), total: rows.length }
  }
  const page = Math.max(1, opts!.page!)
  const [rows, total] = await Promise.all([
    prisma.kalkulasiHarga.findMany({ include: INCLUDE_ALL, orderBy: { createdAt: 'desc' }, skip: (page - 1) * opts!.limit!, take: opts!.limit! }),
    prisma.kalkulasiHarga.count(),
  ])
  return { items: rows.map(toKalkulasiData), total, page, limit: opts!.limit! }
}
```

Route GET (`app/api/kalkulator/route.ts`):

```ts
const { page, limit } = parsePagination(req.nextUrl.searchParams.get('page'), req.nextUrl.searchParams.get('limit'))
const result = await listKalkulasi({ page, limit })
```

- [ ] **Step 4: Fixture paritas override > baseJual di resolve-v2.test.ts**

Tambah case di describe PARITAS multi-material (pola fixture existing di file): satu plate single-material dengan `hargaPerGram` override LEBIH BESAR dari `fdmJualPerGram` rates (mis. override 3000, jual base 500) — bandingkan `presentHasilV2(hitungKalkulasiV2(resolveInputV2(input, deps), settings), settings, ...)` vs `hitungKalkulasi` wrapper (hakim), semua field HasilKalkulasi sama. Ini mengunci aturan `jual = max(baseJual, override)`.

- [ ] **Step 5: Run test → PASS + suite kalkulator hijau**

Run: `pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/`
Expected: PASS semua.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/kalkulator/service.ts apps/dashboard/app/api/kalkulator/route.ts apps/dashboard/lib/kalkulator/__tests__/
git commit -m "fix(kalkulator): parsePagination default param setengah, count() hanya saat paginate, hargaChannelJson try/catch, fixture paritas override>baseJual"
```

---

### Task 2: Plumbing backend — materialProfileId single-mode + hooks v2

Plate single-material bisa memilih material profile (kolom baru `KalkulasiPlate.materialProfileId`), hooks untuk pagination & acuan harga.

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma` (KalkulasiPlate + `materialProfileId String?`)
- Modify: `apps/dashboard/lib/kalkulator/types.ts` (PlateInputApp, PlateData)
- Modify: `apps/dashboard/lib/kalkulator/resolve-v2.ts` (resolvePlate single path)
- Modify: `apps/dashboard/lib/kalkulator/service.ts` (platesCreate, toKalkulasiData, duplicateKalkulasi)
- Modify: `apps/dashboard/lib/hooks/use-kalkulator.ts` (useKalkulasiList opts, useSetPricingReferencePrinterProfile)
- Test: `apps/dashboard/lib/kalkulator/__tests__/resolve-v2.test.ts`

**Interfaces:**
- Produces: `PlateInputApp = PlateInput & { printerProfileId?: string; materialProfileId?: string }`; hook `useKalkulasiList(opts?: { page?: number; limit?: number; enabled?: boolean })`; hook `useSetPricingReferencePrinterProfile(): useMutation<void, Error, string>` (PUT `/api/kalkulator/printer-profiles/${id}/pricing-reference`).
- Consumes: route pricing-reference SUDAH ADA (0b-2b-1).

- [ ] **Step 1: Failing test — single-mode plate dengan materialProfileId**

Di `resolve-v2.test.ts` describe 'resolusi profil', tambah:

```ts
it('plate single-material dengan materialProfileId resolve hpp/jual/failure dari profil', () => {
  const input = baseInput({ plates: [{ tipe: 'FDM', gramasi: 100, durasiJam: 1, materialProfileId: 'mp-petg' }] })
  const v2 = resolveInputV2(input, depsDenganProfil) // profil mp-petg: hpp 400, jual 900, failure 8
  expect(v2.plates[0].materials[0]).toMatchObject({ hppPerGram: 400, jualPerGram: 900, failureRatePct: 8, materialProfileId: 'mp-petg' })
})
```

(Sesuaikan helper fixture dengan yang ada di file; profil material fixture sudah ada dari test 0b-2b-1 — pakai id yang sama.)

- [ ] **Step 2: Run → FAIL** (`materialProfileId` tidak diteruskan; hasil pakai rate legacy).

- [ ] **Step 3: Implementasi**

schema.prisma `KalkulasiPlate` tambah:

```prisma
  materialProfileId    String?                          // FK lunak ke KalkMaterialProfile (single-material mode)
```

`npx prisma db push && npx prisma generate` (dev DB — additive, aman).

types.ts:

```ts
export type PlateInputApp = PlateInput & { printerProfileId?: string; materialProfileId?: string }
```
dan `PlateData` tambah `materialProfileId?: string | null`.

resolve-v2.ts `resolvePlate`, jalur single-material:

```ts
    : [resolveMaterial({ gramasi: p.gramasi ?? 0, hargaPerGram: p.hargaPerGram, materialProfileId: p.materialProfileId }, tipe, deps)]
```

service.ts `platesCreate` tambah `materialProfileId: p.materialProfileId ?? null`; `toKalkulasiData` plate map tambah `materialProfileId: p.materialProfileId ?? undefined`; `duplicateKalkulasi` plates map tambah `materialProfileId: p.materialProfileId ?? undefined`.

**PENTING paritas:** di `resolveInputV2`, kondisi passthrough `customRiskPct` sudah memeriksa `p.materials?.some(m => m.materialProfileId)` — tambah juga `|| p.materialProfileId`:

```ts
      input.plates.some(p => p.printerProfileId || p.materialProfileId || p.materials?.some(m => m.materialProfileId))
```

hooks (use-kalkulator.ts):

```ts
export function useKalkulasiList(opts?: { page?: number; limit?: number; enabled?: boolean }) {
  const paged = opts?.page !== undefined
  const limit = opts?.limit ?? 10
  return useQuery({
    queryKey: paged ? [...KALK_KEY, 'page', opts!.page, limit] : KALK_KEY,
    queryFn: () => apiFetch<KalkulasiListResponse>(paged ? `/api/kalkulator?page=${opts!.page}&limit=${limit}` : '/api/kalkulator'),
    enabled: opts?.enabled ?? true,
  })
}

export function useSetPricingReferencePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/printer-profiles/${id}/pricing-reference`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}
```

(Invalidasi `KALK_KEY` yang sudah ada otomatis prefix-match key paginated — tidak perlu ubah mutation lain.)

- [ ] **Step 4: Run → PASS**, suite kalkulator + `pnpm --filter shopee-dashboard exec vitest run` hijau.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(kalkulator): materialProfileId di plate single-mode + hook pagination & set acuan harga"
```

---

### Task 3: Settings — badge & tombol acuan harga di PrinterProfilesSection

**Files:**
- Modify: `apps/dashboard/components/settings/kalkulator-v2/PrinterProfilesSection.tsx`

**Interfaces:**
- Consumes: `useSetPricingReferencePrinterProfile` (Task 2), `PrinterProfileData.isPricingReference` (sudah ada).

- [ ] **Step 1: Implementasi UI**

Import hook, instansiasi `const setAcuanMut = useSetPricingReferencePrinterProfile()`. Di baris profil, setelah badge default:

```tsx
{p.isPricingReference && (
  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
        style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>acuan harga</span>
)}
```

Tombol 🎯 untuk SEMUA baris yang bukan acuan (termasuk baris default — jangan taruh di dalam blok `!p.isDefault`), letakkan sebelum tombol ✎:

```tsx
{!p.isPricingReference && (
  <button
    onClick={() => setAcuanMut.mutate(p.id, {
      onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); invalidateProfiles() },
      onSuccess: () => setRowError(null),
    })}
    disabled={setAcuanMut.isPending}
    className="text-[10px] g-t4 hover:text-amber-300 transition-colors px-1 disabled:opacity-40"
    title="Jadikan acuan harga (floor & harga jual dihitung dari mesin ini)">🎯</button>
)}
```

Update paragraf deskripsi section:

```tsx
<p className="text-xs g-t4 mb-2">Biaya mesin per jam per printer (listrik + depresiasi + maintenance). Profil default dipakai saat plate tidak memilih printer. Profil <b>acuan harga</b> (🎯) menentukan floor price & rekomendasi harga jual — HPP tetap pakai printer aktual per plate.</p>
```

- [ ] **Step 2: Verifikasi build + manual**

Run: `pnpm --filter shopee-dashboard exec next build` (atau `pnpm --filter shopee-dashboard build`)
Expected: build OK. Cek manual di dev server halaman Settings → set acuan pindah antar profil (badge pindah, hanya satu).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/components/settings/kalkulator-v2/PrinterProfilesSection.tsx
git commit -m "feat(kalkulator): badge & tombol acuan harga (isPricingReference) di settings printer profile"
```

---

### Task 4: PlateTable — printer profile dropdown + material profile picker + stale warning

**Files:**
- Modify: `apps/dashboard/components/kalkulator/PlateTable.tsx`

**Interfaces:**
- Consumes: `usePrinterProfiles()`, `useMaterialProfiles()` dari `@/lib/hooks/use-kalkulator`; `PlateInputApp` (plate rows kini bisa bawa `printerProfileId`, `materialProfileId`).
- Produces: PlateRow di form membawa `printerProfileId?`/`materialProfileId?` — KalkulasiForm (Task 7) meneruskan apa adanya ke input.plates. **Interface PlateRow di PlateTable ganti dari `PlateInput` ke `PlateInputApp`** (import dari `@/lib/kalkulator/types`).

- [ ] **Step 1: Ganti chips PRINTERS hardcoded → profil dari DB**

Hapus konstanta `PRINTERS`. Tambah di komponen:

```tsx
import { useFilamentHarga, usePrinterProfiles, useMaterialProfiles } from "@/lib/hooks/use-kalkulator"
import type { PlateInputApp } from "@/lib/kalkulator/types"
import type { MaterialProfileData } from "@/lib/kalkulator/profiles-service"

interface PlateRow extends PlateInputApp { key: string }
```

```tsx
const { data: printerProfiles } = usePrinterProfiles()
const { data: materialProfiles } = useMaterialProfiles()
```

Helper update multi-field (updatePlate hanya satu field):

```tsx
function updatePlateFields(key: string, partial: Partial<PlateInputApp>) {
  onChange(plates.map(p => p.key === key ? { ...p, ...partial } : p))
}
```

Blok "Printer selector" diganti:

```tsx
<div className="mt-2">
  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Printer</div>
  <div className="flex gap-2 flex-wrap">
    <button
      onClick={() => updatePlateFields(plate.key, { printer: undefined, printerProfileId: undefined })}
      className="h-8 px-3 rounded-[6px] text-xs transition-all"
      style={!plate.printerProfileId
        ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
        : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t4)" }}
      title="Tanpa profil — pakai rate mesin global"
    >—</button>
    {(printerProfiles ?? []).map(pp => (
      <button
        key={pp.id}
        onClick={() => updatePlateFields(plate.key, { printer: pp.nama, printerProfileId: pp.id })}
        className="h-8 px-3 rounded-[6px] text-xs font-medium transition-all"
        style={plate.printerProfileId === pp.id
          ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
          : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}
        title={`Rp ${Math.round(pp.mesinPerJam).toLocaleString("id-ID")}/jam${pp.isPricingReference ? " · acuan harga" : ""}`}
      >
        {pp.nama.replace("Bambu Lab ", "").replace("Snapmaker ", "")}{pp.isPricingReference ? " 🎯" : ""}
      </button>
    ))}
  </div>
  {plate.printerProfileId && printerProfiles && !printerProfiles.some(pp => pp.id === plate.printerProfileId) && (
    <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 rounded-[6px] text-[10px]"
         style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
      ⚠️ Profil printer "{plate.printer ?? plate.printerProfileId}" sudah dihapus — perhitungan jatuh ke rate global.
      <button onClick={() => updatePlateFields(plate.key, { printer: undefined, printerProfileId: undefined })}
              className="underline">bersihkan</button>
    </div>
  )}
</div>
```

Catatan: record lama punya `printer` string tanpa `printerProfileId` — tidak ada chip aktif, itu OK (rate global, paritas lama).

- [ ] **Step 2: MaterialProfilePicker (komponen lokal di file yang sama)**

```tsx
function MaterialProfilePicker({ profiles, tipe, selectedId, onSelect }: {
  profiles: MaterialProfileData[]
  tipe: "FDM" | "SLA"
  selectedId?: string
  onSelect: (id: string | undefined) => void
}) {
  const list = profiles.filter(m => m.tipe === tipe)
  if (list.length === 0) return null
  return (
    <select
      value={selectedId ?? ""}
      onChange={e => onSelect(e.target.value || undefined)}
      className="glass-input h-7 rounded-[6px] px-2 text-[10px]"
      title="Profil material (hpp/jual/failure per jenis)"
    >
      <option value="">Profil material: default {tipe}</option>
      {list.map(m => (
        <option key={m.id} value={m.id}>{m.nama} · Rp{m.hppPerGram}/g · fail {m.failureRatePct}%</option>
      ))}
    </select>
  )
}
```

Single mode — di bawah FilamentPicker (dalam div `mt-2` yang sama, jadikan flex):

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <FilamentPicker ... (existing) />
  <MaterialProfilePicker
    profiles={materialProfiles ?? []}
    tipe={(plate.tipe === "SLA" ? "SLA" : "FDM")}
    selectedId={plate.materialProfileId}
    onSelect={id => updatePlateFields(plate.key, { materialProfileId: id })}
  />
</div>
```

Multi mode — di cell Filament tiap baris material, stack vertikal:

```tsx
<div className="flex flex-col gap-1">
  <FilamentPicker ... (existing per-row) />
  <MaterialProfilePicker
    profiles={materialProfiles ?? []}
    tipe={(plate.tipe === "SLA" ? "SLA" : "FDM")}
    selectedId={mat.materialProfileId}
    onSelect={id => updateMaterial(plate.key, mIdx, "materialProfileId", (id ?? "") as string)}
  />
</div>
```

**Catatan:** `updateMaterial` menerima `string | number | boolean` — untuk clear, simpan `""` lalu normalisasi saat compose? TIDAK — lebih bersih: perlebar signature `updateMaterial(key, idx, field, value: string | number | boolean | undefined)` dan set `undefined` untuk clear. Prioritas resolusi tetap: override hargaPerGram (katalog) menang atas profil (lihat resolve-v2 `resolveMaterial`).

- [ ] **Step 3: Verifikasi**

Run: `pnpm --filter shopee-dashboard exec vitest run` dan build.
Expected: suite hijau (PlateTable tidak punya unit test), build OK, tidak ada lint error baru di file ini (`pnpm --filter shopee-dashboard exec eslint components/kalkulator/PlateTable.tsx`).
Manual dev server: pilih profil printer → tersimpan setelah save (kolom printerProfileId sudah didukung backend sejak 0b-2b-1); pilih profil material single & multi.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/kalkulator/PlateTable.tsx
git commit -m "feat(kalkulator): PlateTable pakai printer profile DB + picker material profile + warning profil terhapus"
```

---

### Task 5: Helper form-v2 (TDD) + KomponenSection + LaborSection

Komponen pengganti AksesoriSection (dipakai Task 7). Logika packing↔komponen diekstrak pure & di-TDD.

**Files:**
- Create: `apps/dashboard/lib/kalkulator/form-v2.ts`
- Create: `apps/dashboard/components/kalkulator/KomponenSection.tsx`
- Create: `apps/dashboard/components/kalkulator/LaborSection.tsx`
- Test: `apps/dashboard/lib/kalkulator/__tests__/form-v2.test.ts`

**Interfaces:**
- Produces:
  - `KomponenRow { id: string; nama: string; harga: number; qty: number }`
  - `LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }`
  - `composeKomponen(packingType: PackingType | undefined, packingRates: Record<string, number>, rows: KomponenRow[]): KomponenItem[]`
  - `splitPackingRow(packingTypeCol: string | null | undefined, rows: { nama: string; harga: number; qty: number }[]): { packingType?: PackingType; rows: { nama: string; harga: number; qty: number }[] }`
  - `<KomponenSection packingType onPackingChange rows onRowsChange packingRates />`
  - `<LaborSection rows onRowsChange />`
- Consumes: `useKomponenPresets`, `useLaborPresets`, `useKalkulasiList` (picker "Dari kalkulasi").

- [ ] **Step 1: Failing test form-v2**

`lib/kalkulator/__tests__/form-v2.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { composeKomponen, splitPackingRow } from '../form-v2'

const packing = { S: 1500, M: 2500, L: 5000, XL: 8000 }

describe('composeKomponen', () => {
  it('packing terpilih jadi item pertama', () => {
    expect(composeKomponen('M', packing, [{ id: '1', nama: 'LED', harga: 5000, qty: 2 }])).toEqual([
      { nama: 'Packing M', harga: 2500, qty: 1 },
      { nama: 'LED', harga: 5000, qty: 2 },
    ])
  })
  it('tanpa packing & baris invalid dibuang (nama kosong / harga 0), qty min 1', () => {
    expect(composeKomponen(undefined, packing, [
      { id: '1', nama: '', harga: 100, qty: 1 },
      { id: '2', nama: 'X', harga: 0, qty: 1 },
      { id: '3', nama: 'Y', harga: 10, qty: 0 },
    ])).toEqual([{ nama: 'Y', harga: 10, qty: 1 }])
  })
})

describe('splitPackingRow', () => {
  it('record lama (kolom packingType terisi) → chip dari kolom, rows utuh', () => {
    const r = splitPackingRow('L', [{ nama: 'Gantungan ring', harga: 800, qty: 1 }])
    expect(r).toEqual({ packingType: 'L', rows: [{ nama: 'Gantungan ring', harga: 800, qty: 1 }] })
  })
  it('record bentuk baru (kolom null) → angkat baris "Packing X"', () => {
    const r = splitPackingRow(null, [{ nama: 'Packing M', harga: 2500, qty: 1 }, { nama: 'LED', harga: 5000, qty: 1 }])
    expect(r).toEqual({ packingType: 'M', rows: [{ nama: 'LED', harga: 5000, qty: 1 }] })
  })
  it('tanpa baris packing → undefined', () => {
    expect(splitPackingRow(null, [{ nama: 'LED', harga: 5000, qty: 1 }])).toEqual({ rows: [{ nama: 'LED', harga: 5000, qty: 1 }] })
  })
})
```

- [ ] **Step 2: Run → FAIL** (module belum ada).

- [ ] **Step 3: Implementasi form-v2.ts**

```ts
import type { KomponenItem, PackingType } from '@3pb/kalkulator-core'

export interface KomponenRow { id: string; nama: string; harga: number; qty: number }
export interface LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }

const PACKING_RE = /^Packing (S|M|L|XL)$/

/** Susun payload komponen[]: packing terpilih (item pertama) + baris valid. */
export function composeKomponen(
  packingType: PackingType | undefined,
  packingRates: Record<string, number>,
  rows: KomponenRow[],
): KomponenItem[] {
  const items: KomponenItem[] = []
  if (packingType) items.push({ nama: `Packing ${packingType}`, harga: packingRates[packingType] ?? 0, qty: 1 })
  for (const r of rows) {
    if (!r.nama.trim() || r.harga <= 0) continue
    items.push({ nama: r.nama.trim(), harga: r.harga, qty: Math.max(1, r.qty) })
  }
  return items
}

/** Pecah komponen tersimpan untuk edit-reload: baris "Packing X" diangkat jadi chip
 *  HANYA kalau kolom packingType kosong (record bentuk baru; record lama masih
 *  menyimpan packing di kolom, bukan di baris komponen). */
export function splitPackingRow(
  packingTypeCol: string | null | undefined,
  rows: { nama: string; harga: number; qty: number }[],
): { packingType?: PackingType; rows: { nama: string; harga: number; qty: number }[] } {
  if (packingTypeCol) return { packingType: packingTypeCol as PackingType, rows }
  const idx = rows.findIndex(r => PACKING_RE.test(r.nama))
  if (idx === -1) return { rows }
  const type = rows[idx].nama.match(PACKING_RE)![1] as PackingType
  return { packingType: type, rows: rows.filter((_, i) => i !== idx) }
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: KomponenSection.tsx**

Port dari AksesoriSection: pertahankan blok Packing chips (persis UI existing) + editor baris komponen + picker "📊 Dari kalkulasi" (logika `addFromKalkulasi` existing, pengurang packing: `k.packingType ? rates[k.packingType] : (baris komponen k bernama /^Packing/)?.harga ?? 0` — KalkulasiData list item perlu `komponenKustom`; sudah ada di response). Hapus blok Gantungan, Switch, Label. Tambah picker preset.

```tsx
"use client"

import { useRef, useState, useEffect } from "react"
import { useKalkulasiList, useKomponenPresets } from "@/lib/hooks/use-kalkulator"
import type { PackingType } from "@/lib/kalkulator/types"
import type { KomponenRow } from "@/lib/kalkulator/form-v2"

interface Props {
  packingType?: PackingType
  onPackingChange: (t?: PackingType) => void
  rows: KomponenRow[]
  onRowsChange: (rows: KomponenRow[]) => void
  packingRates: Record<string, number>
}

const PACKING_SIZES: (PackingType | "none")[] = ["none", "S", "M", "L", "XL"]
function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

export function KomponenSection({ packingType, onPackingChange, rows, onRowsChange, packingRates }: Props) {
  const kkIdRef = useRef(0)
  function nextId() { return `kk-${++kkIdRef.current}` }
  const { data: presets } = useKomponenPresets()

  // ... (blok Packing chips: salin persis dari AksesoriSection existing, ganti
  //      set({packingType}) → onPackingChange(...))

  // Preset chips — klik menambah baris dari preset aktif:
  // {(presets ?? []).filter(p => p.isActive).map(p => (
  //   <button key={p.id}
  //     onClick={() => onRowsChange([...rows, { id: nextId(), nama: p.nama, harga: p.harga, qty: 1 }])}
  //     className="rounded-[10px] px-3 py-2 text-xs transition-all"
  //     style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}>
  //     + {p.nama} <span className="g-t4">({(p.harga / 1000).toFixed(1)}k)</span>
  //   </button>
  // ))}

  // Editor baris: salin grid komponenKustom existing (nama/harga/qty/✕) tapi
  // operasi ke rows/onRowsChange. Tombol "+ Tambah manual" dan picker
  // "📊 Dari kalkulasi" (salin utuh, ganti set({komponenKustom}) → onRowsChange).
}
```

(Implementer: salin JSX existing dari AksesoriSection supaya tampilan identik; bagian yang berubah hanya sumber state + section preset + hapus gantungan/switch/label. `addFromKalkulasi` pengurang packing:)

```tsx
function packingCostOf(k: { packingType?: string | null; komponenKustom?: { nama: string; harga: number }[] }): number {
  if (k.packingType) return packingRates[k.packingType] ?? 0
  return k.komponenKustom?.find(r => /^Packing (S|M|L|XL)$/.test(r.nama))?.harga ?? 0
}
```

- [ ] **Step 6: LaborSection.tsx**

```tsx
"use client"

import { useRef } from "react"
import { useLaborPresets } from "@/lib/hooks/use-kalkulator"
import type { LaborRow } from "@/lib/kalkulator/form-v2"

interface Props { rows: LaborRow[]; onRowsChange: (rows: LaborRow[]) => void }

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
const rowCost = (l: LaborRow) => (l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0)

export function LaborSection({ rows, onRowsChange }: Props) {
  const idRef = useRef(0)
  function nextId() { return `lb-${++idRef.current}` }
  const { data: presets } = useLaborPresets()

  function set(id: string, partial: Partial<LaborRow>) {
    onRowsChange(rows.map(r => r.id === id ? { ...r, ...partial } : r))
  }
  const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : undefined }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">Labor / Finishing</div>

      {/* Preset picker */}
      {(presets ?? []).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {(presets ?? []).map(p => (
            <button key={p.id}
              onClick={() => onRowsChange([...rows, ...p.items.map(i => ({ id: nextId(), ...i }))])}
              className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium transition-all hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
              title={p.items.map(i => `${i.nama}: ${fmt(rowCost({ id: '', ...i }))}`).join(" · ")}>
              + {p.nama}
            </button>
          ))}
        </div>
      )}

      {rows.map(r => (
        <div key={r.id} className="grid gap-2 mb-2 items-center" style={{ gridTemplateColumns: "1fr 64px 90px 90px 70px 32px" }}>
          <input type="text" placeholder="Sanding, painting..." value={r.nama}
            onChange={e => set(r.id, { nama: e.target.value })}
            className="glass-input w-full h-9 rounded-[6px] px-3 text-xs" />
          <input type="number" min="0" step="0.25" placeholder="jam" value={r.jam ?? ""}
            onChange={e => set(r.id, { jam: num(e.target.value) })}
            className="glass-input w-full h-9 rounded-[6px] px-2 text-xs" />
          <input type="number" min="0" step="1000" placeholder="Rp/jam" value={r.ratePerJam ?? ""}
            onChange={e => set(r.id, { ratePerJam: num(e.target.value) })}
            className="glass-input w-full h-9 rounded-[6px] px-2 text-xs" />
          <input type="number" min="0" step="1000" placeholder="flat Rp" value={r.flat ?? ""}
            onChange={e => set(r.id, { flat: num(e.target.value) })}
            className="glass-input w-full h-9 rounded-[6px] px-2 text-xs" />
          <span className="text-[10px] font-mono text-right g-t3">{fmt(rowCost(r))}</span>
          <button onClick={() => onRowsChange(rows.filter(x => x.id !== r.id))}
            className="h-9 w-8 rounded-[6px] flex items-center justify-center text-sm"
            style={{ color: "var(--g-t4)", background: "var(--g-inner)" }}>✕</button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button onClick={() => onRowsChange([...rows, { id: nextId(), nama: "" }])}
          className="text-sm font-medium transition-colors" style={{ color: "rgba(99,102,241,0.7)" }}>
          + Tambah labor
        </button>
        {rows.length > 0 && (
          <span className="text-[10px] g-t4 ml-auto">Total: <span className="font-mono g-t2">{fmt(rows.reduce((s, r) => s + rowCost(r), 0))}</span> /unit</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verifikasi** — vitest form-v2 PASS, build OK, eslint dua file baru bersih.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/lib/kalkulator/form-v2.ts apps/dashboard/lib/kalkulator/__tests__/form-v2.test.ts apps/dashboard/components/kalkulator/KomponenSection.tsx apps/dashboard/components/kalkulator/LaborSection.tsx
git commit -m "feat(kalkulator): helper form-v2 (TDD) + KomponenSection preset & LaborSection generik"
```

---

### Task 6: RincianPanel → jalur v2 (sumber profil aktual vs acuan)

RincianPanel dirombak menerima `input: KalkulasiInput` + `deps: ResolveDeps` dan memakai `resolveInputV2` — jalur PERSIS seperti server. Bekerja untuk form legacy (sekarang) MAUPUN form v2 (Task 7), karena resolveInputV2 menangani keduanya. Rekonsiliasi vs `hasil` dipertahankan.

**Files:**
- Rewrite: `apps/dashboard/components/kalkulator/RincianPanel.tsx`
- Modify: `apps/dashboard/components/kalkulator/KalkulasiForm.tsx` (call site + hooks deps)

**Interfaces:**
- Produces: `<RincianPanel input={KalkulasiInput} deps={ResolveDeps} hasil={HasilKalkulasi} hargaShopeeAktual? />`
- Consumes: `resolveInputV2`, `hitungKalkulasiV2` (via core), `ResolveDeps` dari `@/lib/kalkulator/resolve-v2`; hooks `useSettingsV2/usePrinterProfiles/useMaterialProfiles` di form.

- [ ] **Step 1: Rewrite RincianPanel**

Struktur tetap (Row, details, rekonsiliasi, section agregasi/komponen/harga) — ganti sumber angka:

```tsx
"use client"

import { useMemo } from "react"
import { hitungKalkulasiV2, type HasilKalkulasi } from "@3pb/kalkulator-core"
import { resolveInputV2, type ResolveDeps } from "@/lib/kalkulator/resolve-v2"
import type { KalkulasiInput } from "@/lib/kalkulator/types"

interface Props {
  input: KalkulasiInput
  deps: ResolveDeps
  hasil: HasilKalkulasi
  hargaShopeeAktual?: number
}
```

Inti useMemo (ganti blok lama):

```tsx
const rincian = useMemo(() => {
  try {
    const v2input = resolveInputV2(input, deps)
    const v2 = hitungKalkulasiV2(v2input, deps.settings)
    const spread = deps.settings.failureSpreadPct / 100
    const testPct = deps.settings.testLayerPct / 100

    const acuan = deps.printerProfiles.find(pp => pp.isPricingReference)
    const plateLines = v2input.plates.map((p, i) => {
      const src = input.plates[i]
      const profil = src.printerProfileId ? deps.printerProfiles.find(pp => pp.id === src.printerProfileId) : undefined
      const failRate = v2input.customRiskPct  // konstanta legacy — per-material kalau undefined
      const mesin = p.durasiJam * p.mesinPerJam
      const mesinJualRate = p.mesinPerJamJual ?? p.mesinPerJam
      const mesinJual = p.durasiJam * mesinJualRate
      const mats = p.materials.map((m, j) => {
        const srcMat = src.materials?.[j]
        const profilMat = m.materialProfileId ? deps.materialProfiles.find(mp => mp.id === m.materialProfileId) : undefined
        const override = srcMat ? srcMat.hargaPerGram : src.hargaPerGram
        const sumber = override != null ? "katalog/override"
          : profilMat ? `profil ${profilMat.nama}`
          : `default ${src.tipe ?? "FDM"}`
        const label = srcMat ? `${srcMat.brand} ${srcMat.material}`.trim() || (profilMat?.nama ?? "material") : (profilMat?.nama ?? src.tipe ?? "FDM")
        const jualRate = Math.max(m.jualPerGram, m.hppPerGram)
        const rate = failRate ?? m.failureRatePct
        return { label, sumber, gramasi: m.gramasi, hppRate: m.hppPerGram, jualRate, rate,
                 hpp: m.gramasi * m.hppPerGram, jual: m.gramasi * jualRate }
      })
      const matHpp = mats.reduce((s, m) => s + m.hpp, 0)
      const matJual = mats.reduce((s, m) => s + m.jual, 0)
      // failure per material (paritas formula-v2: basis mesin dibagi proporsional? TIDAK —
      // formula-v2: failure = Σ(matHpp_i × rate_i) + mesin × ratePlate; ratePlate = customRiskPct
      // ?? weighted-average rate material). Hitung persis:
      const totalG = mats.reduce((s, m) => s + m.gramasi, 0)
      const ratePlate = failRate ?? (totalG > 0 ? mats.reduce((s, m) => s + m.rate * m.gramasi, 0) / totalG : 0)
      const failureCost = mats.reduce((s, m) => s + m.hpp * (m.rate / 100), 0) + mesin * (ratePlate / 100)
      const testCost = matHpp * testPct
      const plateHpp = matHpp + mesin + failureCost * (1 - spread) + testCost
      const plateJual = matJual + mesinJual + failureCost * spread
      return { nama: src.namaPart || `Part ${i + 1}`, durasiJam: p.durasiJam,
               mesinPerJam: p.mesinPerJam, mesin, mesinJualRate, mesinJual,
               sumberMesin: profil ? `profil ${profil.nama}` : "rate global",
               sumberMesinJual: p.mesinPerJamJual !== undefined && acuan ? `acuan ${acuan.nama}` : undefined,
               mats, matHpp, matJual, failureCost, testCost, plateHpp, plateJual, ratePlate }
    })
    // ... agregasi & mismatch identik dengan versi lama (sumHpp/batch vs v2.hppProduksi dst.)
    return { v2input, v2, plateLines, ..., mismatch }
  } catch { return null }
}, [input, deps])
```

> **PENTING:** sebelum menulis blok failure di atas, BACA `packages/kalkulator-core/src/formula-v2.ts` fungsi plateCost dan tiru formulanya persis (failure per material + mesin, basis aktual; jalur jual pakai `mesinPerJamJual`). Rekonsiliasi `mismatch` (selisih > Rp1 → warning merah) adalah jaring pengaman kalau tiruan meleset — pertahankan.

Baris tampilan per plate:
- `Row Mesin` → formula `${num(p.durasiJam,2)} j × ${rp(p.mesinPerJam)}/j [${p.sumberMesin}]`.
- Jika `p.mesinJualRate !== p.mesinPerJam`, tambah `Row "Mesin (harga)"` formula `${num(p.durasiJam,2)} j × ${rp(p.mesinJualRate)}/j [${p.sumberMesinJual}]` value `rp(p.mesinJual)` — inilah visualisasi mesin acuan harga.
- Baris material menyertakan `[${mt.sumber}]` dan `fail ${mt.rate}%` bila rate per-material dipakai.
- Section Komponen & Labor dan section Harga: pertahankan struktur lama (sumber `v2input.komponen/labor`, `v2.*`, `hasil.*`); `shopeeFee` dari `deps.settings.channels`.

- [ ] **Step 2: Update call site di KalkulasiForm**

Tambah hooks:

```tsx
import { useSettingsV2, usePrinterProfiles, useMaterialProfiles } from "@/lib/hooks/use-kalkulator"
import type { ResolveDeps } from "@/lib/kalkulator/resolve-v2"
```

```tsx
const { data: settingsV2 } = useSettingsV2()
const { data: printerProfiles } = usePrinterProfiles()
const { data: materialProfiles } = useMaterialProfiles()
const deps: ResolveDeps | null = useMemo(() =>
  ratesData && settingsV2 && printerProfiles && materialProfiles
    ? { rates: ratesData, settings: settingsV2, printerProfiles, materialProfiles }
    : null,
  [ratesData, settingsV2, printerProfiles, materialProfiles])
```

Ekstrak builder input (dipakai handleSave + RincianPanel; di task ini masih bentuk legacy):

```tsx
const rincianInput: KalkulasiInput = useMemo(() => ({
  nama: nama.trim() || "-", batch: Math.max(1, batch), marginTier,
  hargaShopeeAktual: (shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined,
  packingType: aksesori.packingType, gantunganType: aksesori.gantunganType,
  switchQty: aksesori.switchQty, hasLabel: aksesori.hasLabel,
  plates: validPlates, komponenKustom: aksesori.komponenKustom.filter(k => k.nama && k.harga > 0),
  customRiskPct: customRiskEnabled ? customRiskPct : undefined,
  produktType, finishType, jamSanding, jamPainting, jamAssembly, flatFinishingCost,
}), [/* deps state terkait */])
```

Call site:

```tsx
{hasil && deps && (
  <RincianPanel input={rincianInput} deps={deps} hasil={hasil}
    hargaShopeeAktual={(shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined} />
)}
```

- [ ] **Step 3: Verifikasi**

Run: vitest full + build. Manual dev: buka kalkulasi lama (helm & gantungan) → panel rincian muncul TANPA warning rekonsiliasi; kalkulasi dengan plate ber-printer-profile → baris "Mesin (harga)" muncul dengan label acuan.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/kalkulator/RincianPanel.tsx apps/dashboard/components/kalkulator/KalkulasiForm.tsx
git commit -m "feat(kalkulator): RincianPanel jalur v2 — resolveInputV2 + sumber profil aktual vs mesin acuan harga"
```

---

### Task 7: KalkulasiForm switch ke input v2

Form memakai KomponenSection/LaborSection, preview dihitung `buildHasilV2` client-side (identik server), save mengirim `komponen[]`/`labor[]`. Blok HELM & Tipe Produk dihapus.

**Files:**
- Modify: `apps/dashboard/components/kalkulator/KalkulasiForm.tsx`
- Delete: `apps/dashboard/components/kalkulator/AksesoriSection.tsx`

**Interfaces:**
- Consumes: `composeKomponen`, `splitPackingRow`, `KomponenRow`, `LaborRow` (Task 5); `buildHasilV2`, `ResolveDeps` (resolve-v2); `KomponenSection`, `LaborSection`.
- Produces: `hasil` kini `(HasilKalkulasi & { hargaChannelJson: string }) | null`; variabel `hargaChannel: { channelId, A, B, C }[] | undefined` (dipakai Task 8).

- [ ] **Step 1: Ganti state aksesori/helm**

Hapus state `aksesori`, `produktType`, `finishType`, `jamSanding`, `jamPainting`, `jamAssembly`, `flatFinishingCost`, import `HELM_TIER_DEFAULTS`, konstanta `DEFAULT_AKSESORI`, fallback `aksesoriRates`, dan seluruh JSX blok "Tipe Produk" + "Helm Finishing". Ganti dengan:

```tsx
const initSplit = initial ? splitPackingRow(initial.packingType ?? null, initial.komponenKustom) : { rows: [] as { nama: string; harga: number; qty: number }[] }
const [packingType, setPackingType] = useState<PackingType | undefined>(initSplit.packingType)
const [komponenRows, setKomponenRows] = useState<KomponenRow[]>(
  initSplit.rows.map((k, i) => ({ id: `kk-init-${i}`, nama: k.nama, harga: k.harga, qty: k.qty })))
const [laborRows, setLaborRows] = useState<LaborRow[]>(
  (initial?.labor ?? []).map((l, i) => ({ id: `lb-init-${i}`, ...l })))
```

- [ ] **Step 2: Builder input tunggal (dipakai preview, RincianPanel, save)**

```tsx
const inputV2: KalkulasiInput = useMemo(() => ({
  nama: nama.trim() || "-",
  batch: Math.max(1, batch),
  marginTier,
  hargaShopeeAktual: (shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined,
  hargaOfflineAktual: hargaOffline && hargaOffline > 0 ? hargaOffline : undefined,
  // legacy wajib (masih required di type sampai Task 10) — nol semua:
  switchQty: 0, hasLabel: false, komponenKustom: [],
  plates: plates
    .filter(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0) && p.durasiJam > 0)
    .map(p => ({ namaPart: p.namaPart, tipe: p.tipe, printer: p.printer, gramasi: p.gramasi ?? 0,
                 materials: p.materials, durasiJam: p.durasiJam, filamentHargaId: p.filamentHargaId,
                 hargaPerGram: p.hargaPerGram, printerProfileId: p.printerProfileId,
                 materialProfileId: p.materialProfileId })),
  komponen: composeKomponen(packingType, ratesData?.packing ?? {}, komponenRows),
  labor: laborRows.filter(l => l.nama.trim() && ((l.jam ?? 0) * (l.ratePerJam ?? 0) > 0 || (l.flat ?? 0) > 0))
                  .map(({ id, ...l }) => ({ ...l, nama: l.nama.trim() })),
  customRiskPct: customRiskEnabled ? customRiskPct : undefined,
}), [nama, batch, marginTier, hargaShopee, shopeeIsLocked, linkedShopeePrice, hargaOffline,
     plates, packingType, komponenRows, laborRows, ratesData, customRiskEnabled, customRiskPct])
```

**Catatan validasi save:** plates dikirim TANPA filter durasi (perilaku lama handleSave menerima plate durasi 0) — pertahankan: buat dua varian, `platesForCalc` (filter durasi>0) untuk preview dan `platesForSave` (filter gramasi/materials saja) untuk save, keduanya dari helper kecil. Preview memakai `{...inputV2, plates: platesForCalc}`.

- [ ] **Step 3: Preview v2**

```tsx
import { buildHasilV2 } from "@/lib/kalkulator/resolve-v2"

const computed = useMemo(() => {
  if (!deps) return null
  const calcInput = { ...inputV2, plates: platesForCalc }
  if (calcInput.plates.length === 0 && !calcInput.komponen!.some(k => k.harga > 0)) return null
  try { return buildHasilV2(calcInput, deps) } catch { return null }
}, [deps, inputV2, platesForCalc])
const hasil: HasilKalkulasi | null = computed
const hargaChannel = useMemo(() => {
  if (!computed) return undefined
  try { const p = JSON.parse(computed.hargaChannelJson); return Array.isArray(p) ? p : undefined } catch { return undefined }
}, [computed])
```

Hapus pemanggilan `hitungKalkulasi` + import-nya.

- [ ] **Step 4: JSX — pasang section baru**

Ganti `<AksesoriSection .../>` dengan:

```tsx
<KomponenSection
  packingType={packingType}
  onPackingChange={setPackingType}
  rows={komponenRows}
  onRowsChange={setKomponenRows}
  packingRates={ratesData?.packing ?? { S: 1500, M: 2500, L: 5000, XL: 8000 }}
/>
<LaborSection rows={laborRows} onRowsChange={setLaborRows} />
```

`hasValidInput`: `nama.trim() && (platesForSave.length > 0 || inputV2.komponen!.some(k => k.harga > 0))`. handleSave: `mutateAsync({ ...inputV2, plates: platesForSave, nama: nama.trim() })` (tolak jika nama kosong). RincianPanel input = `{ ...inputV2, plates: platesForCalc }`. Hapus `rincianInput` legacy dari Task 6. PrintableQuote: tidak berubah (props sama). Hapus file `AksesoriSection.tsx` dan pastikan tidak ada importer lain (`grep -rn "AksesoriSection" apps/dashboard`).

- [ ] **Step 5: Verifikasi**

Run: vitest full, build, eslint file yang diubah (error baru = 0; `react-hooks/preserve-manual-memoization` di KalkulasiForm adalah baseline pre-existing).
Manual dev (checklist):
1. Kalkulasi baru: plate + packing M + preset komponen + labor preset "Helm MEDIUM" → angka HasilPanel masuk akal, RincianPanel tanpa warning, save sukses.
2. Edit record LAMA bergantungan (migrasi): baris komponen "Gantungan ring" muncul sebagai row; packing chip dari kolom; save ulang → angka hppTotal TIDAK berubah (paritas; bandingkan sebelum/sesudah di history).
3. Edit record helm lama: labor rows muncul (dual-write 0b-2b-1); save ulang → hppTotal sama.
4. Duplikat record lama dari history → hasil sama dengan sumber.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(kalkulator): form pindah input v2 — komponen preset + labor generik + preview buildHasilV2 client-side; hapus blok HELM & AksesoriSection"
```

---

### Task 8: HasilPanel — harga per channel + perbandingan margin per printer (TDD helper)

**Files:**
- Modify: `apps/dashboard/lib/kalkulator/form-v2.ts` (+ `hitungPerbandinganPrinter`)
- Modify: `apps/dashboard/components/kalkulator/HasilPanel.tsx`
- Modify: `apps/dashboard/components/kalkulator/KalkulasiForm.tsx` (props baru)
- Test: `apps/dashboard/lib/kalkulator/__tests__/form-v2.test.ts`

**Interfaces:**
- Produces:
  - `PrinterMarginRow { id: string; nama: string; hppTotal: number; marginOffline: number; marginShopee: number; isPricingReference: boolean }`
  - `hitungPerbandinganPrinter(input: KalkulasiInput, deps: ResolveDeps, marginTier: MarginTier): PrinterMarginRow[]`
  - HasilPanel props baru: `hargaChannel?: { channelId: string; A: number; B: number; C: number }[]`, `channels?: ChannelDef[]`, `printerComparison?: PrinterMarginRow[]`

- [ ] **Step 1: Failing test hitungPerbandinganPrinter**

```ts
import { hitungPerbandinganPrinter } from '../form-v2'
// deps fixture: 2 printer profile (A1 mesin 2000, X1C mesin 5000 isPricingReference),
// 1 plate 100g 2 jam printerProfileId A1. Harga jual identik utk semua baris
// (acuan tetap X1C), hppTotal baris X1C > baris A1, margin A1 > margin X1C.
it('margin per printer: harga tetap dari acuan, hpp per mesin', () => {
  const rows = hitungPerbandinganPrinter(input, deps, 'A')
  const a1 = rows.find(r => r.nama === 'A1')!, x1c = rows.find(r => r.nama === 'X1C')!
  expect(x1c.isPricingReference).toBe(true)
  expect(a1.hppTotal).toBeLessThan(x1c.hppTotal)
  expect(a1.marginOffline).toBeGreaterThan(x1c.marginOffline)
})
it('tanpa profil atau tanpa plate → []', () => {
  expect(hitungPerbandinganPrinter({ ...input, plates: [] }, deps, 'A')).toEqual([])
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementasi di form-v2.ts**

```ts
import { buildHasilV2, type ResolveDeps } from './resolve-v2'
import type { KalkulasiInput } from './types'
import type { MarginTier } from '@3pb/kalkulator-core'

export interface PrinterMarginRow {
  id: string; nama: string; hppTotal: number
  marginOffline: number; marginShopee: number; isPricingReference: boolean
}

/** Bandingkan profitabilitas per printer: harga jual TETAP (mesin acuan),
 *  HPP dihitung seolah SEMUA plate dicetak di printer tsb. */
export function hitungPerbandinganPrinter(input: KalkulasiInput, deps: ResolveDeps, marginTier: MarginTier): PrinterMarginRow[] {
  if (deps.printerProfiles.length === 0 || input.plates.length === 0) return []
  const basis = buildHasilV2(input, deps)
  const offline = marginTier === 'B' ? basis.offlineB : marginTier === 'C' ? basis.offlineC : basis.offlineA
  const shopee = marginTier === 'B' ? basis.shopeeB : marginTier === 'C' ? basis.shopeeC : basis.shopeeA
  const fee = deps.settings.channels.find(c => c.id === 'shopee')?.feeMultiplier ?? 1.2
  const net = shopee / fee
  return deps.printerProfiles.map(pp => {
    const h = buildHasilV2({ ...input, plates: input.plates.map(p => ({ ...p, printerProfileId: pp.id })) }, deps)
    return {
      id: pp.id, nama: pp.nama, hppTotal: h.hppTotal,
      marginOffline: offline > 0 ? Math.round(((offline - h.hppTotal) / offline) * 1000) / 10 : 0,
      marginShopee: net > 0 ? Math.round(((net - h.hppTotal) / net) * 1000) / 10 : 0,
      isPricingReference: pp.isPricingReference,
    }
  })
}
```

(`form-v2.ts` kini import `resolve-v2` — keduanya client-safe, tidak apa-apa.)

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: HasilPanel**

Props tambah `hargaChannel`, `channels`, `printerComparison` (tipe di atas; `ChannelDef` dari `@3pb/kalkulator-core`). Di card "Harga Lengkap": bila `hargaChannel && channels`, ganti dua Row Offline/Shopee hardcoded dengan loop:

```tsx
{hargaChannel.map(hc => {
  const ch = channels.find(c => c.id === hc.channelId)
  const price = marginTier === "B" ? hc.B : marginTier === "C" ? hc.C : hc.A
  const net = price / (ch?.feeMultiplier ?? 1)
  const margin = net > 0 ? ((net - hasil.hppTotal) / net) * 100 : 0
  return (
    <Row key={hc.channelId}
      label={`${ch?.nama ?? hc.channelId} A · B · C`}
      value={`${fmt(hc.A)} · ${fmt(hc.B)} · ${fmt(hc.C)}`}
      color={hc.channelId === "shopee" ? "#a5b4fc" : "#34d399"} />
  )
})}
```

(dan baris margin tier terpilih per channel di sub-blok margin, pola sama). Fallback: tanpa `hargaChannel` → render dua Row lama (kompatibel history/edit lama).

Card baru "Perbandingan Printer" setelah "Harga Lengkap", render bila `printerComparison && printerComparison.length >= 2`:

```tsx
<div className="rounded-[10px] p-4" style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
  <div className="text-xs font-semibold uppercase tracking-wider mb-1 g-accent">Perbandingan Printer</div>
  <div className="text-[10px] g-t5 mb-2">Harga jual tetap (mesin acuan) — HPP & margin kalau semua plate dicetak di printer tsb.</div>
  {printerComparison.map(r => (
    <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid var(--g-row-border)" }}>
      <span className="text-xs flex-1 g-t2">{r.nama}{r.isPricingReference ? " 🎯" : ""}</span>
      <span className="text-[11px] font-mono g-t3">HPP {fmt(r.hppTotal)}</span>
      <span className="text-[11px] font-mono w-16 text-right" style={{ color: r.marginOffline >= 0 ? "#34d399" : "#f87171" }}>{fmtPct(r.marginOffline)}</span>
      <span className="text-[11px] font-mono w-16 text-right" style={{ color: r.marginShopee >= 0 ? "#a5b4fc" : "#f87171" }}>{fmtPct(r.marginShopee)}</span>
    </div>
  ))}
  <div className="flex justify-end gap-2 pt-1 text-[9px] g-t5"><span className="w-16 text-right">offline {marginTier}</span><span className="w-16 text-right">shopee net</span></div>
</div>
```

- [ ] **Step 6: KalkulasiForm meneruskan props**

```tsx
const printerComparison = useMemo(() => {
  if (!deps || deps.printerProfiles.length < 2 || platesForCalc.length === 0) return undefined
  try { return hitungPerbandinganPrinter({ ...inputV2, plates: platesForCalc }, deps, marginTier) } catch { return undefined }
}, [deps, inputV2, platesForCalc, marginTier])
```

```tsx
<HasilPanel hasil={hasil} ... hargaChannel={hargaChannel} channels={settingsV2?.channels} printerComparison={printerComparison} />
```

- [ ] **Step 7: Verifikasi** — vitest full + build + manual (2 profil printer → card perbandingan muncul; channel tambahan di settings → baris channel baru muncul di panel).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(kalkulator): HasilPanel harga per channel + perbandingan margin per printer (harga tetap dari mesin acuan)"
```

---

### Task 9: Pagination UI KalkulasiHistory

**Files:**
- Modify: `apps/dashboard/components/kalkulator/KalkulasiHistory.tsx`

**Interfaces:**
- Consumes: `useKalkulasiList({ page, limit, enabled })` (Task 2); response `{ items, total, page, limit }`.

- [ ] **Step 1: Implementasi**

```tsx
const LIMIT = 10
const [page, setPage] = useState(1)
const filterAktif = search.trim() !== "" || filterStatus !== "all"
const pagedQ = useKalkulasiList({ page, limit: LIMIT })
const fullQ = useKalkulasiList({ enabled: filterAktif })   // full list hanya saat filter/search aktif
const isLoading = filterAktif ? fullQ.isLoading : pagedQ.isLoading
const items = (filterAktif ? fullQ.data?.items : pagedQ.data?.items) ?? []
const total = pagedQ.data?.total ?? 0
const totalPages = Math.max(1, Math.ceil(total / LIMIT))
// clamp saat data menyusut (pola adjust-state-during-render dgn guard):
if (page > totalPages && !pagedQ.isLoading) setPage(totalPages)
```

`filtered` tetap seperti sekarang (dari `items`). Di bawah daftar (setelah `</div>` space-y-2), render kontrol bila `!filterAktif && totalPages > 1`:

```tsx
<div className="flex items-center justify-center gap-3 mt-3">
  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
    className="h-7 px-3 rounded-[8px] text-[10px] disabled:opacity-30"
    style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}>‹ Prev</button>
  <span className="text-[10px] g-t4">Hal {page} / {totalPages} · {total} kalkulasi</span>
  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
    className="h-7 px-3 rounded-[8px] text-[10px] disabled:opacity-30"
    style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}>Next ›</button>
</div>
```

Saat `filterAktif`, tampilkan hint kecil di header: `<span className="text-[9px] g-t5">mencari di semua halaman</span>`.

- [ ] **Step 2: Verifikasi** — build + eslint file (hindari lint set-state-in-effect: clamp memakai pola render-adjust dengan guard seperti di ChannelsSection). Manual: >10 kalkulasi → 2 halaman; search menemukan record halaman 2; hapus record → page clamp.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/components/kalkulator/KalkulasiHistory.tsx
git commit -m "feat(kalkulator): pagination riwayat kalkulasi (10/halaman, search tetap lintas halaman)"
```

---

### Task 10: Drop legacy — schema, types, service, settings card, script migrasi

Sesudah form v2 hidup, buang jalur legacy dashboard. **Core package TIDAK disentuh.**

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma` (KalkulasiHarga: drop `gantunganType, switchQty, hasLabel, produktType, finishType, jamSanding, jamPainting, jamAssembly, flatFinishingCost`; KEEP `packingType`, `hppFinishing`, `hargaChannelJson`)
- Modify: `apps/dashboard/lib/kalkulator/types.ts`
- Modify: `apps/dashboard/lib/kalkulator/resolve-v2.ts` (hapus `legacyKomponen`/`legacyLabor`)
- Modify: `apps/dashboard/lib/kalkulator/service.ts`
- Modify: `apps/dashboard/app/api/kalkulator/route.ts` (validasi POST)
- Modify: `apps/dashboard/components/kalkulator/KalkulasiForm.tsx` (buang stub legacy di inputV2)
- Modify: `apps/dashboard/components/settings/KalkulatorSettingsCard.tsx` (hapus grup gantungan, switch/label fields, grup helm)
- Delete: `apps/dashboard/scripts/migrate-kalkulasi-v2.ts` + entry `db:migrate-kalk-v2` di `apps/dashboard/package.json`
- Test: update `resolve-v2.test.ts`, `service-v2.test.ts` ke bentuk input baru

**Interfaces:**
- Produces (bentuk final):

```ts
export interface KalkulasiInput {
  nama: string
  batch: number
  marginTier: MarginTier
  hargaShopeeAktual?: number
  hargaOfflineAktual?: number
  plates: PlateInputApp[]
  komponen: KomponenItem[]     // WAJIB (boleh [])
  labor: LaborItem[]           // WAJIB (boleh [])
  customRiskPct?: number
}
```

`KalkulasiData`: drop field yang kolomnya di-drop; KEEP `packingType?: PackingType | null` (metadata record lama), `komponenKustom`, `labor`, `hargaChannel`.

- [ ] **Step 1: Tulis ulang test dulu (RED)**

`resolve-v2.test.ts`: fixture legacy aksesori (gantunganType/switchQty/hasLabel/helm) dikonversi — sisi APP memakai `komponen: [...]`/`labor: [...]` eksplisit dengan nilai yang SAMA dengan yang dihasilkan mapping lama (mis. `{ nama: 'Gantungan ring', harga: 800, qty: 1 }`, labor helm 3 baris preparer/finisher/consumables); sisi HAKIM tetap `hitungKalkulasi(plates, { gantunganType: 'ring', ... }, ...)` — wrapper core tidak berubah, jadi paritas tetap teruji. `customRiskPct` passthrough: kini HANYA `input.customRiskPct ?? (ada profil ? undefined : rates.failureRatePct)` — pertahankan test 0-gram buffer.

`service-v2.test.ts`: input fixture pindah ke bentuk baru; test duplicate: sumber record LAMA (packingType='M' kolom terisi, komponenKustom tanpa baris Packing) → input hasil duplicate punya `komponen[0] = { nama: 'Packing M', harga: <rates>, qty: 1 }`; sumber record BARU (packingType null, ada baris 'Packing M') → TIDAK dobel.

Run → FAIL.

- [ ] **Step 2: Implementasi**

types.ts seperti Interfaces di atas (hapus juga `ProduktType/FinishType/HELM_TIER_DEFAULTS` dari re-export barrel HANYA jika tidak ada importer lain — cek `grep -rn "ProduktType\|FinishType\|HELM_TIER_DEFAULTS\|HelmOptions" apps/dashboard --include="*.ts*"`; sisakan yang masih dipakai core-wrapper test).

resolve-v2.ts:

```ts
export function resolveInputV2(input: KalkulasiInput, deps: ResolveDeps): KalkulasiInputV2 {
  return {
    plates: input.plates.map(p => resolvePlate(p, deps)),
    batch: input.batch,
    komponen: input.komponen,
    labor: input.labor,
    customRiskPct: input.customRiskPct ?? (
      input.plates.some(p => p.printerProfileId || p.materialProfileId || p.materials?.some(m => m.materialProfileId))
        ? undefined
        : deps.rates.failureRatePct
    ),
    hargaAktual: input.hargaShopeeAktual !== undefined
      ? { channelId: 'shopee', harga: input.hargaShopeeAktual }
      : undefined,
  }
}
```

Hapus `legacyKomponen`/`legacyLabor` (+ import di service).

service.ts:
- `komponenCreate(input)` → `input.komponen.map(...)`; `laborCreate` → `input.labor.map(...)` (tanpa fallback).
- Hapus `legacyAksesoriCols`; di create/update data: `packingType: null` (sumber kebenaran packing kini baris komponen; kolom lama dibiarkan apa adanya di record yang tidak pernah di-save ulang — TIDAK ada UPDATE massal), dan hapus semua field helm.
- `toKalkulasiData`: hapus mapping produktType/finishType/jam*/flatFinishingCost; `packingType` tetap diteruskan.
- `duplicateKalkulasi`:

```ts
export async function duplicateKalkulasi(id: string, newNama: string, newBatch?: number): Promise<KalkulasiData> {
  const source = await getKalkulasi(id)
  if (!source) throw new Error('Kalkulasi not found')
  const { packing } = await loadRates()
  const komponen = source.komponenKustom.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty }))
  if (source.packingType && !komponen.some(k => k.nama === `Packing ${source.packingType}`)) {
    komponen.unshift({ nama: `Packing ${source.packingType}`, harga: packing[source.packingType] ?? 0, qty: 1 })
  }
  return createKalkulasi({
    nama: newNama, batch: newBatch ?? source.batch, marginTier: source.marginTier as MarginTier,
    hargaShopeeAktual: source.hargaShopeeAktual ?? undefined,
    hargaOfflineAktual: source.hargaOfflineAktual ?? undefined,
    plates: source.plates.map(p => ({ namaPart: p.namaPart ?? undefined, tipe: p.tipe as 'FDM' | 'SLA',
      printer: p.printer ?? undefined, gramasi: p.gramasi, materials: p.materials, durasiJam: p.durasiJam,
      filamentHargaId: p.filamentHargaId, hargaPerGram: p.hargaPerGram,
      printerProfileId: p.printerProfileId ?? undefined, materialProfileId: p.materialProfileId ?? undefined })),
    komponen,
    labor: source.labor ?? [],
  })
}
```

route.ts POST validasi: `const hasKomponen = body.komponen?.some(k => k.harga > 0)`.

KalkulasiForm: hapus stub `switchQty: 0, hasLabel: false, komponenKustom: []` dari inputV2 (type sudah tidak memintanya).

KalkulatorSettingsCard: hapus FIELDS `kalk.switch.perPcs` & `kalk.label.perLembar`, hapus seluruh grup Gantungan (render + GANTUNGAN_TYPES + values init) dan grup "🪖 Helm / Topeng" (HELM_FIELDS + values init). Grup packing, failure, spread, test layer, margin, FDM/SLA/mesin/admin TETAP.

schema.prisma: drop 9 kolom tsb. Lalu `npx prisma db push` (dev DB; akan minta `--accept-data-loss` — dev data boleh) + `npx prisma generate`.

Hapus `scripts/migrate-kalkulasi-v2.ts` + script `db:migrate-kalk-v2` dari package.json (migrasi produksi SUDAH dijalankan 2026-07-12; git history menyimpan file).

Sweep sisa referensi (WAJIB kosong di apps/dashboard, kecuali test core-wrapper yang memang menguji wrapper legacy via core):

```bash
grep -rn "gantunganType\|switchQty\|hasLabel\|produktType\|finishType\|jamSanding\|jamPainting\|jamAssembly\|flatFinishingCost\|HELM_TIER\|HelmOptions\|helmConsumables\|AksesoriSection\|legacyKomponen\|legacyLabor" apps/dashboard --include="*.ts" --include="*.tsx" -l
```

Perbaiki tiap temuan (mis. bot route TIDAK kena — dia hanya pakai `hitungKalkulasi` core; `rates.ts` boleh tetap memuat key helm/gantungan untuk core wrapper — jangan ubah `loadRates`).

- [ ] **Step 3: Run → PASS** — `pnpm turbo test` full monorepo (core 36 + dashboard) hijau, build OK.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(kalkulator)!: drop kolom & jalur legacy dashboard (helm, gantungan/switch/label) — input v2 wajib; pensiunkan script migrasi"
```

---

### Task 11: Verifikasi akhir + dokumentasi + final review

**Files:**
- Modify: `docs/kalkulator-formula.md` (§Permintaan UI 0b-2b → tandai terimplementasi; §4 AFTER: bentuk input final, catatan packing-di-komponen + splitPackingRow, perbandingan printer)
- Modify: `.superpowers/sdd/progress.md` (ledger 0b-2b-2)
- Modify: memory `project_saas_3pb.md` (status Fase 0b selesai; scope SaaS Fase 1 berikutnya)

- [ ] **Step 1: Suite penuh + build + lint**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm turbo test          # semua hijau
pnpm turbo build         # OK
pnpm --filter shopee-dashboard lint   # bandingkan vs baseline (±112 err/49 warn) — error BARU harus 0
```

- [ ] **Step 2: Smoke manual menyeluruh di dev** (daftar Task 7 Step 5 + settings acuan + pagination + channel panel + RincianPanel record lama tanpa warning rekonsiliasi).

- [ ] **Step 3: Update docs + ledger + memory.** Dokumentasikan juga keputusan: kolom `packingType` = metadata record lama (create/update baru menulis null; packing hidup sebagai baris komponen "Packing X").

- [ ] **Step 4: Final whole-branch review** (superpowers code-reviewer, base = master sebelum branch), perbaiki temuan, commit.

- [ ] **Step 5: Commit docs**

```bash
git add docs/ .superpowers/
git commit -m "docs: Fase 0b-2b-2 selesai — form kalkulator v2, catatan packing-komponen & perbandingan printer"
```

Tawarkan ke user: merge lokal ke master (preferensi user: merge langsung, bukan PR).

---

### Task 12: Deploy penutup Fase 0b — GATED, hanya atas perintah user

> ⚠️ JANGAN mulai task ini tanpa perintah eksplisit user. Entrypoint container menjalankan `prisma db push --accept-data-loss` otomatis — schema drop Task 10 akan MENGHAPUS kolom di produksi saat container baru start. Pre-check wajib lulus dulu.

- [ ] **Step 1: Pre-check DB produksi (dari lokal, DATABASE_URL override host `192.168.88.113:5432`)**

Semua kalkulasi HELM+FINISHING harus sudah punya labor rows dan semua record bergantungan sudah punya baris komponen (hasil migrasi 2026-07-12). Query verifikasi (psql / prisma studio / script sekali pakai):

```sql
SELECT count(*) FROM "KalkulasiHarga" k
WHERE k."produktType"='HELM' AND k."finishType"='FINISHING'
  AND NOT EXISTS (SELECT 1 FROM "KalkulasiLabor" l WHERE l."kalkulasiId"=k.id);
-- harus 0
SELECT count(*) FROM "KalkulasiHarga" WHERE "gantunganType" IS NOT NULL OR "switchQty">0 OR "hasLabel"=true;
-- harus 0
```

Kalau bukan 0 → STOP, lapor user (jangan deploy; data akan hilang saat kolom di-drop).

- [ ] **Step 2: Build image manual** (stl-service build masih rusak — deploy.sh `set -e` abort; pakai jalur manual yang sudah terbukti):

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker build -t shopee-dashboard:latest -f apps/dashboard/Dockerfile .
```

- [ ] **Step 3: Redeploy container** dengan perintah `docker run` persis dari deploy.sh + env dari `.env.deploy` (MASK kredensial di output). Entrypoint akan db push (drop kolom) otomatis.

- [ ] **Step 4: Sanity produksi** — versi app baru (`20260714.<sha>`), halaman kalkulator: buka record lama (rincian OK), buat kalkulasi test lalu hapus, settings acuan harga tampil. Cek kolom terdrop: query information_schema. Seed/migrasi TIDAK perlu dijalankan lagi.

- [ ] **Step 5: Update ledger + memory: Fase 0b DITUTUP; next = Fase 1 apps/saas.**

---

## Self-Review Checklist (sudah dijalankan penulis plan)

- Spec coverage: 8 poin scope memory → T1 (carry-over 7), T2–T3 (poin 2), T4–T7 (poin 1), T6 (poin 4), T8 (poin 3), T9 (poin 5), T10 (poin 6+7), T12 (poin 8). ✓
- Paritas: golden core tak tersentuh; parity test app di-rework T10 dengan hakim wrapper core tetap. ✓
- Konsistensi tipe: `PlateInputApp` (T2) dipakai T4/T7/T10; `KomponenRow/LaborRow/composeKomponen/splitPackingRow` (T5) dipakai T7/T10 (duplicate memakai logika packing-lift versi service sendiri); `hitungPerbandinganPrinter` (T8) dipakai form. ✓
- Urutan aman compile per task: RincianPanel dirombak SEBELUM form switch (T6 menerima input legacy maupun v2 via resolveInputV2). ✓
