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

**Konsekuensi buat spec ini:** Stage 1b-6b-1 (di bawah) sudah **selesai, tidak perlu dikerjakan lagi**. Semua referensi `@3pb/import-3mf` di Stage 2 berikutnya berarti `@3pb/kalkulator-core/import-3mf`. Runtime (`readGcode3mfEntries` dkk dipanggil dari `index.ts` saas) resolve `jszip` transitif lewat `@3pb/kalkulator-core` — tidak perlu perubahan apa pun untuk itu. **Tapi** test saas (`index.test.ts`) butuh bikin fixture ZIP sendiri dengan `import JSZip from "jszip"` langsung (pola sama seperti test dashboard) — pnpm strict tak resolve dependency yang tak dideklarasikan eksplisit (lihat CLAUDE.md), jadi `jszip` tetap perlu ditambah sebagai **devDependency** langsung di `apps/saas/package.json` (dashboard punya baris yang sama untuk alasan yang sama).

Matching filament di build-draft = **brand+material exact, case-insensitive** (warna tidak dipakai untuk match; warna cuma display). Cocok dengan katalog saas 1b-6a (`FilamentEntry {brand, material, tipe, warna, warnaHex}`).

## Arsitektur

### ~~Stage 1b-6b-1~~ — SELESAI (lihat revisi di atas)

### Stage 1b-6b-2 — Konsumen saas + UI import

`apps/saas/lib/kalkulator/import-3mf/` (baru):
- `build-draft.ts` — versi saas. Input: `SliceInfoPlate[]`, `ModelSettingsPlate[]`, `ProjectFilamentSlot[]`, `filamentCatalog: FilamentEntry[]` (dari `LocalSettings.filaments`). Output: draft saas.
- `index.ts` — orkestrator: `importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null>` → `readGcode3mfEntries` (dari `@3pb/kalkulator-core/import-3mf`) → parse → `buildImportDraft`.

**Deviasi kecil dari draf awal:** tipe draft TIDAK memakai `PlateRow` langsung (itu tipe komponen di `components/PlateInput.tsx`). Konsisten dengan pola yang sudah ada (`lib/kalkulator/compute.ts` punya `CalcPlate` sendiri, tidak import dari `components/`), `lib/` tetap independen dari `components/`. Draft pakai tipe murni sendiri; konversi ke `PlateRow` (assign `id` via `newId()`) terjadi di pemanggil (`PlateInput.tsx`), sama seperti `Calculator.tsx` mengonversi `PlateRow`→`CalcPlate` lewat `toCalcPlate`.

Tipe draft saas:
```ts
export interface ImportedMaterial {
  filamentId?: string;
  tipe: "FDM" | "SLA";
  gramasi: number;
  warnaHex?: string;
}
export interface ImportedPlate {
  nama: string;
  durasiJam: number;
  materials: ImportedMaterial[];
}
export interface ImportDraft {
  nama: string;
  plates: ImportedPlate[];
  batch: number;
  isSliced: boolean;
  warnings: string[];
}
```

Mapping draft:
- Tiap `SliceInfoPlate` → `ImportedPlate { nama: platerName (dari model-settings, plate index sejajar) || "Plate N", durasiJam: Math.round(predictionSec/3600 * 100)/100, materials: [...] }`.
- Tiap `SliceInfoFilament` dalam plate → `ImportedMaterial`:
  - brand = `ProjectFilamentSlot[id-1].vendor`; material = slot `.type` (fallback filament `.type`).
  - Cocokkan `filamentCatalog.find(f => f.brand.toLowerCase()===brand.toLowerCase() && f.material.toLowerCase()===material.toLowerCase())`.
  - Match → `{ filamentId: match.id, tipe: match.tipe, gramasi: usedG, warnaHex: color }`.
  - Tak match → `{ filamentId: undefined, tipe: tipeFromMaterial(material), gramasi: usedG, warnaHex: color }` + push warning `` `Filament "${brand} ${material}" belum ada di katalog — pakai tarif default` ``.
  - `tipeFromMaterial(m)` = `/resin|uv/i.test(m) ? "SLA" : "FDM"` (Bambu/Orca = FDM).
  - Plate tanpa filament sama sekali (edge case) → fallback 1 material `{ tipe: "FDM", gramasi: 0 }` (plate selalu punya ≥1 material, invarian yang sama dipakai `PlateInput`/`Calculator` sekarang).
- `batch` = `objectCount` plate **pertama** (atau 1 kalau kosong/0), seperti dashboard.
- Belum di-slice (tak ada `SliceInfoPlate` sama sekali) → `isSliced: false`, plates dari `modelPlates` (atau 1 plate default kalau `modelPlates` juga kosong) dengan `durasiJam: 0` + material fallback `{tipe:"FDM", gramasi:0}` + warning `"File belum di-slice — isi berat & durasi manual."`.
- File bukan zip/3MF valid (`readGcode3mfEntries` → null) → `importSlicerFile` kembalikan `null` (UI tampilkan error).

UI (di `components/PlateInput.tsx`, unlocked branch — komponen ini sudah menerima `filaments`, `onPlatesChange`, `onBatchChange` sebagai prop, jadi logic import bisa self-contained di sini tanpa ubah `Calculator.tsx`):
- Tombol "⬆ Import file slicer" + `<input type="file" accept=".3mf,.gcode.3mf" className="hidden">` tersembunyi (trigger via ref), muncul di bagian atas section plate — hanya render saat `!locked` (Pro).
- On file dipilih → `importSlicerFile(file, filaments)`:
  - `null` → set state error lokal, tampil inline (warna error `#ef4444` sesuai skill glass-ui-theme), tidak mengubah `plates`/`batch`.
  - draft → map `ImportedPlate[]` → `PlateRow[]` (assign `id: newId()` per plate & material) → `onPlatesChange(...)` + `onBatchChange(String(draft.batch))`; tampilkan `draft.warnings` inline (list kecil, non-blocking, tetap tampil sampai import berikutnya atau plate diedit manual — tak perlu tombol dismiss terpisah, YAGNI).
- Gate: locked/Free tak lihat tombol (konsisten multi-plate/multi-material Pro).

## Backward-compat & paritas

- Package extraction = refactor murni; dashboard perilaku identik (test membuktikan).
- Import hanya menulis ke state form (plates/batch) yang sudah ada sejak 1b-3/1b-6a; formula core & compute tak berubah.
- Filament match reuse katalog 1b-6a; fallback default = jalur yang sudah ada (material tanpa filamentId).

## Testing

- **saas build-draft.test:** (a) plate 2 filament, satu match katalog (set filamentId+tipe+warna) satu tak match (fallback + warning); (b) multi-plate → banyak `ImportedPlate` dengan nama dari model-settings; (c) belum di-slice → isSliced false + gram/durasi 0 + warning; (d) `tipeFromMaterial` resin→SLA, PLA→FDM; (e) batch dari objectCount plate pertama, fallback 1. Fixtur = objek `SliceInfoPlate[]`/`ModelSettingsPlate[]`/`ProjectFilamentSlot[]` langsung (build-draft murni, tak perlu re-test parsing XML — itu tanggung jawab test package).
- **saas index.test:** file zip in-memory (helper `makeZip`, `import JSZip from "jszip"`, pola sama test dashboard) → `importSlicerFile` → draft plates terisi; file invalid/corrupt → null.
- **UI test (`PlateInput.test.tsx`):** tombol import muncul untuk Pro (`locked=false`), tidak untuk Free (`locked=true`); pilih file valid → `onPlatesChange`/`onBatchChange` terpanggil + warning tampil; file invalid → error inline tampil, `onPlatesChange` tidak terpanggil.
- Seluruh suite saas + core hijau; build lolos.

## Di luar scope

- Raw `.gcode` non-zip (format zip 3MF saja).
- Nearest-color sort / fuzzy brand-material match (dashboard `color-catalog.ts`) — saas exact match saja.
- Auto-tambah filament ke katalog (ditolak di brainstorm — fallback default + warning saja).
- Simpan hasil/riwayat (1b-4) — juga berarti **thumbnail plate persist** (butuh tabel `Kalkulasi`/`Plate` server-side yang belum ada di saas) di luar scope; `readPlateThumbnails` sudah tersedia gratis di package tapi baru masuk akal dipakai setelah 1b-4 ada tempat menyimpannya.

## File tersentuh (perkiraan)

**saas:** `apps/saas/lib/kalkulator/import-3mf/{build-draft.ts,index.ts,*.test.ts}`, `apps/saas/components/PlateInput.tsx`, `apps/saas/components/PlateInput.test.tsx`, `apps/saas/package.json` (tambah `jszip` devDependency).
