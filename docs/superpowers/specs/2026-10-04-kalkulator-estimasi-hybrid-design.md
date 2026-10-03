# Kalkulator: Estimasi Gramasi & Waktu dari STL/3MF + Import Gcode Mentah (Hybrid)

**Tanggal:** 2026-10-04
**Status:** Menunggu review user
**Scope:** `packages/kalkulator-core` (mesin + parser baru) + `apps/saas` (UI, profil, Worker). `apps/dashboard` menyusul setelah SaaS, memakai mesin yang sama.

## Masalah

Kalkulator (SaaS & dashboard) hanya bisa mengisi gramasi + durasi plate dari `.gcode.3mf` Bambu/Orca (`slice_info.config`). Yang belum bisa:

1. **STL / project `.3mf` yang belum di-slice** — user harus buka slicer, slice, export, baru import. Untuk quote cepat ini terlalu lama.
2. **Gcode mentah** (`.gcode` dari Orca/Snapmaker/Bambu) — ditolak, padahal semua angka yang dibutuhkan ada di header/footer-nya.

User **tidak mau memakai slicer (Bambu/Orca CLI) di produk**. Estimasi harus dihitung langsung dari geometri + parameter preset.

## Keputusan (disetujui user, 2026-10-02 s/d 10-04)

| # | Keputusan |
|---|---|
| 1 | **Hybrid**: file hasil slice (`.gcode.3mf`, `.gcode`) → angka **persis**; STL / `.3mf` belum di-slice → **estimasi** tanpa slicer |
| 2 | STL selalu **1 warna**. `.3mf` multi-warna = *nice to have*: hanya estimasi **buangan** (flush AMS / prime tower toolchanger) + warning "tidak akurat" |
| 3 | Target app: **dua-duanya, SaaS dulu**. Mesin di `kalkulator-core` |
| 4 | Tier SaaS (opsi 2): **Free** = estimasi STL dengan **profil default**, 1 plate. **Pro** = import gcode mentah, profil sendiri, estimasi `.3mf` (termasuk multi-warna) |
| 5 | Profil sendiri diimport dari **project `.3mf` saja** dulu. `.bbscfg` menyusul (butuh tabel base profile Bambu) |
| 6 | **1 profil = 1 kombinasi** printer + process + filamen (tidak dipecah/dicampur) |
| 7 | Output = **angka tunggal** mengisi plate (bisa diedit) + **badge akurasi** 🟢/🟡/🔴. Bukan rentang; rumus HPP tidak berubah |
| 8 | Mesin jalan **di browser (Web Worker)** — file tidak di-upload, nol beban server |

## Hasil Riset (prototipe di scratchpad, dibandingkan dengan Bambu/Orca)

Prototipe estimator (penampang per layer + model wall/shell/infill + kinematika trapezoid) dibandingkan dengan hasil slice asli. Referensi dibuat dengan Bambu Studio 02.08 CLI (terbukti identik dengan GUI user: Switch 18m24s / 24m40s) dan Orca/Snapmaker (screenshot + gcode user).

| Model | Kondisi | Berat ref → estimasi | Waktu ref → estimasi |
|---|---|---|---|
| Switch | A1, tegak, tanpa support | 8,25 → 7,61 g (−8%) | 16,9 → 17,5 mnt (+4%) |
| Switch | A1 / P2S, dibalik, tree support | 15,2 → 11,1 g (−27%) | 53 → 21–25 mnt (−53…−59%) |
| Ring GL 8.5 | A1, tanpa / tree support | 2,35 → 1,96 g; 2,90 → 2,55 g | 12,4 → 12,0; 15,4 → 13,6 mnt |
| Gem GL 8.5 | A1, tanpa / tree support | 0,72 → 0,64 g; 1,09 → 0,72 g | 4,9 → 8,1; 7,1 → 8,3 mnt |
| Zord (4 warna) | P1S per copy | total 173,1 → 187 g (+8%) | 12j47m → ±13,6 j (error saling menutup) |
| Zord (4 warna) | U1, 3 copy | model 123,9 → 104,6 g; tower 8,4 → 8,2 g | 13j49m → ±6 j |

Temuan yang masuk desain:

- **Wall, top/bottom, solid** sudah akurat (±5%) untuk model 1 warna.
- **Kekurangan yang bisa diperbaiki** (belum diterapkan di prototipe): purge line per printer (P1S ≈0,41 g, A1 ≈0,13–0,19 g), **auto brim** (part tinggi beralas kecil, ring: 0,22 g), **gap infill** (part tipis), faktor pola infill (grid ≈1,27× densitas nominal), cooling slowdown yang dibatasi `slow_down_min_speed` (bug prototipe: gem +65%).
- **Tree support** adalah sumber error terbesar. Bentuk tree support Bambu identik di A1 dan P2S (6,36 g, 40.175 gerakan sama persis) → tergantung geometri + setting support saja, bukan printer. Waktunya didominasi gerakan pendek & travel antar cabang (±32 dari 52 menit di Switch dibalik).
- **Multi-warna**: buangan bisa dihitung andal dengan rumus sederhana (AMS: ganti × matriks flush; toolchanger: ganti × `prime_volume`). Berat model & waktu tidak, karena tiap pulau warna punya outer wall sendiri (Zord U1: outer wall 568 m / 54 g / 4j53m) + travel antar pulau (3j27m).
- **Ganti tool U1 murah** (±6 detik): Orca preheat nozzle 30 detik sebelumnya. Bukan sumber waktu.
- Mesh bermasalah (bolong, potongan multi-warna melayang) membuat estimasi meleset 50–600% → harus dideteksi dan diberi warning.
- `model printing time` di header gcode Bambu **termasuk timelapse**; GUI memisahkannya.

## Pemecahan Sub-proyek

Tiap sub-proyek punya plan + implementasi sendiri. Spec ini merinci semuanya di level desain; detail implementasi masuk plan masing-masing.

| # | Sub-proyek | Isi | Tergantung |
|---|---|---|---|
| **A** | Import gcode mentah | Parser ringkasan gcode Bambu & Orca/Snapmaker → masuk alur import yang ada | — |
| **B** | Profil slicer | Skema `SlicerProfile`, `profileFromProject3mf`, profil default, store IndexedDB + UI Settings | — |
| **C** | Mesin estimasi | Mesh parser + `estimatePrint` + kalibrasi | B |
| **D** | UI estimasi + buangan multi-warna | Import STL/3MF di PlateInput, Worker, badge, `multicolor/` | B, C |

Urutan: **A → B → C → D**. Dashboard (port UI + profil di Postgres) setelah D.

## Arsitektur

### `packages/kalkulator-core` (TypeScript murni, tanpa DOM)

| Modul | Tanggung jawab |
|---|---|
| `import-gcode/` | `parseGcodeSummary(head: string, tail: string)` → `GcodeSummary` |
| `slicer-profile/` | Tipe `SlicerProfile`, `profileFromProjectSettings(json)`, `DEFAULT_PROFILES` |
| `mesh/` | `parseStl(buf)` (binary + ASCII), `read3mfMesh(zip)` (build item, component, `p:path` multi-file, transform, `paint_color`) → `Mesh` |
| `estimate/` | `estimatePrint(mesh, profile, opts) → EstimateResult`; sub-unit `layers`, `shells`, `support`, `extras`, `time` |
| `multicolor/` | `colorChangesFromPaint(mesh, profile)`, `wasteEstimate(changes, profile)` |
| `estimate/calibration.ts` | Semua konstanta hasil fitting, tiap angka diberi komentar sumber |

Export subpath baru mengikuti pola `./import-3mf`: `./import-gcode`, `./estimate` (termasuk mesh + profile + multicolor).

### `apps/saas`

| Unit | Tanggung jawab |
|---|---|
| `lib/kalkulator/estimate/worker.ts` | Web Worker membungkus parse mesh + `estimatePrint`; progress + batal |
| `lib/store/slicer-profiles.ts` | Store IndexedDB baru `slicer-profiles` (pola `local-settings.ts`) |
| `lib/kalkulator/import-3mf/` | Diperluas: dispatcher per jenis file → `ImportDraft` |
| `components/PlateInput.tsx` | Input menerima `.stl,.3mf,.gcode.3mf,.gcode`; pilih profil + toggle support; badge |
| `components/SettingsPanel.tsx` | Section "Profil cetak" (Pro): import dari 3MF, daftar, rename, hapus |

**Prinsip:** semua hasil (persis maupun estimasi) dikonversi ke `ImportDraft` → `PlateInputV2` yang sudah ada (`materials[].gramasi`, `durasiJam`). `hitungKalkulasiV2` dan 14 golden test **tidak disentuh**.

## Sub-proyek A — Import Gcode Mentah (detail)

### Format yang didukung

| Slicer | Lokasi | Field |
|---|---|---|
| Bambu Studio | header (±40 baris awal) | `; model printing time: X; total estimated time: Y`, `; total filament weight [g] : a,b,c`, `; filament_density`, `; filament: …` |
| OrcaSlicer / Snapmaker Orca | footer (blok `; filament used …` s/d `; estimated printing time`) | `; filament used [g] = a, b, c`, `; total filament used [g]`, `; total filament change = N`, `; estimated printing time (normal mode) = …` |
| Keduanya | blok config: Bambu **di awal** file (setelah header), Orca **di akhir** | `; filament_type = PLA;PLA…`, `; filament_colour = #…;#…`, `; filament_vendor` (opsional), `; printer_model` |

- Waktu yang dipakai = **total estimated time** (Bambu) / **estimated printing time** (Orca) — sama dengan `prediction` di `slice_info.config` yang dipakai import sekarang, supaya konsisten.
- Hanya dibaca **128 KB awal + 128 KB akhir** file (`File.slice`), gcode 100 MB tetap ringan. Terverifikasi: Bambu (Switch A1) `printer_model` di ±34 KB dari awal; Orca (Zord U1, 97,7 MB) seluruh footer + config di ≤27 KB dari akhir.
- Filamen dengan `used [g] = 0` dibuang. Pencocokan ke katalog filamen user memakai logika `build-draft` yang ada (brand + material); warna diambil dari `filament_colour`.
- 1 file gcode = 1 plate. `batch` = 1 (gcode tidak menyimpan jumlah objek dengan andal).

### Output

```ts
interface GcodeSummary {
  slicer: 'bambu' | 'orca'
  totalSec: number
  filaments: { index: number; usedG: number; type?: string; color?: string; vendor?: string }[]
  filamentChanges?: number
  printerModel?: string
}
```

Dipetakan ke `ImportDraft` oleh `build-draft` yang ada (tambah satu adapter `gcodeSummaryToSlicePlate`).

### Error

- Tidak ada pola Bambu maupun Orca → "Format gcode belum didukung (baru Bambu & Orca/Snapmaker)".
- Pola ada tapi berat/waktu tidak terbaca → error yang sama + nama file (perilaku multi-file yang ada: file lain tetap masuk).

### Test

Fixture = potongan header/footer asli yang dipangkas (Bambu A1 Switch, Bambu P1S, Orca U1 Zord), bukan file utuh. Kasus: single filament, 4 filament, filament `0 g`, format waktu `1d 2h 3m 4s`, file tanpa pola.

## Sub-proyek B — Profil Slicer

### `SlicerProfile` (±40 field)

- **Meta:** `id`, `nama` (otomatis "Printer · Process · Filamen", bisa di-rename), `printerModel`, `nozzle`, `bedSize`, `changeKind: 'single' | 'ams' | 'toolchanger'`, `source: 'default' | 'project3mf'`.
- **Layer:** `layerHeight`, `firstLayerHeight`.
- **Shell:** `wallLoops`, line width per fitur (outer, inner, sparse, solid, top, first, support), `topLayers`, `bottomLayers`, `topThickness`, `bottomThickness`.
- **Infill:** `infillDensity`, `infillPattern`.
- **Speed:** outer, inner, sparse, solid, top, first layer, first layer infill, support, support interface, travel, bridge, overhang (per tingkat).
- **Akselerasi:** default, outer, top, first layer, travel.
- **Support:** `enabled`, `type` (normal/tree), `thresholdAngle`, `topZDistance`, interface layers & spacing, base spacing.
- **Brim/skirt:** `brimType`, `brimWidth`, `skirtLoops`.
- **Filamen:** `density`, `flowRatio`, `maxVolumetricSpeed`, `coolingSlowdown`, `minLayerTime`, `minSpeed`, jumlah slot + warna.
- **Ganti warna:** `flushMatrix` (AMS), `primeVolume` (toolchanger), `toolChangeSec`.
- **Konstanta printer** (dari `calibration.ts` berdasarkan `printerModel`): `purgeLineG`, `prepSec`, `filamentChangeSec`.

Nilai array per varian extruder (`["200","500","500"]`) diambil sesuai `nozzle_volume_type` / index varian aktif; `"nil"` sudah tidak ada di project settings (sudah flatten).

### Sumber profil

- **Project `.3mf`:** `Metadata/project_settings.config` sudah lengkap (Bambu & Orca) → `profileFromProjectSettings`. Field wajib hilang → error "Setting di 3MF tidak lengkap".
- **Default (untuk Free):** P1S, A1, A1 mini, X1C, P2S (Bambu, `0.20mm Standard` + Generic PLA), U1 (Snapmaker Orca, `0.20 Standard` + Generic PLA). Diekstrak sekali dari profil sistem slicer, di-commit sebagai data (±40 angka per profil).

### Penyimpanan & UI (SaaS)

IndexedDB store `slicer-profiles`. Settings → "Profil cetak" (Pro): upload `.3mf` → preview nama + ringkasan (printer, layer, infill, support) → simpan. Daftar, rename, hapus. Free melihat profil default saja (read-only), selaras dengan settings dua-mode yang ada.

## Sub-proyek C — Mesin Estimasi

### Alur `estimatePrint`

1. **Mesh** → transform → drop ke bed (z min = 0).
2. **Layers:** irisan di tengah tiap layer → per layer: luas penampang `S` + keliling `P` (segmen berorientasi, tanpa merangkai poligon).
3. **Shells:** wall = `P ×` jumlah lebar loop (dibatasi `S`; part tipis → sisa jadi gap infill); top/bottom/solid dari selisih luas dengan N layer di atas/bawah; sparse = sisa × densitas × faktor pola.
4. **Support:** overhang = face menghadap bawah lebih curam dari `thresholdAngle`, tidak di bed. Tinggi ke permukaan di bawahnya dari **height-map 2D** (rasterisasi tinggi permukaan ke grid, O(segitiga)) — mengganti raycast prototipe yang makan 200 detik untuk 1,7 juta segitiga. Volume = luas × tinggi × faktor body (normal/tree terpisah) + interface.
5. **Extras:** purge line, auto brim (aturan tinggi/luas alas), skirt.
6. **Waktu:** per fitur panjang jalur = volume / (tinggi layer × spacing); kecepatan = min(speed fitur, max volumetric / penampang); waktu trapezoid dengan akselerasi fitur & panjang segmen karakteristik; overhead per layer; cooling slowdown (layer < `minLayerTime` diperlambat, dibatasi `minSpeed`); support pakai model waktu terpisah (jumlah segmen ∝ luas overhang).
7. **Berat** = Σ volume × `flowRatio` × `density`.

### Output

```ts
interface EstimateResult {
  grams: number
  seconds: number               // tanpa prep & timelapse, sama definisi "model printing time" GUI
  prepSec: number               // dari konstanta printer, ditampilkan terpisah
  breakdown: { grams: Record<Feature, number>; seconds: Record<Feature, number> }
  confidence: 'green' | 'yellow' | 'red'
  accuracyPct: number           // dari laporan kalibrasi kategori terkait
  warnings: EstimateWarning[]
}
```

`durasiJam` di plate = `(seconds + prepSec) / 3600`, konsisten dengan `prediction` import 3MF (total waktu).

## Sub-proyek D — UI Estimasi + Buangan Multi-warna

### Alur per jenis file (dispatcher di import)

| File | Alur | Hasil | Tier |
|---|---|---|---|
| `.gcode.3mf` | parser yang ada | persis | Pro |
| `.gcode` | Sub-proyek A | persis | Pro |
| `.stl` | Worker: parse → `estimatePrint` dengan profil terpilih + toggle support → 1 plate, 1 material | estimasi + badge | Free (profil default) / Pro (profil sendiri) |
| `.3mf` belum di-slice | mesh + paint + `project_settings` → **profil dari file itu sendiri** → estimasi per plate | estimasi; multi-warna 🔴 | Pro |

Toggle support saat upload STL: **ikut profil / tidak / normal / tree**.

### Multi-warna (`.3mf` di-paint)

- Warna per layer dari `paint_color` (+ extruder default objek) → jumlah ganti warna (urutan per layer: warna terakhir layer sebelumnya didahulukan).
- Buangan: AMS = Σ `flushMatrix[dari][ke]` × `flush_multiplier`; toolchanger = ganti × `primeVolume`.
- Berat model dibagi per warna menurut porsi luas permukaan ter-paint; buangan per warna = jumlah ganti *ke* warna itu.
- Waktu = estimasi model + ganti × `filamentChangeSec` (AMS ≈ 139 detik/ganti dari data P1S; toolchanger dari `toolChangeSec`). Badge selalu 🔴.

### Field plate

`estimate?: { confidence, accuracyPct, warnings, source: 'stl' | '3mf' }` di state plate — **hanya UI**, tidak dipakai rumus, tidak disimpan ke riwayat. Edit manual gramasi/durasi → badge berubah jadi "diedit manual".

## Error & Warning

**Error (import dibatalkan):** file tidak terbaca; gcode format belum didukung; file > 300 MB; setting 3MF tidak lengkap; estimasi > 60 detik (progress + batal tersedia).

**Warning (estimasi tetap jalan):**

| Deteksi | Badge |
|---|---|
| Mesh tidak rapat (edge terbuka / volume bertanda tidak konsisten) | 🔴 |
| Shell melayang (tidak menyentuh bed) | 🔴 |
| Multi-warna | 🔴 "Kasar — slice dulu untuk angka persis" |
| Support normal / tree | 🟡 (tree: "waktu bisa jauh lebih lama") |
| Lebih besar dari bed profil | 🟡 "Tidak muat di bed (… mm)" |
| Ukuran < 1 mm atau > 1 m | 🟡 "Cek satuan" |
| Printer profil tidak dikenal (konstanta purge/prep default) | 🟡 |

Badge = warning terburuk. 🟢 hanya untuk 1 warna, tanpa support, mesh rapat, muat di bed.

## Testing & Kalibrasi

**Unit test (CI, vitest):** parser gcode/STL/3MF/profil dengan fixture kecil; geometri analitik (kubus 20 mm, silinder: volume, luas, keliling per layer); sifat logis (infill ↑ → gram ↑; support on ≥ off; AMS > toolchanger; tidak ada NaN/negatif); performa (1,7 juta segitiga < 5 detik).

**Kalibrasi (lokal, bukan CI):**

- Korpus referensi: model + profil + angka asli slicer (berat, waktu, rincian per fitur dari gcode).
- Model berbayar/berlisensi (Do3D, Nikko, dll.) **tidak di-commit**: hanya `manifest.json` (path NAS + sha256 + angka referensi) yang masuk repo.
- `scripts/calibrate` → laporan error per kategori (1 warna tanpa support, support normal, tree, part kecil, multi-warna). `accuracyPct` badge = error P90 per kategori.
- Slicer CLI hanya dipakai di Mac dev untuk membuat referensi, tidak pernah di produk.

**Target sebelum rilis:**

| Kategori | Berat (rata-rata error) | Waktu |
|---|---|---|
| 1 warna tanpa support | ≤ 5% | ≤ 10% |
| Support | ≤ 20% | ≤ 30% (dilaporkan, tidak memblokir) |
| Buangan multi-warna vs slicer | ≤ 25% | — |

Kategori yang tidak lolos → badge diturunkan otomatis. Korpus awal: ±30 STL uji, Switch (A1/P2S), Ring + Gem GL 8.5, Zord (P1S/U1); **perlu ±15–20 sampel tambahan** dari produk 3DPB sehari-hari.

## Di Luar Scope

- Slicer di produk (CLI/WASM) — ditolak user.
- Import `.bbscfg` (menyusul; butuh tabel base profile Bambu).
- Auto-orientasi / lay-flat STL — STL dipakai sesuai orientasi file.
- Format gcode Cura/PrusaSlicer.
- Estimasi akurat wall/travel batas warna multi-warna (hanya buangan).
- Port ke dashboard (setelah D, spec terpisah).

## Hal yang Perlu Diputuskan

- **Lisensi data profil default:** angka diambil dari profil sistem Bambu Studio / Snapmaker Orca (AGPL-3.0). Yang dipakai hanya ±40 angka setting per printer, bukan kode. Perlu konfirmasi user bahwa ini dapat diterima untuk SaaS komersial.
