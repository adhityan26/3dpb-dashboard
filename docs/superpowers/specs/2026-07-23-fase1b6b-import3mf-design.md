# Fase 1b-6b — Import `.3mf` / `.gcode.3mf` (apps/saas) + package `@3pb/import-3mf`

**Tanggal:** 2026-07-23
**Status:** Design (disetujui — menunggu review spec sebelum plan)
**Prasyarat:** 1b-6a MERGED (`acd30cf`) — katalog filament (`LocalSettings.filaments`) + multi-material per plate (`PlateRow.materials`) sudah ada.

## Tujuan

User bisa **impor file slicer** (`.3mf` / `.gcode.3mf` dari Bambu Studio / OrcaSlicer) di kalkulator saas → otomatis mengisi plates, berat per material (gram), durasi, dan warna filament — tanpa input manual. Tarif tiap material dicocokkan ke katalog filament (1b-6a). Semua parsing di **browser** (jszip, tanpa upload server).

Sekaligus **mengangkat parser murni** yang sekarang cuma di dashboard ke **package bersama `@3pb/import-3mf`** supaya saas & dashboard pakai satu sumber.

## Keputusan terkunci (brainstorm 2026-07-23)

1. **Extract ke package bersama `@3pb/import-3mf`** (bukan copy) — dipakai saas DAN dashboard. Konsekuensi: dashboard di-refactor untuk konsumsi package (mekanis, ganti path import; perilaku & test dashboard tak berubah).
2. **Filament tak match katalog → fallback tarif default (`material[tipe]`) + warning**, warna tetap dari file. Non-destruktif.

## Hasil Explore (peta reuse, master `acd30cf`)

Parser di `apps/dashboard/lib/kalkulator/import-3mf/`:
- **MURNI (pindah ke package):** `read-zip.ts` (`readGcode3mfEntries`, butuh `jszip`), `parse-slice-info.ts` (`parseSliceInfo`), `parse-model-settings.ts` (`parseModelSettingsPlates`), `parse-project-settings.ts` (`parseProjectSettingsFilamentSlots`) + tipe data murni (`SliceInfoFilament`, `SliceInfoPlate`, `ModelSettingsPlate`, `ProjectFilamentSlot`, `Raw3mfEntries`). Parsing XML pakai regex (tanpa `fast-xml-parser`). Satu-satunya dep npm: `jszip`.
- **APP-SPECIFIC (tetap per-app):** `build-draft.ts`, `index.ts` (orkestrator), `printer-mapping.ts` (**dashboard-only** — saas tak punya printer profile, pakai `mesinPerJam` tetap), dan tipe `Kalkulasi3mfDraft` (pakai `PlateInputApp` khusus dashboard).

Matching filament di build-draft = **brand+material exact, case-insensitive** (warna tidak dipakai untuk match; warna cuma display). Cocok dengan katalog saas 1b-6a (`FilamentEntry {brand, material, tipe, warna, warnaHex}`).

## Arsitektur

Dua stage.

### Stage 1b-6b-1 — Package `@3pb/import-3mf` (refactor murni, nol perubahan perilaku)

Package baru mengikuti scaffold `@3pb/kalkulator-core` (type: module, `exports: "./src/index.ts"`, tsconfig bundler, vitest), **plus dependency `jszip`**.

Isi `packages/import-3mf/src/`:
- `read-zip.ts`, `parse-slice-info.ts`, `parse-model-settings.ts`, `parse-project-settings.ts` — dipindah **verbatim** dari dashboard (pure, tanpa perubahan logika).
- `types.ts` — tipe data murni: `SliceInfoFilament`, `SliceInfoPlate`, `ModelSettingsPlate`, `ProjectFilamentSlot`, `Raw3mfEntries`. (`Kalkulasi3mfDraft` **tidak** ikut — app-coupled.)
- `index.ts` — re-export semua parser + tipe.
- Test-nya (`*.test.ts`) dipindah dari `apps/dashboard/.../__tests__/` → `packages/import-3mf/src/` (fixtur in-memory, tak ada file biner).

Dashboard di-retarget:
- `apps/dashboard/lib/kalkulator/import-3mf/` — hapus 4 file parser murni + 5 tipe murni yang dipindah + test-nya.
- File tersisa dashboard (`build-draft.ts`, `index.ts`, `printer-mapping.ts`, `types.ts` yang menyimpan `Kalkulasi3mfDraft`) — ganti import parser/tipe murni dari `../../` lokal → `@3pb/import-3mf`.
- Tambah `@3pb/import-3mf` ke `apps/dashboard/package.json` (`workspace:*`).
- **Verifikasi:** seluruh test dashboard yang tersisa + test package hijau = bukti nol regresi.

### Stage 1b-6b-2 — Konsumen saas + UI import

`apps/saas/lib/kalkulator/import-3mf/` (baru):
- `build-draft.ts` — versi saas. Input: `SliceInfoPlate[]`, `ModelSettingsPlate[]`, `ProjectFilamentSlot[]`, `filamentCatalog: FilamentEntry[]` (dari `LocalSettings.filaments`). Output: draft saas.
- `index.ts` — orkestrator: `importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null>` → `readGcode3mfEntries` (dari package) → parse → `buildSaasDraft`.
- Tambah dep `@3pb/import-3mf` (`workspace:*`) ke `apps/saas/package.json`. (`jszip` masuk transitif lewat package.)

Tipe draft saas:
```ts
export interface ImportDraft {
  nama: string;
  plates: PlateRow[];          // dari components/PlateInput (materials[])
  batch: number;
  isSliced: boolean;
  warnings: string[];
}
```

Mapping draft → `PlateRow`/`PlateMaterial`:
- Tiap `SliceInfoPlate` → `PlateRow { id: newId(), nama: platerName (dari model-settings) || "Plate N", durasiJam: String(predictionSec/3600 dibulatkan), materials: [...] }`.
- Tiap `SliceInfoFilament` dalam plate → `PlateMaterial`:
  - brand = `ProjectFilamentSlot[id-1].vendor`; material = slot `.type` (fallback filament `.type`).
  - Cocokkan `filaments.find(f => f.brand.toLowerCase()===brand && f.material.toLowerCase()===material)`.
  - Match → `{ id: newId(), filamentId: match.id, tipe: match.tipe, gramasi: String(usedG), warnaHex: color }`.
  - Tak match → `{ id: newId(), filamentId: undefined, tipe: tipeFromMaterial(material), gramasi: String(usedG), warnaHex: color }` + push warning `` `Filament "${brand} ${material}" belum ada di katalog — pakai tarif default` ``.
  - `tipeFromMaterial(m)` = `/resin|uv/i.test(m) ? "SLA" : "FDM"` (Bambu/Orca = FDM).
- `batch` = objectCount plate pertama (atau 1), seperti dashboard.
- Belum di-slice (`slice_info` absen) → `isSliced: false`, plates dari model-settings dengan gram/durasi 0 + warning `"File belum di-slice — isi berat & durasi manual"`.
- File bukan zip/3MF valid (`readGcode3mfEntries` → null) → kembalikan `null` (UI tampilkan error "File tidak dikenali").

UI (Pro, di `components/PlateInput.tsx` atau `Calculator.tsx`):
- Tombol "⬆ Import file slicer" di section Produksi (hanya non-locked/Pro). `<input type="file" accept=".3mf,.gcode.3mf">` tersembunyi.
- On file → `importSlicerFile(file, settings.filaments)`:
  - `null` → toast/inline error.
  - draft → `onPlatesChange(draft.plates)` + `onBatchChange(String(draft.batch))`, tampilkan `draft.warnings` (inline list, bisa di-dismiss).
- Gate: locked/Free tak lihat tombol (konsisten multi-plate/multi-material Pro).

## Backward-compat & paritas

- Package extraction = refactor murni; dashboard perilaku identik (test membuktikan).
- Import hanya menulis ke state form (plates/batch) yang sudah ada sejak 1b-3/1b-6a; formula core & compute tak berubah.
- Filament match reuse katalog 1b-6a; fallback default = jalur yang sudah ada (material tanpa filamentId).

## Testing

- **Package:** semua test parser yang dipindah tetap hijau (verbatim). `jszip` resolvable di package.
- **Dashboard:** suite penuh dashboard hijau setelah retarget import (nol regresi).
- **saas build-draft.test:** (a) plate 2 filament, satu match katalog (set filamentId+tipe+warna) satu tak match (fallback + warning); (b) multi-plate → banyak PlateRow dengan nama dari model-settings; (c) belum di-slice → isSliced false + gram/durasi 0 + warning; (d) `tipeFromMaterial` resin→SLA, PLA→FDM. Fixtur = string XML/JSON in-memory (pola test dashboard).
- **saas index.test:** file zip in-memory (helper `makeZip` seperti dashboard) → `importSlicerFile` → draft plates terisi; file invalid → null.
- **UI test:** tombol import muncul untuk Pro, tidak untuk Free; simulasi draft → `onPlatesChange`/`onBatchChange` terpanggil + warning tampil.
- Seluruh suite saas + dashboard + core + package hijau; build lolos.

## Di luar scope

- Raw `.gcode` non-zip (format zip 3MF saja).
- Nearest-color sort / fuzzy brand-material match (dashboard `color-catalog.ts`) — saas exact match saja.
- Auto-tambah filament ke katalog (ditolak di brainstorm — fallback default + warning saja).
- Simpan hasil/riwayat (1b-4).

## File tersentuh (perkiraan)

**Package (baru):** `packages/import-3mf/{package.json,tsconfig.json,vitest.config.ts,src/*}`.
**Dashboard:** `apps/dashboard/lib/kalkulator/import-3mf/*` (hapus file murni + retarget import di build-draft/index/types), `apps/dashboard/package.json`.
**saas:** `apps/saas/lib/kalkulator/import-3mf/{build-draft.ts,index.ts,*.test.ts}`, `apps/saas/components/PlateInput.tsx` (+ `Calculator.tsx`), `apps/saas/package.json`.
**Root:** `pnpm-lock.yaml`, mungkin `pnpm-workspace.yaml` (package sudah ter-glob `packages/*`).
