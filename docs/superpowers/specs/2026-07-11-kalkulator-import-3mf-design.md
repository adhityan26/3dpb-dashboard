# Import 3MF ke Kalkulator — Design

## Latar belakang

Kalkulator HPP (`apps/dashboard/components/kalkulator/KalkulasiForm.tsx` + `PlateTable.tsx`) saat ini butuh input manual per part/plate: nama, tipe, gramasi, durasi, filament, printer. Untuk produk yang di-slice via Bambu Studio/OrcaSlicer, semua data ini sudah tersedia di file project `.gcode.3mf` (hasil "Slice all" lalu export/save project) — cukup di-parse dan dipakai buat auto-fill form, supaya user nggak perlu ngetik ulang manual.

## Sumber data: `.gcode.3mf` (hasil slice), bukan `.3mf` mentah

File `.3mf` adalah ZIP archive. Investigasi terhadap contoh file nyata (`Asset 4-sushitei.3mf` vs `Asset 4-sushitei.gcode.3mf`) mengonfirmasi:

- **`.3mf` biasa** (hasil "arrange" sebelum di-slice): punya mesh geometry (`3D/Objects/`) dan assignment plate/filament/objek (`Metadata/model_settings.config`, `Metadata/project_settings.config`), tapi **`Metadata/slice_info.config` kosong** — tidak ada gramasi maupun estimasi durasi print sama sekali.
- **`.gcode.3mf`** (hasil slice, tanpa mesh — `Metadata/plate_N.gcode` menggantikannya): `Metadata/slice_info.config` terisi lengkap per plate — gramasi, durasi, breakdown filament per plate.

Karena itu, fitur ini menerima **kedua jenis file**, tapi hanya `.gcode.3mf` yang bisa auto-fill gramasi & durasi. File `.3mf` biasa tetap diproses sebisanya (plate/filament assignment) dengan warning eksplisit.

### File metadata relevan (di dalam ZIP)

| File | Isi yang dipakai |
|---|---|
| `Metadata/slice_info.config` (XML) | Per `<plate>`: `index`, `prediction` (detik), `weight` (gram total), daftar `<object identify_id skipped>`, daftar `<filament id type color used_g used_m>` |
| `Metadata/project_settings.config` (JSON) | Array per filament slot (index selaras dengan `filament id` di slice_info, 1-based): `filament_vendor[]`, `filament_type[]`, `filament_settings_id[]` |
| `Metadata/model_settings.config` (XML) | Per plate: `plater_id`, `plater_name` (sering kosong) |

## Arsitektur: parsing 100% client-side

File `.gcode.3mf` bisa 20-30MB+ karena embed G-code (`Metadata/plate_N.gcode`), tapi kita cuma butuh 3 file kecil di atas. Parsing dilakukan di browser pakai `jszip` (dependency baru, ~100KB):

- File **tidak pernah di-upload ke server** — JSZip buka ZIP di memory, ambil entry yang dibutuhkan (skip entry `.gcode` yang besar), baca isinya sebagai text, parse XML (`DOMParser` bawaan browser) & JSON.
- Alasan pilih client-side dibanding pola server-side ala OCR PO: tidak ada kebutuhan API eksternal (OCR PO butuh Gemini di server), jadi tidak ada alasan kirim file besar ke server. Client-side lebih cepat (no upload roundtrip) dan tidak butuh endpoint baru untuk nyimpen/proses file besar.

## Alur UX

1. Di form Kalkulasi Baru (`KalkulasiForm.tsx`), tombol baru "📥 Import dari 3MF" di dekat field Nama Kalkulasi — pola visual mirip tombol "📷 Scan" di `POTab.tsx`.
2. Klik → file picker (`accept=".3mf"`) → pilih file → parsing berjalan sinkron di browser (biasanya < 1 detik karena cuma baca beberapa KB dari ZIP).
3. Hasil parse langsung nge-set state form yang sudah ada (`nama`, `batch`, `plates`) — user melihat form ke-fill dan bisa langsung edit sebelum Simpan, persis seperti setelah OCR PO selesai.
4. Kalau ada bagian yang nggak lengkap (file belum di-slice, filament nggak ke-match, printer nggak dikenali), tampilkan indikator non-blocking di bawah tombol import (bukan modal alert) — form tetap terisi sebisa mungkin.

## Mapping field

| Field kalkulator | Sumber 3MF | Fallback / catatan |
|---|---|---|
| **Nama Kalkulasi** | Nama file, strip suffix `.gcode.3mf` atau `.3mf` | — |
| **Batch (unit)** | Jumlah `<object skipped="false">` per plate, ambil **nilai terkecil** across semua plate di file | Object dengan `skipped="true"` tidak dihitung. Kalau file cuma 1 plate, pakai jumlah objek plate itu. |
| **1 Part (row di PlateTable)** | 1 `<plate>` di `slice_info.config` | Multi-plate file → multi-part |
| **Nama Part** | `plater_name` dari `model_settings.config` (by `plater_id` yang selaras dengan plate index) | Kalau kosong/generic → fallback `"Plate N"` (N = index plate, 1-based) |
| **Tipe** | Selalu `FDM` | Bambu Studio/OrcaSlicer 3MF selalu FDM |
| **Gramasi (mode single)** | Jumlah `used_g` semua `<filament>` di plate, kalau plate cuma 1 filament | — |
| **Durasi** | `prediction` (detik) ÷ 3600 → ditulis sebagai string `"H:MM"` ke input (field ini sudah punya parser `"H:MM"` di `PlateTable.tsx`) | — |
| **Mode Multi + Filament** | Auto-**ON** kalau plate punya > 1 `<filament>` entry. Tiap entry jadi 1 `FilamentEntry`: `material` dari `filament_type[]`, `brand` dari `filament_vendor[]` (index by `filament id`, 1-based), `color` dari `slice_info` hex, `gramasi` dari `used_g` | Kalau cuma 1 filament di plate → tetap mode single (field Gramasi di atas) |
| **Filament katalog match** | String match exact `brand + material` terhadap `FilamentHarga` (hook `useFilamentHarga`) yang sudah ter-fetch di client | **Tidak ketemu → filament di part itu dibiarkan kosong/default** (gramasi tetap ke-fill, cost pakai rate default sampai user pilih manual) |
| **Printer** | String-match `printer_model_id` dari `slice_info.config` ke daftar hardcoded (`PRINTERS` di `PlateTable.tsx`) via tabel mapping id Bambu → nama printer | `printer_model_id` tidak dikenal → field printer dibiarkan kosong |

Mapping id yang **sudah terverifikasi** dari sample file nyata: `C12` → `Bambu Lab P1S`. ID lain (A1, A1 Mini, P1P, X1C, P2S) belum terverifikasi dari file sample — akan diisi ke tabel mapping saat implementasi berdasarkan dokumentasi Bambu Studio atau sample file tambahan, bukan ditebak. Tabel mapping ditulis eksplisit & growable di kode (bukan hardcode logic), supaya gampang ditambah begitu ID baru ketemu.

## Handling file yang belum di-slice (`.3mf` biasa)

Deteksi: `slice_info.config` ada tapi tidak punya `<plate>` block sama sekali (atau file itu sendiri tidak ada di ZIP).

- Part/Plate tetap dibuat dari `model_settings.config` (plate count, plater_name) + `project_settings.config` (filament assignment per plate, kalau ada).
- **Gramasi & Durasi dikosongin** (memang tidak ada datanya).
- Banner warning ditampilkan: **"⚠️ File ini belum di-slice — gramasi & durasi tidak tersedia. Isi manual, atau export ulang project setelah 'Slice all' di Bambu Studio/OrcaSlicer."**

## Error handling

| Kondisi | Behavior |
|---|---|
| File bukan ZIP valid (corrupt / bukan 3MF sama sekali) | Toast error "File tidak bisa dibaca / bukan file 3MF yang valid", form tidak berubah |
| ZIP valid tapi tidak ada file metadata Bambu Studio sama sekali (`Metadata/model_settings.config` tidak ada) | Toast error "Format 3MF tidak dikenali (bukan dari Bambu Studio/OrcaSlicer)", form tidak berubah |
| Sebagian filament tidak ke-match katalog | Info non-blocking di bawah tombol import: `"N dari M filament belum ke-match katalog, isi manual di part-nya."` — bukan alert modal, tidak menghalangi user lanjut edit/simpan |
| `printer_model_id` tidak dikenal | Field printer part itu dikosongin, tidak ada error terpisah (sudah tercakup di summary non-blocking kalau perlu) |

## Scope non-implementasi (di luar spec ini)

- Tidak menambah UI untuk multi-file import (1 file 3MF per klik import).
- Tidak mengubah `KalkPrinterProfile` (tabel profile printer v2) — printer tetap string free-text seperti sekarang, hanya di-auto-fill by string match ke list existing.
- Tidak melakukan auto-create entry baru di katalog `FilamentHarga` untuk filament yang tidak ke-match — sesuai keputusan user, dibiarkan kosong untuk diisi manual.
- Tidak mendukung format project SLA (`SLA` tipe) — 3MF dari printer resin punya struktur metadata berbeda dan di luar scope spec ini.
