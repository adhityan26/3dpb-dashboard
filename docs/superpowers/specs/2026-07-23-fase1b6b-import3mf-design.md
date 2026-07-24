# Fase 1b-6b — Import `.3mf` / `.gcode.3mf` (apps/saas)

**Tanggal:** 2026-07-23 (revisi 2026-07-24)
**Status:** Design (disetujui) — Stage 1 selesai, lanjut Stage 2
**Prasyarat:** 1b-6a MERGED (`acd30cf`) — katalog filament (`LocalSettings.filaments`) + multi-material per plate (`PlateRow.materials`) sudah ada.

## Tujuan

User bisa **impor file slicer** (`.3mf` / `.gcode.3mf` dari Bambu Studio / OrcaSlicer) di kalkulator saas → otomatis mengisi plates, berat per material (gram), durasi, dan warna filament — tanpa input manual. Tarif tiap material dicocokkan ke katalog filament (1b-6a). Semua parsing di **browser** (jszip, tanpa upload server).

## Keputusan terkunci (brainstorm 2026-07-23)

1. ~~Extract ke package bersama `@3pb/import-3mf`~~ — **superseded**, lihat catatan revisi di bawah.
2. **Filament tak match katalog → fallback tarif default (`material[tipe]`) + warning**, warna tetap dari file. Non-destruktif.

## Revisi 2026-07-24 — Stage 1 selesai, arsitektur beda dari rencana awal

Rencana awal (package standalone `@3pb/import-3mf`) sudah dikerjakan **oleh sesi paralel** dengan pendekatan lebih simpel: bukan package baru, tapi **subpath export `@3pb/kalkulator-core/import-3mf`** (`packages/kalkulator-core/src/import-3mf/`) — karena `kalkulator-core` sudah jadi dependency dashboard & saas, jadi tak perlu package terpisah. Sudah **merged ke master** (commit `604f900`, di atas fitur thumbnail plate dashboard `633f76b`).

Isinya (verified, master saat ini):
- `read-zip.ts` — `readGcode3mfEntries(buf): Promise<Raw3mfEntries | null>` **+ `readPlateThumbnails(buf, plateCount): Promise<(Blob|null)[]>`** (bonus dari fitur thumbnail dashboard, ekstrak `Metadata/plate_N.png`, portable & gratis dipakai saas kalau nanti diperlukan — **tidak dipakai di Stage 2 ini**, lihat "Di luar scope").
- `parse-slice-info.ts` (`parseSliceInfo`), `parse-model-settings.ts` (`parseModelSettingsPlates`), `parse-project-settings.ts` (`parseProjectSettingsFilamentSlots`).
- `types.ts` — `SliceInfoFilament`, `SliceInfoPlate`, `ModelSettingsPlate`, `ProjectFilamentSlot`, `Raw3mfEntries` (murni, tanpa `Kalkulasi3mfDraft` — itu tetap app-coupled di dashboard).
- `index.ts` — re-export semua di atas.

Dashboard sudah dimigrasi konsumsi lokasi baru ini (`build-draft.ts`, `index.ts` dashboard import dari `@3pb/kalkulator-core/import-3mf`), 296 test dashboard + 54 test core hijau, nol regresi.

**Konsekuensi buat spec ini:** Stage 1b-6b-1 (di bawah) sudah **selesai, tidak perlu dikerjakan lagi**. Semua referensi `@3pb/import-3mf` di Stage 2 berikutnya berarti `@3pb/kalkulator-core/import-3mf`. `jszip` sudah jadi dependency `@3pb/kalkulator-core` — saas dapat gratis lewat dependency yang sudah ada, tidak perlu tambah `@3pb/import-3mf` ke `package.json`.

Matching filament di build-draft = **brand+material exact, case-insensitive** (warna tidak dipakai untuk match; warna cuma display). Cocok dengan katalog saas 1b-6a (`FilamentEntry {brand, material, tipe, warna, warnaHex}`).

## Arsitektur

### ~~Stage 1b-6b-1~~ — SELESAI (lihat revisi di atas)

### Stage 1b-6b-2 — Konsumen saas + UI import

`apps/saas/lib/kalkulator/import-3mf/` (baru):
- `build-draft.ts` — versi saas. Input: `SliceInfoPlate[]`, `ModelSettingsPlate[]`, `ProjectFilamentSlot[]`, `filamentCatalog: FilamentEntry[]` (dari `LocalSettings.filaments`). Output: draft saas.
- `index.ts` — orkestrator: `importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null>` → `readGcode3mfEntries` (dari `@3pb/kalkulator-core/import-3mf`) → parse → `buildSaasDraft`.
- Tidak ada dependency baru — `@3pb/kalkulator-core` sudah ada di `apps/saas/package.json`, `jszip` ikut transitif.

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

- **saas build-draft.test:** (a) plate 2 filament, satu match katalog (set filamentId+tipe+warna) satu tak match (fallback + warning); (b) multi-plate → banyak PlateRow dengan nama dari model-settings; (c) belum di-slice → isSliced false + gram/durasi 0 + warning; (d) `tipeFromMaterial` resin→SLA, PLA→FDM. Fixtur = string XML/JSON in-memory (pola test dashboard).
- **saas index.test:** file zip in-memory (helper `makeZip` seperti dashboard) → `importSlicerFile` → draft plates terisi; file invalid → null.
- **UI test:** tombol import muncul untuk Pro, tidak untuk Free; simulasi draft → `onPlatesChange`/`onBatchChange` terpanggil + warning tampil.
- Seluruh suite saas + core hijau; build lolos.

## Di luar scope

- Raw `.gcode` non-zip (format zip 3MF saja).
- Nearest-color sort / fuzzy brand-material match (dashboard `color-catalog.ts`) — saas exact match saja.
- Auto-tambah filament ke katalog (ditolak di brainstorm — fallback default + warning saja).
- Simpan hasil/riwayat (1b-4) — juga berarti **thumbnail plate persist** (butuh tabel `Kalkulasi`/`Plate` server-side yang belum ada di saas) di luar scope; `readPlateThumbnails` sudah tersedia gratis di package tapi baru masuk akal dipakai setelah 1b-4 ada tempat menyimpannya.

## File tersentuh (perkiraan)

**saas:** `apps/saas/lib/kalkulator/import-3mf/{build-draft.ts,index.ts,*.test.ts}`, `apps/saas/components/PlateInput.tsx` (+ `Calculator.tsx`).
