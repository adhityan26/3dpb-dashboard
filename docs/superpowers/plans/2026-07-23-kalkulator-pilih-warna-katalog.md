# Pilih Warna dari Katalog Filament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah kemampuan pilih warna filament dari katalog spool/AMS asli (`FilamentCatalog`) di kalkulator, buat kedua mode plate (single & multi-material), lewat popover yang dibuka dari swatch warna.

**Architecture:** Field `color` baru ditambah ke `PlateInput` (single-material, belum pernah ada) dan sudah ada di `FilamentEntry` (multi-material). Sumber warna: `FilamentCatalog` (brand/material/colorName/colorHex) via hook `useCatalog()` yang sudah ada — di-fuzzy-match ke brand+material yang lagi dipilih, lalu di-sort (nearest-color kalau ada referensi hex, alfabetis kalau kosong). UI: `HexColorSwatch` (`@3pb/ui`, sudah ada) diperluas jadi `HexColorPicker` — swatch jadi tombol trigger popover daftar warna.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7 (`db push` — tidak pakai migration file manual, lihat Global Constraints), Vitest.

## Global Constraints

- Deploy proyek ini pakai `prisma db push --accept-data-loss` otomatis di `docker-entrypoint.sh` saat container start — **JANGAN** bikin migration file manual di `apps/dashboard/prisma/migrations/`. Cukup edit `schema.prisma` lalu `npx prisma generate` (regenerate types, tidak butuh koneksi DB) — kolom baru di database akan otomatis dibuat saat `bash deploy.sh` berikutnya.
- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum semua command node/pnpm/npx.
- Warna (`color`) murni informational — **TIDAK** boleh dipakai/dibaca oleh `hitungKalkulasiV2` atau logic HPP apa pun. Jangan sentuh `packages/kalkulator-core/src/formula.ts` atau golden test `formula.test.ts`.
- Matching brand/material katalog↔filament pakai fuzzy substring dua arah, case-insensitive — pola yang SAMA PERSIS dengan `materialProfileMatchesFilament` yang sudah ada di `apps/dashboard/components/kalkulator/PlateTable.tsx`.
- Kalau brand+material tidak match apa pun di katalog, popover tetap bisa dibuka (bukan disabled), isinya pesan "Tidak ada warna terkatalog untuk kombinasi ini" — bukan disembunyikan total.
- Text input hex manual TETAP ADA di kedua mode — popover katalog cuma shortcut opsional, tidak menggantikan input manual.

---

## File Structure

```
packages/kalkulator-core/src/types.ts          # MODIFY — tambah `color?: string` ke PlateInput
apps/dashboard/prisma/schema.prisma              # MODIFY — tambah kolom `color` ke KalkulasiPlate
apps/dashboard/lib/kalkulator/service.ts         # MODIFY — mapping color di platesCreate & toKalkulasiData
apps/dashboard/lib/kalkulator/color-catalog.ts   # CREATE — pure functions: matching, sorting, cari warna
apps/dashboard/lib/kalkulator/__tests__/color-catalog.test.ts  # CREATE
packages/ui/src/HexColorPicker.tsx               # CREATE — popover interaktif, bungkus HexColorSwatch
packages/ui/src/index.ts                          # MODIFY — export HexColorPicker
apps/dashboard/components/kalkulator/PlateTable.tsx  # MODIFY — wiring di single & multi mode
apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts  # MODIFY — assert color flows through create
```

Alasan struktur: `color-catalog.ts` murni pure function (matching+sorting), terpisah dari komponen React supaya gampang di-unit-test tanpa render. `HexColorPicker` masuk `@3pb/ui` (bukan langsung di `PlateTable.tsx`) mengikuti keputusan sebelumnya soal `HexColorSwatch` — reusable buat `apps/saas` juga.

---

### Task 1: Field `color` di single-material plate (tipe data + Prisma + service layer)

**Files:**
- Modify: `packages/kalkulator-core/src/types.ts`
- Modify: `apps/dashboard/prisma/schema.prisma`
- Modify: `apps/dashboard/lib/kalkulator/service.ts`
- Modify: `apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts`

**Interfaces:**
- Produces: `PlateInput.color?: string` — dipakai `PlateInputApp`/`PlateData` (extends `PlateInput`, otomatis ikut) di Task 4, dan `KalkulasiPlate.color` kolom DB.

- [ ] **Step 1: Tulis failing test — assert color mengalir lewat createKalkulasi**

Di `apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts`, tambahkan test baru di dalam `describe('createKalkulasi (jalur v2)', ...)` (setelah test `'komponen: [] & labor: [] ...'` yang sudah ada, sebelum closing `})` dari describe block):

```ts
  it('color di plate single-material ke-persist ke kolom color', async () => {
    await createKalkulasi({
      nama: 'Warna', batch: 1, marginTier: 'A',
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1, color: '#A99077' }],
      komponen: [], labor: [],
    })
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.plates.create[0]).toMatchObject({ color: '#A99077' })
  })

  it('color tidak diisi → kolom color null (bukan undefined/error)', async () => {
    await createKalkulasi({
      nama: 'TanpaWarna', batch: 1, marginTier: 'A',
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1 }],
      komponen: [], labor: [],
    })
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.plates.create[0].color).toBeNull()
  })
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/__tests__/service-v2.test.ts
```
Expected: FAIL — `data.plates.create[0].color` adalah `undefined`, bukan `'#A99077'`/`null` (field `color` belum ada di `PlateInput` type maupun `platesCreate`/Prisma schema, jadi TypeScript juga akan komplain `color` bukan property valid di object literal test — itu bagian dari "gagal" yang diharapkan).

- [ ] **Step 3: Tambah `color` ke `PlateInput` (kalkulator-core)**

Di `packages/kalkulator-core/src/types.ts`, cari interface `PlateInput` (persis seperti ini):

```ts
export interface PlateInput {
  namaPart?: string
  tipe?: PrintTipe          // legacy single-material
  printer?: string
  gramasi?: number          // legacy single-material gramasi
  materials?: FilamentEntry[] // multi-material (replaces tipe+gramasi when set)
  durasiJam: number
  filamentHargaId?: string  // link to FilamentHarga (single-material override)
  hargaPerGram?: number     // cached rate from FilamentHarga
}
```

Ubah jadi (tambah satu baris `color`):

```ts
export interface PlateInput {
  namaPart?: string
  tipe?: PrintTipe          // legacy single-material
  printer?: string
  gramasi?: number          // legacy single-material gramasi
  materials?: FilamentEntry[] // multi-material (replaces tipe+gramasi when set)
  durasiJam: number
  filamentHargaId?: string  // link to FilamentHarga (single-material override)
  hargaPerGram?: number     // cached rate from FilamentHarga
  color?: string            // hex warna filament, single-material mode (informational, tidak dipakai kalkulasi HPP)
}
```

- [ ] **Step 4: Tambah kolom `color` ke Prisma schema**

Di `apps/dashboard/prisma/schema.prisma`, cari `model KalkulasiPlate` (persis seperti ini, baris terakhir sebelum `}`):

```prisma
  materialProfileId    String?                          // FK lunak ke KalkMaterialProfile (single-material mode)
}
```

Ubah jadi:

```prisma
  materialProfileId    String?                          // FK lunak ke KalkMaterialProfile (single-material mode)
  color                String?                          // hex warna filament, single-material mode (informational)
}
```

Run (regenerate Prisma Client types — TIDAK butuh koneksi database, TIDAK bikin migration file, sesuai Global Constraints):
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
npx prisma generate --schema apps/dashboard/prisma/schema.prisma
```
Expected: `✔ Generated Prisma Client`.

- [ ] **Step 5: Wiring di service.ts — write path (`platesCreate`)**

Di `apps/dashboard/lib/kalkulator/service.ts`, cari fungsi `platesCreate` (persis seperti ini):

```ts
function platesCreate(input: KalkulasiInput, deps: ResolveDeps) {
  return input.plates.map((p, i) => ({
    urutan: i + 1,
    namaPart: p.namaPart,
    tipe: p.tipe ?? 'FDM',
    printer: p.printer,
    gramasi: p.gramasi ?? 0,
    materialsJson: p.materials ? JSON.stringify(p.materials) : null,
    durasiJam: p.durasiJam,
    filamentHargaId: p.filamentHargaId ?? null,
    filamentHargaPerGram: p.hargaPerGram ?? null,
    printerProfileId: p.printerProfileId ?? null,
    materialProfileId: p.materialProfileId ?? null,
    mesinPerJam: resolveMesinAktual(p, deps),
  }))
}
```

Ubah jadi (tambah baris `color`):

```ts
function platesCreate(input: KalkulasiInput, deps: ResolveDeps) {
  return input.plates.map((p, i) => ({
    urutan: i + 1,
    namaPart: p.namaPart,
    tipe: p.tipe ?? 'FDM',
    printer: p.printer,
    gramasi: p.gramasi ?? 0,
    materialsJson: p.materials ? JSON.stringify(p.materials) : null,
    durasiJam: p.durasiJam,
    filamentHargaId: p.filamentHargaId ?? null,
    filamentHargaPerGram: p.hargaPerGram ?? null,
    printerProfileId: p.printerProfileId ?? null,
    materialProfileId: p.materialProfileId ?? null,
    mesinPerJam: resolveMesinAktual(p, deps),
    color: p.color ?? null,
  }))
}
```

- [ ] **Step 6: Wiring di service.ts — read path (`toKalkulasiData`)**

Di `apps/dashboard/lib/kalkulator/service.ts`, cari fungsi `toKalkulasiData` (persis seperti ini bagian plates):

```ts
    plates: (raw.plates ?? []).map((p: any) => ({
      ...p,
      materials: p.materialsJson ? JSON.parse(p.materialsJson) : undefined,
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.filamentHargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      materialProfileId: p.materialProfileId ?? undefined,
      mesinPerJam: p.mesinPerJam ?? undefined,
    })),
```

Ubah jadi (tambah baris `color`):

```ts
    plates: (raw.plates ?? []).map((p: any) => ({
      ...p,
      materials: p.materialsJson ? JSON.parse(p.materialsJson) : undefined,
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.filamentHargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      materialProfileId: p.materialProfileId ?? undefined,
      mesinPerJam: p.mesinPerJam ?? undefined,
      color: p.color ?? undefined,
    })),
```

- [ ] **Step 7: Jalankan test, pastikan lolos**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/__tests__/service-v2.test.ts
```
Expected: PASS (semua test di file itu, termasuk 2 test baru).

- [ ] **Step 8: Type-check seluruh workspace kalkulator-core + dashboard**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "service\.ts|PlateInput|types\.ts"
```
Expected: tidak ada output (no errors).

- [ ] **Step 9: Commit**

```bash
git add packages/kalkulator-core/src/types.ts apps/dashboard/prisma/schema.prisma apps/dashboard/lib/kalkulator/service.ts apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts
git commit -m "feat(kalkulator): tambah field color di single-material plate (tipe + schema + service)"
```

---

### Task 2: `color-catalog.ts` — matching, sorting, dan pencarian warna katalog (pure functions)

**Files:**
- Create: `apps/dashboard/lib/kalkulator/color-catalog.ts`
- Test: `apps/dashboard/lib/kalkulator/__tests__/color-catalog.test.ts`

**Interfaces:**
- Consumes: `FilamentCatalogEntry` dari `@/lib/filamen/types` (sudah ada: `{ id, brand, material, colorName, colorHex }`), `isValidHexColor` dari `@3pb/ui` (sudah ada, dipakai `PlateTable.tsx`).
- Produces: `catalogMatchesFilament(catalogField: string, filamentField: string): boolean`, `findCatalogColorsForFilament(catalog: Record<string, Record<string, FilamentCatalogEntry[]>>, brand: string, material: string): FilamentCatalogEntry[]`, `sortCatalogColors(entries: FilamentCatalogEntry[], referenceColor: string | undefined): FilamentCatalogEntry[]` — dipakai `PlateTable.tsx` (Task 4).

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/lib/kalkulator/__tests__/color-catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { catalogMatchesFilament, findCatalogColorsForFilament, sortCatalogColors } from '../color-catalog'
import type { FilamentCatalogEntry } from '@/lib/filamen/types'

describe('catalogMatchesFilament', () => {
  it('matches substring dua arah, case-insensitive', () => {
    expect(catalogMatchesFilament('Bambu Lab', 'BambuLab')).toBe(false) // beda literal, tanpa spasi tidak substring
    expect(catalogMatchesFilament('PLA', 'PLA Basic')).toBe(true)
    expect(catalogMatchesFilament('pla basic', 'PLA')).toBe(true)
    expect(catalogMatchesFilament('esun', 'eSUN')).toBe(true)
  })

  it('return true kalau salah satu field kosong (ga nge-filter apa-apa)', () => {
    expect(catalogMatchesFilament('', 'PLA')).toBe(true)
    expect(catalogMatchesFilament('PLA', '')).toBe(true)
  })
})

function entry(over: Partial<FilamentCatalogEntry> = {}): FilamentCatalogEntry {
  return { id: 'x', brand: 'eSUN', material: 'PLA+', colorName: 'Merah', colorHex: '#FF0000', ...over }
}

describe('findCatalogColorsForFilament', () => {
  const catalog = {
    'eSUN': {
      'PLA+': [entry({ id: 'a', colorName: 'Merah', colorHex: '#FF0000' }), entry({ id: 'b', colorName: 'Biru', colorHex: '#0000FF' })],
      'ABS': [entry({ id: 'c', material: 'ABS', colorName: 'Hitam', colorHex: '#000000' })],
    },
    'Bambu Lab': {
      'PLA': [entry({ id: 'd', brand: 'Bambu Lab', material: 'PLA', colorName: 'Putih', colorHex: '#FFFFFF' })],
    },
  }

  it('cuma ambil entries yang brand DAN material-nya fuzzy-match', () => {
    const result = findCatalogColorsForFilament(catalog, 'eSUN', 'PLA+')
    expect(result.map(e => e.id).sort()).toEqual(['a', 'b'])
  })

  it('material beda (ABS) ga ikut kebawa walau brand sama', () => {
    const result = findCatalogColorsForFilament(catalog, 'eSUN', 'PLA+')
    expect(result.some(e => e.id === 'c')).toBe(false)
  })

  it('brand kosong → match by material aja', () => {
    const result = findCatalogColorsForFilament(catalog, '', 'PLA+')
    expect(result.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('ga ada yang match → array kosong', () => {
    expect(findCatalogColorsForFilament(catalog, 'Sunlu', 'TPU')).toEqual([])
  })
})

describe('sortCatalogColors', () => {
  const entries = [
    entry({ id: 'a', colorName: 'Zebra Putih', colorHex: '#FFFFFF' }),
    entry({ id: 'b', colorName: 'Abu Gelap', colorHex: '#333333' }),
    entry({ id: 'c', colorName: 'Merah', colorHex: '#FF0000' }),
  ]

  it('referenceColor valid → sort by jarak RGB terdekat dulu', () => {
    const sorted = sortCatalogColors(entries, '#111111') // paling deket ke Abu Gelap (#333333)
    expect(sorted.map(e => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('referenceColor undefined/invalid → sort alfabetis by colorName', () => {
    expect(sortCatalogColors(entries, undefined).map(e => e.id)).toEqual(['b', 'c', 'a']) // Abu, Merah, Zebra
    expect(sortCatalogColors(entries, 'bukan-hex').map(e => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('tidak memodifikasi array input (return array baru)', () => {
    const original = [...entries]
    sortCatalogColors(entries, undefined)
    expect(entries).toEqual(original)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/__tests__/color-catalog.test.ts
```
Expected: FAIL — module `../color-catalog` tidak ditemukan.

- [ ] **Step 3: Implementasi**

Create `apps/dashboard/lib/kalkulator/color-catalog.ts`:

```ts
import { isValidHexColor } from '@3pb/ui'
import type { FilamentCatalogEntry } from '@/lib/filamen/types'

/** Cocokin dua string (brand ATAU material) pakai substring dua arah, case-insensitive.
 *  Field kosong dianggap "cocok apa aja" (tidak nge-filter). Pola sama persis dengan
 *  materialProfileMatchesFilament di PlateTable.tsx. */
export function catalogMatchesFilament(catalogField: string, filamentField: string): boolean {
  const a = catalogField.trim().toLowerCase()
  const b = filamentField.trim().toLowerCase()
  if (!a || !b) return true
  return a.includes(b) || b.includes(a)
}

/** Cari semua entry FilamentCatalog yang brand+material-nya fuzzy-match ke filament
 *  yang lagi dipilih. `catalog` adalah bentuk yang dikembalikan useCatalog(): nested by
 *  brand lalu material. */
export function findCatalogColorsForFilament(
  catalog: Record<string, Record<string, FilamentCatalogEntry[]>>,
  brand: string,
  material: string,
): FilamentCatalogEntry[] {
  const result: FilamentCatalogEntry[] = []
  for (const catalogBrand of Object.keys(catalog)) {
    if (!catalogMatchesFilament(catalogBrand, brand)) continue
    for (const catalogMaterial of Object.keys(catalog[catalogBrand])) {
      if (!catalogMatchesFilament(catalogMaterial, material)) continue
      result.push(...catalog[catalogBrand][catalogMaterial])
    }
  }
  return result
}

function hexToRgb(hex: string): [number, number, number] | null {
  const stripped = hex.trim().replace(/^#/, '')
  if (stripped.length !== 3 && stripped.length !== 6) return null
  const full = stripped.length === 3 ? stripped.split('').map(c => c + c).join('') : stripped
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return null
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function hexDistance(a: string, b: string): number {
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  if (!rgbA || !rgbB) return Infinity
  return Math.sqrt((rgbA[0] - rgbB[0]) ** 2 + (rgbA[1] - rgbB[1]) ** 2 + (rgbA[2] - rgbB[2]) ** 2)
}

/** Sort katalog warna: kalau referenceColor hex valid (biasa dari hasil import 3MF),
 *  urutkan by jarak RGB terdekat dulu. Kalau kosong/invalid, urutkan alfabetis by nama. */
export function sortCatalogColors(entries: FilamentCatalogEntry[], referenceColor: string | undefined): FilamentCatalogEntry[] {
  const ref = referenceColor && isValidHexColor(referenceColor) ? referenceColor : null
  const sorted = [...entries]
  if (ref) {
    sorted.sort((a, b) => hexDistance(a.colorHex, ref) - hexDistance(b.colorHex, ref))
  } else {
    sorted.sort((a, b) => a.colorName.localeCompare(b.colorName))
  }
  return sorted
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/__tests__/color-catalog.test.ts
```
Expected: PASS (11 test).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/color-catalog.ts apps/dashboard/lib/kalkulator/__tests__/color-catalog.test.ts
git commit -m "feat(kalkulator): color-catalog.ts — matching, sorting, cari warna dari FilamentCatalog"
```

---

### Task 3: `HexColorPicker` — komponen popover interaktif di `@3pb/ui`

**Files:**
- Modify: `packages/ui/src/HexColorSwatch.tsx`
- Create: `packages/ui/src/HexColorPicker.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `HexColorSwatch`, `isValidHexColor` dari `./HexColorSwatch` (sudah ada di package ini).
- Produces: `HexColorPicker({ color, options, onSelect, className? }): JSX.Element` — `options: HexColorPickerOption[]` (`{ id: string; colorName: string; colorHex: string }`), `onSelect: (hex: string) => void`. Dipakai `PlateTable.tsx` (Task 4).

Tidak ada test otomatis untuk komponen ini (murni UI/popover interaktif — konsisten dengan `HexColorSwatch` dan komponen visual lain di codebase ini yang tidak punya test file, lihat `PlateTable.tsx` yang juga tanpa test). Verifikasi lewat `tsc` + review visual manual di Task 4.

- [ ] **Step 1: Buat `HexColorPicker.tsx`**

Create `packages/ui/src/HexColorPicker.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { HexColorSwatch, isValidHexColor } from './HexColorSwatch'

export interface HexColorPickerOption {
  id: string
  colorName: string
  colorHex: string
}

interface HexColorPickerProps {
  /** Hex warna yang lagi aktif di field ini (buat highlight opsi yang match) */
  color: string
  /** Daftar warna katalog buat brand+material yang lagi dipilih, sudah di-sort oleh caller */
  options: HexColorPickerOption[]
  onSelect: (hex: string) => void
  className?: string
}

/** Swatch warna yang jadi tombol trigger popover daftar warna katalog.
 *  Text input hex manual di sekitar komponen ini TIDAK digantikan — ini cuma shortcut opsional. */
export function HexColorPicker({ color, options, onSelect, className = '' }: HexColorPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-3 h-3 rounded-full flex-shrink-0 cursor-pointer"
        style={
          isValidHexColor(color)
            ? { background: color, border: '1px solid rgba(255,255,255,0.25)' }
            : { border: '1px dashed rgba(255,255,255,0.35)' }
        }
        aria-label="Pilih warna dari katalog"
        title="Pilih warna dari katalog"
      />

      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 w-56 rounded-[10px] shadow-xl overflow-hidden"
          style={{ background: 'rgba(22,23,38,0.97)', border: '1px solid rgba(99,102,241,0.2)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          <div className="max-h-48 overflow-y-auto p-1">
            {options.length === 0 && (
              <div className="text-[10px] text-center py-3 px-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Tidak ada warna terkatalog untuk kombinasi ini
              </div>
            )}
            {options.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelect(o.colorHex); setOpen(false) }}
                className="w-full text-left px-2 py-1.5 rounded-[6px] text-xs flex items-center gap-2 transition-all"
                style={
                  o.colorHex.toLowerCase() === color.trim().toLowerCase()
                    ? { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }
                    : { color: 'rgba(255,255,255,0.85)' }
                }
              >
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ background: o.colorHex, border: '1px solid rgba(255,255,255,0.25)' }}
                />
                <span className="flex-1 truncate">{o.colorName}</span>
                <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{o.colorHex}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Export dari `index.ts`**

Di `packages/ui/src/index.ts`, cari baris:

```ts
export { HexColorSwatch, isValidHexColor } from './HexColorSwatch'
```

Tambahkan setelahnya:

```ts
export { HexColorSwatch, isValidHexColor } from './HexColorSwatch'
export { HexColorPicker, type HexColorPickerOption } from './HexColorPicker'
```

- [ ] **Step 3: Type-check package ui**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/ui exec tsc --noEmit
```
Expected: tidak ada output (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/HexColorPicker.tsx packages/ui/src/index.ts
git commit -m "feat(ui): HexColorPicker — popover pilih warna, bungkus HexColorSwatch"
```

---

### Task 4: Wiring di `PlateTable.tsx` — single & multi-material mode

**Files:**
- Modify: `apps/dashboard/components/kalkulator/PlateTable.tsx`

**Interfaces:**
- Consumes: `HexColorPicker`, `type HexColorPickerOption` dari `@3pb/ui` (Task 3), `findCatalogColorsForFilament`, `sortCatalogColors` dari `@/lib/kalkulator/color-catalog` (Task 2), `useCatalog` dari `@/lib/hooks/use-filamen` (sudah ada), `PlateInputApp.color` (Task 1, otomatis ikut karena `PlateInputApp extends PlateInput`).

Tidak ada test otomatis (murni UI wiring, logic-nya sudah di-test di Task 2) — verifikasi lewat `tsc` + Step 6 (baca ulang kode, tidak ada browser di environment ini per catatan sebelumnya di sesi ini).

- [ ] **Step 1: Tambah import**

Di `apps/dashboard/components/kalkulator/PlateTable.tsx`, baris 1-7 sekarang persis:

```tsx
"use client"

import { useState, useRef, useEffect } from "react"
import type { PlateInputApp, PrintTipe, FilamentEntry, FilamentHargaData } from "@/lib/kalkulator/types"
import type { MaterialProfileData } from "@/lib/kalkulator/profiles-service"
import { useFilamentHarga, usePrinterProfiles, useMaterialProfiles } from "@/lib/hooks/use-kalkulator"
import { HexColorSwatch, isValidHexColor } from "@3pb/ui"
```

Ubah jadi:

```tsx
"use client"

import { useState, useRef, useEffect } from "react"
import type { PlateInputApp, PrintTipe, FilamentEntry, FilamentHargaData } from "@/lib/kalkulator/types"
import type { MaterialProfileData } from "@/lib/kalkulator/profiles-service"
import { useFilamentHarga, usePrinterProfiles, useMaterialProfiles } from "@/lib/hooks/use-kalkulator"
import { useCatalog } from "@/lib/hooks/use-filamen"
import { HexColorSwatch, HexColorPicker, isValidHexColor, type HexColorPickerOption } from "@3pb/ui"
import { findCatalogColorsForFilament, sortCatalogColors } from "@/lib/kalkulator/color-catalog"
```

- [ ] **Step 2: Ambil data katalog + bikin helper di dalam `PlateTable`**

Cari baris ini di dalam function `PlateTable` (sekitar baris 168-171 sekarang):

```tsx
  const { data: filamentHargaData } = useFilamentHarga()
  const filamentCatalog: FilamentHargaData[] = filamentHargaData ?? []
  const { data: printerProfiles } = usePrinterProfiles()
  const { data: materialProfiles } = useMaterialProfiles()
```

Ubah jadi (tambah `useCatalog` + helper `colorOptionsFor`):

```tsx
  const { data: filamentHargaData } = useFilamentHarga()
  const filamentCatalog: FilamentHargaData[] = filamentHargaData ?? []
  const { data: printerProfiles } = usePrinterProfiles()
  const { data: materialProfiles } = useMaterialProfiles()
  const { data: catalogData } = useCatalog()

  function colorOptionsFor(brand: string, material: string, referenceColor: string | undefined): HexColorPickerOption[] {
    const catalog = catalogData?.catalog ?? {}
    const matched = findCatalogColorsForFilament(catalog, brand, material)
    return sortCatalogColors(matched, referenceColor).map(e => ({ id: e.id, colorName: e.colorName, colorHex: e.colorHex }))
  }
```

- [ ] **Step 3: Wiring di SINGLE MATERIAL MODE — tambah field warna**

Cari blok ini (persis, sekitar baris 364-397 sekarang — bagian grid Tipe/Gramasi/Durasi):

```tsx
                <div className="grid gap-2" style={{ gridTemplateColumns: "80px 1fr 1fr" }}>

                  {/* Tipe: FDM / SLA */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Tipe</div>
                    <div className="flex gap-1 h-10">
                      {(["FDM", "SLA"] as PrintTipe[]).map(t => (
                        <button
                          key={t}
                          onClick={() => updatePlate(plate.key, "tipe", t)}
                          className="flex-1 rounded-[6px] text-xs font-bold transition-all"
                          style={plate.tipe === t
                            ? { background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                            : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gramasi */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Gramasi (g)</div>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="21"
                      value={plate.gramasi || ""}
                      onChange={e => updatePlate(plate.key, "gramasi", parseFloat(e.target.value) || 0)}
                      className="glass-input w-full h-10 rounded-[8px] px-3 text-sm"
                    />
                  </div>

                  {/* Durasi */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Durasi</div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="1:30 atau 1.5"
                        value={durasiRaw[plate.key] ?? (plate.durasiJam ? String(parseFloat(plate.durasiJam.toFixed(2))) : "")}
                        onChange={e => handleDurasiChange(plate.key, e.target.value)}
                        className="glass-input w-full h-10 rounded-[8px] px-3 text-sm"
                      />
                      {plate.durasiJam > 0 && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
                              style={{ color: "rgba(99,102,241,0.7)" }}>
                          {formatDurasiDisplay(plate.durasiJam)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
```

Ubah `gridTemplateColumns` dari `"80px 1fr 1fr"` jadi `"80px 1fr 1fr 90px"` (tambah 1 kolom), dan tambahkan blok "Warna" baru persis setelah `{/* Durasi */}` block, sebelum penutup `</div>` grid:

```tsx
                <div className="grid gap-2" style={{ gridTemplateColumns: "80px 1fr 1fr 90px" }}>

                  {/* Tipe: FDM / SLA */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Tipe</div>
                    <div className="flex gap-1 h-10">
                      {(["FDM", "SLA"] as PrintTipe[]).map(t => (
                        <button
                          key={t}
                          onClick={() => updatePlate(plate.key, "tipe", t)}
                          className="flex-1 rounded-[6px] text-xs font-bold transition-all"
                          style={plate.tipe === t
                            ? { background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                            : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gramasi */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Gramasi (g)</div>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="21"
                      value={plate.gramasi || ""}
                      onChange={e => updatePlate(plate.key, "gramasi", parseFloat(e.target.value) || 0)}
                      className="glass-input w-full h-10 rounded-[8px] px-3 text-sm"
                    />
                  </div>

                  {/* Durasi */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Durasi</div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="1:30 atau 1.5"
                        value={durasiRaw[plate.key] ?? (plate.durasiJam ? String(parseFloat(plate.durasiJam.toFixed(2))) : "")}
                        onChange={e => handleDurasiChange(plate.key, e.target.value)}
                        className="glass-input w-full h-10 rounded-[8px] px-3 text-sm"
                      />
                      {plate.durasiJam > 0 && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
                              style={{ color: "rgba(99,102,241,0.7)" }}>
                          {formatDurasiDisplay(plate.durasiJam)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Warna */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Warna</div>
                    <div className="relative flex items-center h-10">
                      <HexColorPicker
                        color={plate.color ?? ""}
                        options={colorOptionsFor(
                          filamentCatalog.find(f => f.id === plate.filamentHargaId)?.brand ?? "",
                          filamentCatalog.find(f => f.id === plate.filamentHargaId)?.material ?? "",
                          plate.color,
                        )}
                        onSelect={hex => updatePlate(plate.key, "color", hex)}
                        className="absolute left-2 z-10"
                      />
                      <input
                        type="text"
                        placeholder="#RRGGBB"
                        value={plate.color ?? ""}
                        onChange={e => updatePlate(plate.key, "color", e.target.value)}
                        className="glass-input w-full h-10 rounded-[8px] text-xs font-mono tracking-tight"
                        style={{ paddingLeft: isValidHexColor(plate.color ?? "") ? "26px" : "12px", paddingRight: "6px" }}
                      />
                    </div>
                  </div>
                </div>
```

- [ ] **Step 4: Wiring di MULTI-MATERIAL MODE — ganti `HexColorSwatch` jadi `HexColorPicker`**

Cari blok ini (persis, sekitar baris 456-466 sekarang):

```tsx
                    <div className="relative">
                      <HexColorSwatch color={mat.color} className="absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Warna"
                        value={mat.color}
                        onChange={e => updateMaterial(plate.key, mIdx, "color", e.target.value)}
                        className="glass-input h-8 rounded-[6px] pr-1.5 text-[11px] w-full font-mono tracking-tight"
                        style={{ paddingLeft: isValidHexColor(mat.color) ? "24px" : "8px" }}
                      />
                    </div>
```

Ubah jadi:

```tsx
                    <div className="relative">
                      <HexColorPicker
                        color={mat.color}
                        options={colorOptionsFor(mat.brand, mat.material, mat.color)}
                        onSelect={hex => updateMaterial(plate.key, mIdx, "color", hex)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-10"
                      />
                      <input
                        type="text"
                        placeholder="Warna"
                        value={mat.color}
                        onChange={e => updateMaterial(plate.key, mIdx, "color", e.target.value)}
                        className="glass-input h-8 rounded-[6px] pr-1.5 text-[11px] w-full font-mono tracking-tight"
                        style={{ paddingLeft: isValidHexColor(mat.color) ? "24px" : "8px" }}
                      />
                    </div>
```

Catatan: `HexColorSwatch` (import lama) sekarang tidak lagi dipakai langsung di file ini — TAPI biarkan tetap ada di baris import (masih diexport/dipakai kalau nanti dibutuhkan lagi, dan menghapusnya bukan bagian dari scope task ini). Kalau linter/tsc mengeluh `HexColorSwatch` unused, hapus dari import list di Step 1 — cek di Step 5.

- [ ] **Step 5: Type-check**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "PlateTable"
```
Expected: tidak ada output. Kalau ada warning "HexColorSwatch is declared but never used" (bukan dari `tsc --noEmit` biasanya, tapi kalau muncul), hapus `HexColorSwatch` dari import di Step 1 (sisakan `HexColorPicker, isValidHexColor`).

- [ ] **Step 6: Jalankan regresi test suite dashboard**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx vitest run --passWithNoTests --exclude "**/.claude/**"
```
Expected: semua test file PASS (baseline terakhir 277 + test baru dari Task 1 & 2 di plan ini = 277 + 2 + 11 = 290 test, semua hijau, tidak ada regresi). Catatan: kalau ada worktree lain nyangkut di dalam `apps/dashboard/.claude/worktrees/`, flag `--exclude "**/.claude/**"` di atas sudah nge-skip itu — ini bukan masalah dari perubahan plan ini kalau muncul, itu polusi test dari sesi lain.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/components/kalkulator/PlateTable.tsx
git commit -m "feat(kalkulator): pilih warna dari katalog filament — wiring single & multi-material mode"
```

---

## Self-Review

**1. Spec coverage** (`docs/superpowers/specs/2026-07-23-kalkulator-pilih-warna-katalog-design.md`):
- Field `color` di single-material `PlateInput` + Prisma → Task 1 ✅
- Fuzzy match brand+material dua arah → Task 2 (`catalogMatchesFilament`) ✅
- Sort nearest-color kalau ada referensi, alfabetis kalau kosong → Task 2 (`sortCatalogColors`) ✅
- Swatch jadi tombol trigger popover (Opsi A dari mockup) → Task 3 (`HexColorPicker`) ✅
- Text input manual tetap ada → Task 4 (input tidak dihapus, cuma ditambah `HexColorPicker` di sampingnya) ✅
- Popover tetap kebuka + pesan "Tidak ada warna terkatalog..." kalau kosong → Task 3 (`options.length === 0` branch) ✅
- Reusable via `@3pb/ui` buat `apps/saas` → Task 3 (komponen di package `@3pb/ui`, bukan langsung di `PlateTable.tsx`) ✅
- Warna tidak masuk kalkulasi HPP → tidak ada task yang menyentuh `formula.ts`/`resolve-v2.ts` untuk field ini ✅

**2. Placeholder scan:** tidak ada "TBD"/"implement later" — semua step punya kode lengkap.

**3. Type consistency:** `HexColorPickerOption` (Task 3: `{id, colorName, colorHex}`) dipakai identik di Task 4 (`colorOptionsFor` return type). `findCatalogColorsForFilament`/`sortCatalogColors` (Task 2) signature dipakai persis sama di Task 4. `plate.color`/`mat.color` (Task 1 & yang sudah ada) dipakai konsisten di Task 4 — `plate.color` optional (`string | undefined`, di-default `""` saat dikirim ke `HexColorPicker`/input), `mat.color` sudah required string dari `FilamentEntry` yang sudah ada.

---

## Execution Handoff

Plan complete dan tersimpan di `docs/superpowers/plans/2026-07-23-kalkulator-pilih-warna-katalog.md`. Dua opsi eksekusi:

1. **Subagent-Driven (recommended)** — saya dispatch subagent fresh per task, review 2 tahap (spec compliance → code quality) tiap task, iterasi cepat.
2. **Inline Execution** — saya eksekusi task-by-task di sesi ini langsung, checkpoint tiap beberapa task buat direview.

Mau pakai yang mana?
