# Kalkulator: Import Multiple File Slicer (.gcode.3mf) — Append Plate

**Tanggal:** 2026-08-11
**Status:** Disetujui user
**Scope:** `apps/saas` (PlateInput) + `apps/dashboard` (KalkulasiForm). `packages/kalkulator-core` tidak berubah.

## Masalah

Kedua kalkulator (SaaS Slizebiz dan dashboard internal) hanya bisa import 1 file slicer:

- Input file tanpa atribut `multiple`; drag-drop dashboard hanya membaca `files[0]`.
- Hasil import **mengganti seluruh plates** — import file kedua menimpa hasil file pertama.

Padahal satu produk sering di-slice jadi beberapa file `.gcode.3mf` terpisah. Tidak ada cara menggabungkan beberapa file jadi satu kalkulasi.

## Perilaku Baru

Berlaku identik di kedua app:

1. **Multi-select**: file input diberi atribut `multiple`. Drag-drop di dashboard menerima semua file yang di-drop.
2. **Append, bukan replace**: tiap file diparse berurutan; plates hasilnya **ditambahkan** ke daftar plate yang ada. Contoh: gcode A (1 plate) sudah terimport, lalu import gcode B (2 plate) → total 3 plate. Import ketiga, keempat, dst. terus menambah.
3. **Placeholder kosong dibuang**: kalau kalkulator masih pristine (plate kosong belum diisi apa-apa), plate kosong itu diganti hasil import — tidak ada row kosong tersisa.
4. **Batch & nama kalkulasi hanya di-set saat pristine**: batch ("hasil sekali cetak") dan nama kalkulasi (dashboard) diambil dari file pertama hanya saat state masih kosong. Saat append ke plates yang sudah terisi, keduanya tidak disentuh — input user tidak ketimpa.
5. **Error per file**: satu file gagal parse tidak membatalkan file lain — file valid tetap masuk. Pesan error menyebutkan nama file yang gagal. Warnings dari semua file digabung lalu di-dedupe.
6. **Thumbnail dashboard**: key plate unik antar-import (counter berjalan, bukan `p-3mf-${i}` yang tabrakan antar-import); `pendingThumbnails` di-merge, bukan di-replace.

## Definisi "pristine"

Kalkulator dianggap pristine bila **semua** plate yang ada belum diisi bermakna: nama kosong, durasi kosong/0, dan semua material gramasi kosong/0. Plate pristine dibuang saat append; batch/nama hanya di-set bila seluruh daftar plate pristine sebelum import.

## Implementasi

- Parser di `@3pb/kalkulator-core/import-3mf` **tidak berubah** — loop per file di handler UI masing-masing app:
  - SaaS: `PlateInput.handleImportFile` → `handleImportFiles(files: File[])`.
  - Dashboard: `handleImport3mf(file)` → menerima banyak file; `handleDrop` dan `onChange` input meneruskan seluruh `FileList`.
- Logika gabung (append + pristine-detection + merge warnings) di-extract jadi fungsi murni per app supaya bisa di-unit-test tanpa DOM.
- Alternatif helper gabungan di `kalkulator-core` ditolak: draft type kedua app beda (dashboard punya thumbnails), helper shared hanya menambah indirection.

## Testing

- Unit test fungsi murni append/pristine-detection (kedua app): pristine → replace; sudah terisi → append; batch/nama tidak berubah saat append; error 1 file tidak menggagalkan file lain; dedupe warnings.
- 14 golden test formula di `packages/kalkulator-core` tidak tersentuh.
- Verifikasi manual via dev server kedua app (import 2 file berurutan + multi-select sekaligus).
