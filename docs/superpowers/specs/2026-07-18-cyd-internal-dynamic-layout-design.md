# Design: CYD internal — layout Printer dinamis (JSON via MQTT) + migrasi repo firmware

**Tanggal:** 2026-07-18
**Status:** Design disetujui (brainstorm), belum ditulis plan
**Terkait:** `docs/superpowers/specs/2026-07-16-printer-monitor-design.md` §13 (kontrak keselarasan CYD), memory `project_printer_monitoring_cyd`, vault OK `integrations/printer-monitoring-architecture.md`

## 1. Ringkasan & tujuan

CYD internal (layar fisik di rak printer 3DPB) punya 3 mode tampilan printer (`Rack`, `Overview`, `Detail`) yang **hardcode** di C++ — nama printer & posisi grid literal di kode, ganti/tambah printer fisik = edit source + reflash. Tujuan: jadikan ketiga mode ini **JSON-driven** (posisi, isi cell dari MQTT retained, bukan compile-time), sebagai **pondasi yang dipakai ulang** untuk firmware CYD-produk (dijual ke customer) nanti.

Non-tujuan sesi ini: firmware CYD-produk itu sendiri (Fase 4), captive portal WiFi provisioning, OTA, editor layout di SaaS (customer produk). Layar Claude usage/Gold/Orders (non-printer) di firmware **tidak disentuh**.

## 2. Kondisi saat ini (hasil inspeksi source, 2026-07-18)

Firmware: `~/Documents/Project/3dpb-app/apps/claude-monitor` (PlatformIO/Arduino, ESP32 "CYD"). Repo `3dpb-app` **bukan monorepo asli** (tiap `apps/*` punya `package.json`/toolchain sendiri, tanpa workspace bersama) — isinya `claude-monitor` (firmware ini), `studio` (Sanity CMS), `web` (landing Astro).

**Navigasi (`main.cpp`):** 11 halaman touch-navigable, index tetap: `0`=Claude usage, `1`=Rack, `2-5`=Detail (4 sub-halaman printer, auto-rotate 8 detik), `6`=Gold, `7-10`=Orders. `TOTAL_PAGES/DETAIL_FIRST/DETAIL_LAST/ORDERS_FIRST/ORDERS_LAST` adalah `#define` tetap.

**3 fungsi render printer** (`src/screens/printers.cpp`), semua pakai raw `TFT_eSPI` (bukan LVGL):
- `screenPrintersRackDraw()` — **live**, dipanggil dari page 1. Grid fisik hardcode: 10 nama printer literal (`Mars,Saturn,Uranus,Neptune,Moon,Mercury,Earth,Venus,Jupiter` + strip lebar `Ganymede`) di posisi piksel eksak (label "RAK KIRI"/"RAK KANAN"). Differential-redraw via `namedCellChanged()`/`sForceAll`/`sPrev[]` — cuma cell yang berubah digambar ulang (hindari flicker).
- `screenPrintersDraw(page, paused)` — **live**, dipanggil pages 2-5. 3 printer/halaman, kartu besar (progress bar, ETA, filename, error), iterate by index (bukan nama hardcode).
- `screenPrintersOverviewDraw()` — **dead code**, tidak dipanggil di `main.cpp` manapun. Grid generik 2 kolom, iterate by index.

**Sumber data:** `parsePrintersJson()` (`api_client.cpp`/`printers.cpp`) subscribe `3dpb/printers` (retained, dari [printer-monitor](../../../docs/superpowers/specs/2026-07-16-printer-monitor-design.md) sejak cutover 2026-07-18) → isi `PrinterData gPrinters[MAX_PRINTERS]`. **Tidak berubah** oleh spec ini — kontrak payload sama persis.

**Primitif gambar tersedia:** `tft.fillRect/drawLine/setCursor/print/printf/color565`, konstanta warna `C_GREEN/C_RED/C_YELLOW/C_DIM` (`display.h`). WiFi (`wifi_manager.cpp`) & MQTT broker/topic **hardcode compile-time** di `config.h` — tidak diubah spec ini (captive portal = Fase 4, CYD-produk).

## 3. Keputusan arsitektur

### 3.1 Repo baru: `3pb-monitoring-display`

`3dpb-app/apps/claude-monitor` **dipindah** (bukan disalin) ke repo baru khusus firmware CYD, terpisah dari `3dpb-app` (yang isinya campur studio/web — tak ada manfaat tooling bersama yang hilang) dan dari `shopee-analysis` (beda toolchain total, TS vs PlatformIO/C++).

```
~/Documents/Project/3pb-monitoring-display/
  apps/
    internal/
      default-layout.json  ← BARU — sample/template JSON, sumber sama yg dipakai applyDefaultLayout() firmware
      ...                    (migrasi claude-monitor, git history dijaga via git subtree split)
    produk/     ← BARU, TIDAK dibangun sesi ini (Fase 4)
  docs/superpowers/   ← spec ini + plan-nya disalin ke sini saat scaffolding
```
`default-layout.json` = **satu sumber kebenaran** dipakai dua arah: (1) contoh/template siap-pakai buat siapa pun yang mau lihat/pelajari format skema, (2) firmware baca file ini saat build (embed via `PROGMEM`/LittleFS image) sbg isi `applyDefaultLayout()` — tidak ada dua salinan yang bisa saling beda.

Migrasi: `git subtree split --prefix=apps/claude-monitor` di `3dpb-app` → import ke repo baru sbg `apps/internal/` (history commit dijaga). **Setelah** dikonfirmasi build & jalan identik di lokasi baru → `git rm -r apps/claude-monitor` di `3dpb-app` (commit terpisah, BUKAN rewrite history `3dpb-app` — cukup hapus working-tree state supaya tidak duplikat).

### 3.2 Skema JSON layout

Direview via konsultasi UX (Fable) + review Product — hasil final (grid, bukan pixel; `fields` array-of-rows, bukan preset kaku):

```typescript
interface LayoutConfig {
  schemaVersion: 1
  pages: LayoutPage[]           // maks 8 halaman
}
interface LayoutPage {
  id: string                    // mis. "rack", "detail-1"
  grid: { cols: number; rows: number; rowWeights?: number[] }  // rowWeights: proporsi relatif tinggi tiap baris (default seragam kalau tak diisi)
  fields: FieldRow[]             // default field per cell, bisa di-override per cell (lihat cells[].fields)
  durationSec: number            // 0 = halaman manual (spt Rack skrg); >0 = auto-rotate saat diparkir (spt Detail skrg, 8s)
  cells: LayoutCell[]            // maks 24 cell/halaman
}
type FieldRow = FieldEntry[]                    // satu baris visual; >1 entry = dibagi rata kiri-kanan dlm baris itu
type FieldEntry = FieldId | { id: FieldId; label?: string }   // string = pakai label bawaan; object = override label
type FieldId = "name" | "type" | "state" | "progress" | "progressBar"
             | "timeLeft" | "eta" | "filename" | "error"
interface LayoutCell {
  type?: "printer" | "label"    // default "printer"
  printer?: string              // WAJIB kalau type=printer — id STABIL printer (bukan display name, lihat catatan di bawah)
  text?: string                 // WAJIB kalau type=label — teks statis (mis. "RAK KIRI")
  col: number; row: number; colSpan?: number; rowSpan?: number   // default span=1
  fields?: FieldRow[]           // override fields default halaman, khusus cell ini (mis. Ganymede tampilkan filename)
}
```

**Referensi printer via `id` stabil, bukan `name` tampilan** — rename printer di masa depan tak boleh merusak layout. **Prasyarat kecil di luar spec ini:** payload `3dpb/printers` (`packages/printer-monitor-core`, sudah live sejak Fase 1) sekarang cuma expose `name`; perlu tambahan field `id` (aditif, backward-compatible — `id` sudah ada di `DeviceConfig` tiap device, tinggal di-passthrough ke `PrinterRow`).

**`progressBar`** dirender sebagai bar visual (track abu-abu + isi warna sesuai state, `fillRect`), BUKAN teks — beda dari `progress` (teks `"45%"`). Baris berisi `progressBar` pakai tinggi lebih pendek (~10px) daripada baris teks (~16px) di tabel statis firmware.

**Graceful degradation:** firmware gambar `fields` baris demi baris (top→bottom) sampai tinggi cell habis, lalu berhenti (baris yang tak muat di-skip, bukan error). Sel kecil (rack) otomatis cuma tampil `name+state+progress`; sel besar (detail) otomatis tampil semua field yang dikonfigurasi.

**Cell `type:"label"`** — teks statis, tak terikat printer manapun (ganti hardcode "RAK KIRI"/"RAK KANAN" di kode lama).

**Validasi & fallback:** `printer` yang tak match id manapun di payload live → cell digambar kosong (state implisit OFFLINE). Payload malformed atau `pages`/`cells` melebihi limit (8 halaman / 24 cell) → `deserializeJson`/validasi gagal → **pertahankan layout lama** (retained sebelumnya / cache), jangan crash/blank. Limit di atas dipilih supaya ukuran `JsonDocument` ArduinoJson bisa di-bound statis (device RAM terbatas).

### 3.3 Kontrak MQTT

- **Topic config (masuk):** `3dpb/cyd/<deviceId>/layout`, **retained**. `deviceId` untuk device ini = `"internal-rack"` (konstanta di `config.h`, satu device fisik).
- **Topic readback (keluar), BARU:** `3dpb/cyd/<deviceId>/layout/current`, **retained**. Firmware publish `gLayout` (config yang SEDANG aktif di layar — hasil dari cache, default, atau MQTT baru, apa pun sumbernya) ke topic ini **setiap kali** `applyLayout()` sukses. Dua kegunaan: (1) sample/debug — subscribe topic ini kapan saja utk lihat persis apa yg sedang tampil di device manapun; (2) dashboard pakai ini sbg **konfirmasi save** (lihat §3.5) — tanpa ini, publish config dari dashboard bersifat *fire-and-forget*, tak ada cara tahu device beneran menerapkannya.
- **Reporter:** dashboard (§3.5) publish retained JSON via `mqtt.js` (Node, sama library yg dipakai `printer-monitor-core`) ke broker `.113:1883` — **broker yang sama**, reuse, bukan instalasi baru.
- Firmware subscribe topic config **selain** `3dpb/printers` yang sudah ada (tiga subscription independen total termasuk `3dpb/cyd/orders`, sama pola yg sudah jalan di firmware ini).

### 3.4 Firmware: satu renderer generik + cache + fallback

Fungsi baru menggantikan 3 fungsi lama (`screens/printers.cpp`):
```cpp
void screenLayoutDraw(int pageIndex);   // hitung geometri grid (cellW=screenW/cols, cellH=screenH*rowWeight/sum), loop cells, panggil drawCell per cell
void drawLabelCell(int x,int y,int w,int h, const char* text);        // cell type=label
void drawPrinterCell(int x,int y,int w,int h, const PrinterData& p, const FieldRow* fields, int fieldCount);  // loop fields baris demi baris, dispatch per FieldId ke drawTextField()/drawProgressBar(), stop saat tinggi habis (graceful degradation)
void onLayoutMessage(const char* topic, byte* payload, unsigned int len);  // MQTT callback: parse+validasi (schemaVersion, limit 8 halaman/24 cell), simpan ke gLayout in-memory, tulis ke LittleFS, invalidate redraw. Gagal parse/validasi → gLayout TAK diubah (layout lama tetap dipakai)
void loadLayoutFromCache();    // baca /layout.json dari LittleFS saat boot (sebelum WiFi/MQTT connect) — offline-capable
void applyDefaultLayout();     // fallback baked-in sederhana (grid 6×4 cocok topologi 10-printer sekarang, dari default-layout.json §3.1) — dipakai kalau LittleFS kosong DAN belum pernah terima MQTT. Auto-layout generik dari printer manapun (utk CYD-produk) DITUNDA ke Fase 4 — bukan scope sesi ini.
void applyLayout(const LayoutConfig& cfg);     // titik tunggal yg dipanggil dari cache/default/MQTT — set gLayout, redraw, DAN publish balik ke topic readback §3.3 (retained). Satu fungsi, tiga pemanggil, satu jaminan: readback selalu sinkron dgn apa yg benar-benar tampil di layar.
```
Tabel statis `FieldId → {tinggiPx, renderer}` (dipakai `drawPrinterCell`) — satu-satunya bagian yang butuh kehati-hatian, sisanya integer math sederhana (bukan layout engine).

Differential-redraw (`namedCellChanged`/`sForceAll`) **dipertahankan**, digeneralisasi jadi bekerja per-cell-index (bukan per-nama-hardcode) dalam halaman aktif — kunci pembanding sekarang `(col,row)` bukan nama printer literal.

**`main.cpp` — navigasi jadi dinamis:** halaman printer (dulu index 1-5 tetap) sekarang index `1 .. 1+gLayout.pages.size()-1`, dihitung dari jumlah `pages` yang termuat. Index Claude (0) tetap 0. Index Gold/Orders bergeser mengikuti `1 + pageCount` (bukan `#define` tetap lagi — dihitung saat boot setelah layout termuat, sebelum loop pertama). Auto-rotate (spt Detail sekarang) aktif untuk halaman dgn `durationSec > 0`.

### 3.5 Editor layout — `apps/dashboard` (shopee-analysis), MVP

**Bukan** app terpisah, **bukan** di `apps/saas` (itu tugas sesi SaaS nanti, produk customer, ikut kontrak yang sama). Dibangun di `apps/dashboard` sesi ini karena tidak overlap dgn kerjaan sesi SaaS aktif (`apps/saas`, terverifikasi 2026-07-18: semua commit SaaS confined ke foldernya sendiri).

**Scope MVP** — satu halaman `app/(dashboard)/cyd-layout/page.tsx`:
- Form grid TETAP (bukan drag-drop bebas) — 10 slot rack (grid 6×4 sesuai §3.2) + 2 slot label ("RAK KIRI"/"RAK KANAN", teks tetap) + 1 slot Ganymede-lebar (colSpan 6), cocok topologi fisik sekarang. Tiap slot printer = `<select>` isi printer, opsi diambil live dari `3dpb/printers` (API route baru `GET /api/cyd-layout/printers` — subscribe sesaat ke broker, baca retained, return daftar `{id,name}`; **butuh field `id`** dari payload — lihat prasyarat §3.2).
- Tombol Simpan → `POST /api/cyd-layout` — server membentuk `LayoutConfig` LENGKAP (bukan cuma page rack): page `"rack"` dari assignment form (grid+cells+fields default `["name"],["state","progress"],["progressBar"]`); page `"detail-1"` dst di-**generate otomatis** di server dengan mengelompokkan printer yang sama (urutan sesuai assignment rack) jadi grid 1×3 per halaman, fields lengkap (`name/type`, `state+progress`, `progressBar`, `timeLeft+eta`, `filename`). Publish retained ke topic config §3.3.
- **Konfirmasi diterapkan:** setelah publish, halaman subscribe singkat (~5 detik timeout) ke topic readback `.../layout/current` (§3.3) — kalau payload yg diterima match dgn yg baru dikirim → tampilkan "✅ Diterapkan ke CYD". Timeout tanpa match → "⚠️ Tersimpan, tapi device belum konfirmasi (cek koneksi CYD)". Bukan hard-error — publish tetap sukses (retained, device tetap akan menerapkannya begitu online), ini murni sinyal UX.
- **Kenapa detail di-generate otomatis, bukan diedit manual:** MVP fokus pada masalah nyata (rearrange fisik rak tanpa reflash); skema JSON tetap genuinely multi-page multi-field (membuktikan fondasi utk Fase 4/produk yang nanti bisa expose UI penuh per-halaman/per-field), tapi UI-nya sengaja tak melebar ke drag-drop/field-picker bebas (itu scope dashboard/SaaS lanjutan, bukan sesi ini).

## 4. Testing

- **Firmware (native/unit, kalau ada test harness PlatformIO):** geometri grid (`cellW/cellH` benar dari `cols/rows/rowWeights`, termasuk kasus tanpa `rowWeights` = seragam), `drawPrinterCell` per `FieldId` (dimensi/warna/label benar, termasuk override `label`), graceful-degradation (baris terakhir yg tak muat ter-skip, bukan overflow/crash), parse `LayoutConfig` dari sample JSON (termasuk malformed/melebihi limit → fallback lama dipertahankan), `applyDefaultLayout()` cocok proporsi visual dgn `screenPrintersRackDraw()` lama (regression guard — **bukan lagi pixel-identik**, krn grid seragam per-baris beda dari pixel bebas asli; verifikasi visual, bukan diff pixel exact).
- **Dashboard:** test route `POST /api/cyd-layout` (bentuk `LayoutConfig` valid sesuai skema §3.2, page detail ter-generate benar dari assignment, subscribe readback + timeout 5s berfungsi) + `GET /api/cyd-layout/printers` (parse retained payload, includes `id`).
- **Firmware — readback:** `applyLayout()` selalu publish ke topic `.../layout/current` stlh cache/default/MQTT diterapkan (3 pemanggil, satu assert: readback == gLayout aktif).
- **Manual end-to-end (tak ada hardware-in-loop otomatis):** publish dari dashboard MVP → verifikasi log serial firmware (`Serial.printf`) menerima & re-render → foto/screenshot layar fisik sbg bukti (user, seperti pola verifikasi CYD di printer-monitor Fase 1).

## 5. Risiko & catatan terbuka

- **Migrasi git history** — `git subtree split` bisa jadi rewrite-berat kalau `claude-monitor` punya riff merge kompleks; verifikasi `git log` di repo baru sebelum hapus dari `3dpb-app`.
- **Refactor `main.cpp` paging** — index Gold/Orders yang tadinya `#define` tetap jadi dihitung dinamis; risiko regresi navigasi ke halaman non-printer kalau perhitungan offset salah. Test manual: cek semua 11(+) halaman bisa dicapai post-migrasi.
- **`durationSec` pada page pertama (Rack)** — di firmware lama, Rack (page 1) TIDAK auto-rotate (halaman statis, cuma Detail yg rotate). Skema baru: `durationSec:0` untuk Rack mempertahankan perilaku ini eksplisit.
- **Dashboard butuh MQTT client baru** — `apps/dashboard` belum pernah connect MQTT sebelumnya (selalu lewat CYD/n8n langsung). Tambah dependency `mqtt` (sudah dipakai stabil di `printer-monitor-core`, low risk).
- **Prasyarat kecil di `printer-monitor-core` (Fase 1, sudah live)** — tambah field `id` stabil ke `PrinterRow`/payload `3dpb/printers` (aditif, backward-compatible; `id` sudah ada di `DeviceConfig` internal, tinggal di-passthrough). Task kecil terpisah, dikerjakan sebelum/bersamaan dashboard editor krn editor butuh `id` utk populate dropdown.
- **Grid seragam vs pixel bebas asli** — baris grid (`rowWeights`) tidak akan 100% pixel-identik dgn tata letak custom asli (mis. lebar cell `Ganymede` dulu beda dari cell printer biasa via pixel manual; sekarang harus colSpan penuh dlm grid yg sama). Visualnya SANGAT mirip (sudah divalidasi via mockup), bukan pixel-exact — dicatat eksplisit supaya tak jadi kejutan saat regression-check.
- **Bug terpisah, sudah dicatat di memory `project_printer_monitoring_cyd`, TIDAK termasuk scope spec ini:** `Engine.publish()` di `printer-monitor-core` tak di-debounce (~2 publish/detik ke `3dpb/printers`) → CYD flicker tiap update. Prioritas tinggi, kerjakan terpisah dari migrasi/plan spec ini.

## 6. Roadmap lanjutan (di luar spec ini)

Fase 4 — `apps/produk` (firmware CYD-produk: captive portal, printer-only, OTA) + editor di `apps/saas` (kontrak JSON/MQTT sama seperti §3.2-3.3, tak perlu dinegosiasi ulang). Detail: `docs/superpowers/specs/2026-07-16-printer-monitor-design.md` §11, vault OK `integrations/printer-monitoring-architecture.md`.
