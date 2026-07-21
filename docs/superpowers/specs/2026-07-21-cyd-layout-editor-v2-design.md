# Design: CYD Layout Editor v2 — page-builder interaktif drag-and-drop

**Tanggal:** 2026-07-21
**Status:** Design disetujui (brainstorm, termasuk visual companion), belum ditulis plan
**Terkait:** `docs/superpowers/specs/2026-07-18-cyd-internal-dynamic-layout-design.md` (schema `LayoutConfig` yang dikonsumsi — TIDAK berubah di sini), plan `docs/superpowers/plans/2026-07-18-cyd-internal-dynamic-layout-and-wifi.md` Task 10-11 (editor v1 yang diganti spec ini), memory `dashboard_architecture.md` (gotcha `proxy.ts` ROLE_ACCESS)

## 1. Ringkasan & tujuan

Editor `/cyd-layout` v1 (Task 10, dropdown per slot rak tetap) diganti total jadi **page-builder visual**: grid custom per halaman, drag-and-drop printer & label langsung ke canvas, resize baris/sel, dan canvas yang render akurat menyerupai tampilan asli CYD (warna & proporsi sama). Semua halaman (rak + detail, bukan cuma rak) jadi bisa diedit manual — auto-generate detail-page dari urutan rak (v1) dihapus.

Non-tujuan: ubah schema `LayoutConfig` JSON atau apa pun di firmware (`3pb-monitoring-display`) — kontrak MQTT (`3dpb/cyd/internal-rack/layout` + readback) persis sama, zero risk regresi firmware. Juga non-tujuan: field-row custom penuh (tetap preset), `colWeights` (kolom selalu rata, cuma baris yang bisa tak-rata — batasan schema existing), sinkronisasi `printer-monitor-core`'s config koneksi printer (di luar scope, cukup `Printer.slug` jadi identitas bersama).

## 2. Kondisi saat ini

`app/(dashboard)/cyd-layout/page.tsx` (v1): 9 slot rak tetap (`RACK_SLOTS`/`GANYMEDE_SLOT` di `rack-template.ts`) + dropdown pilih printer per slot. `buildLayoutConfig()` auto-generate halaman detail (kelompok 3 printer) dari urutan assignment. Printer diambil dari `GET /api/cyd-layout/printers` yang baca retained MQTT `3dpb/printers` (id = id stabil dari `printer-monitor-core`, mis. `"jupiter"`).

Terpisah, ada tabel `Printer` (Prisma) dipakai halaman Produk→Filamen→Printer — id cuid acak, TIDAK match dengan id MQTT — beda sumber data sepenuhnya dari yang dipakai editor CYD hari ini.

## 3. Keputusan arsitektur

### 3.1 Satu sumber identitas printer: `Printer.slug`

Tambah kolom `slug String @unique` (nullable dulu) ke model `Printer`. Auto-generate dari `name` (lowercase slugify) saat create baru; editable manual di form Produk→Filamen→Printer (buat override kalau perlu). Data existing di-backfill via migration script — **harus match persis** dengan id yang sudah dipakai `services/printer-monitor/config.json`/dipublish `printer-monitor-core` (mis. "jupiter", "mars") supaya `findPrinterById()` di firmware tetap match tanpa ubah service MQTT sama sekali. Setelah backfill, `slug` jadi `@unique` required.

Editor CYD selanjutnya ambil printer dari tabel `Printer` (bukan MQTT lagi) — `GET /api/cyd-layout/printers` return `{id, slug, name, model, notes}[]` filter `isActive`. `cell.printer` yang dikirim ke firmware = `slug`.

### 3.2 Full page-builder — semua halaman manual

State editor = representasi langsung `LayoutConfig` (`schemaVersion`, `pages[]`), bukan `assignment` datar. User kelola halaman via tab di atas canvas: tambah/hapus/reorder (drag tab, urutan = urutan rotasi device), tiap tab = satu `LayoutPage` dengan `id`, `grid.cols`/`grid.rows`, `durationSec`, dan `cells[]`. `buildLayoutConfig()` v1 (RACK_SLOTS + auto-generate detail) **dihapus**, diganti serialisasi 1:1 dari state editor.

### 3.3 Canvas = preview akurat (bukan 2 panel terpisah)

Layout editor 3 kolom: **palette printer** (kiri, card draggable dari tabel `Printer`, item terpakai-di-halaman-aktif ditandai redup — dobel dicegah HANYA dalam 1 halaman yang sama, printer boleh muncul di halaman berbeda) — **canvas** (tengah, rasio 320:240 diperbesar ~3× buat nyaman diedit) — **panel setelan** (kanan, field-preset dropdown untuk sel terpilih + durasi rotasi halaman, menggantikan preview-kecil-terpisah karena canvas sendiri sudah akurat).

Canvas render pakai **warna persis dari `display.h`** firmware (`C_BG #0a0a0f`, `C_GREEN #00ff88`, `C_YELLOW #ffaa00`, `C_RED`, `C_ORANGE #ffa726`, `C_PURPLE #9c6bff`, `C_TEAL #4cc978`, `C_SKYBLUE #4c9aff`, `C_PINK #ff6b9c`, `C_DIM rgb(156,154,152)`) dan warna status printer dari `stateColor()` (`RUNNING/PRINT`→hijau, `ERROR`→merah, `FINISH`→`rgb(0,160,255)`, `PAUSE`→kuning, default→dim) — nilai di-hardcode sekali sebagai konstanta TS, disalin manual dari `display.h`/`printers.cpp` (bukan di-generate otomatis — dua repo terpisah, drift risk dicatat sebagai known-limitation, lihat §5). Font monospace/LCD-style (web font terdekat, mis. VT323) — **bukan pixel-identik** ke font bitmap TFT_eSPI custom (batasan diakui, warna yang dijamin akurat, bukan font).

### 3.4 Interaksi drag-and-drop

- **Isi sel kosong**: hover/klik → "+" muncul → menu pilih 🖨️ Printer (drag dari palette, atau assign langsung dari menu) atau 🏷️ Label (jadi input teks, auto-fokus, ketik langsung).
- **Resize sel (colSpan/rowSpan)**: handle di pojok kanan-bawah sel terisi, drag ke kotak grid sebelah → melebar/memanjang nutup beberapa kotak sekaligus.
- **Resize baris (`rowWeights`)**: garis divider antar-baris (bukan kolom) di-drag naik/turun → tinggi baris berubah proporsional, total tetap 100%. **Kolom selalu rata lebar** (batasan schema firmware — `grid_geometry.cpp` cuma divisi rata utk kolom, tak ada `colWeights`) — jumlah kolom diatur via input angka biasa, bukan drag.
- **Field preset** per sel-printer terpilih: dropdown "Ringkas" / "Detail" — nilai persis sama dengan konstanta v1 yang sudah ada di `build-config.ts` (dipertahankan, cuma dipindah jadi pilihan per-sel bukan hardcode per-jenis-halaman):
  - `RINGKAS = [['name'], ['state', 'progress'], ['progressBar']]` (cocok grid padat, mis. rak)
  - `DETAIL = [['name', 'type'], ['state', 'progress'], ['progressBar'], [{id:'timeLeft',label:'Sisa'}, {id:'eta',label:'ETA'}], ['filename']]` (cocok halaman lebar)

## 4. Backend & Migrasi

**Prisma**: `Printer.slug String? @unique` → migration backfill (script satu-kali, isi dari nama existing, verifikasi match ke id `printer-monitor-core`) → `slug String @unique` (required).

**API**:
- `GET /api/cyd-layout/printers` — ganti baca tabel `Printer` (bukan MQTT retained), filter `isActive`.
- `POST /api/cyd-layout` — body ganti dari `{assignment}` jadi `{config: LayoutConfigOut}` (bentuk `LayoutConfig` penuh langsung dari state editor). Validasi struktur dasar (schemaVersion=1, pages non-empty, tiap page grid valid, tiap page tak ada printer dobel) sebelum publish. `publishAndConfirm` (mqtt-client.ts, Task 11) dipakai ulang tanpa perubahan.
- **Dihapus**: `rack-template.ts`, `buildLayoutConfig()`/`findDuplicatePrinterIds()` versi v1 (`build-config.ts` ditulis ulang total — validasi duplikat jadi per-halaman, bukan across satu assignment datar).

**Kompatibilitas firmware**: nol perubahan di `3pb-monitoring-display`. `LayoutConfig` JSON yang dipublish persis sama bentuknya dengan yang sudah divalidasi Task 2-9 sesi sebelumnya (parser, grid geometry, field renderer semua sudah teruji sesuai schema ini).

## 5. Risiko & catatan terbuka

- **Drift warna canvas vs firmware**: konstanta warna di-copy manual antara `display.h` (firmware repo) dan editor (dashboard repo, repo terpisah) — kalau warna firmware diubah nanti, editor tak otomatis ikut update. Diterima sebagai known-limitation (dua repo, tak ada build-time sharing yang praktis) — dicatat di kode dengan komentar silang-referensi ke `display.h`.
- **Font tak pixel-identik**: TFT_eSPI pakai font bitmap custom, web font cuma approksimasi visual. Warna dijamin akurat, bentuk huruf tidak.
- **Migrasi `Printer.slug`**: harus di-generate hati-hati supaya match persis id yang sudah dipakai `printer-monitor-core` — kalau meleset (typo/beda kapitalisasi), printer akan tampil kosong di CYD persis kayak bug id-mismatch yang ditemukan & diperbaiki sesi ini (Task 8/9). Verifikasi manual per-baris saat migration, bukan asumsi slugify otomatis selalu benar.
- **`printer-monitor-core`/`services/printer-monitor` config koneksi TIDAK disentuh** — kalau nanti mau printer baru ditambah lewat Produk→Filamen→Printer otomatis ikut dipantau CYD tanpa edit `config.json` manual, itu proyek terpisah (lihat §1 non-tujuan).

## 6. Testing

- Unit test `lib/cyd-layout/build-config.ts` v2 (serialisasi state→LayoutConfig, validasi duplikat per-halaman) — vitest, matching existing convention.
- Manual: buat layout custom (grid non-default, label custom, resize baris+sel) di editor → publish → verifikasi render benar di CYD fisik (lanjutan verifikasi hardware sesi ini — device sudah di tangan, captive portal & BOOT-reset sudah tervalidasi).
- Migration script `Printer.slug` backfill: dry-run dulu (print hasil slugify vs id MQTT existing, minta konfirmasi manual sebelum apply) — jangan auto-apply tanpa review, mengingat risiko id-mismatch di atas.

## 7. Roadmap di luar spec ini

- Field-row custom penuh (bukan cuma preset Ringkas/Detail) — kalau kebutuhan riil muncul nanti.
- `colWeights` di schema firmware (kolom tak-rata) — belum ada kebutuhan konkret.
- Sinkronisasi penuh `printer-monitor-core` config dari tabel `Printer` (single source of truth utk KONEKSI printer, bukan cuma identitas/nama) — proyek terpisah, lebih besar, menyentuh secret koneksi (IP, access code Bambu, dll).
