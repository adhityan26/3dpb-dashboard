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
    internal/   ← migrasi claude-monitor, git history dijaga (git subtree split)
    produk/     ← BARU, TIDAK dibangun sesi ini (Fase 4)
  docs/superpowers/   ← spec ini + plan-nya disalin ke sini saat scaffolding
```

Migrasi: `git subtree split --prefix=apps/claude-monitor` di `3dpb-app` → import ke repo baru sbg `apps/internal/` (history commit dijaga). **Setelah** dikonfirmasi build & jalan identik di lokasi baru → `git rm -r apps/claude-monitor` di `3dpb-app` (commit terpisah, BUKAN rewrite history `3dpb-app` — cukup hapus working-tree state supaya tidak duplikat).

### 3.2 Skema JSON layout

```typescript
interface LayoutConfig { pages: LayoutPage[] }
interface LayoutPage {
  id: string                              // mis. "rack", "detail-1"
  style: "compact" | "detail" | "mini"    // compact=Rack, detail=3-card, mini=grid 2 kolom
  durationSec: number                     // 0 = halaman manual (spt Rack skrg); >0 = auto-rotate saat diparkir (spt Detail skrg, 8s)
  cells: LayoutCell[]
}
interface LayoutCell {
  x: number; y: number; w: number; h: number   // piksel, origin kiri-atas 320×240
  printer: string                               // match field `name` di payload 3dpb/printers
}
```
Field `printer` yang tak match printer manapun di payload live → cell digambar kosong (state implisit OFFLINE, tanpa error). Tidak ada validasi skema di firmware selain field wajib ada — payload malformed → `deserializeJson` gagal → **pertahankan layout lama** (retained sebelumnya / cache), jangan crash/blank.

### 3.3 Kontrak MQTT

- **Topic:** `3dpb/cyd/<deviceId>/layout`, **retained**. `deviceId` untuk device ini = `"internal-rack"` (konstanta di `config.h`, satu device fisik).
- **Reporter:** dashboard (§3.5) publish retained JSON via `mqtt.js` (Node, sama library yg dipakai `printer-monitor-core`) ke broker `.113:1883` — **broker yang sama**, reuse, bukan instalasi baru.
- Firmware subscribe topic ini **selain** `3dpb/printers` yang sudah ada (dua subscription independen, sama seperti pola `3dpb/cyd/orders` yang sudah jalan di firmware ini).

### 3.4 Firmware: satu renderer generik + cache + fallback

Fungsi baru menggantikan 3 fungsi lama (`screens/printers.cpp`):
```cpp
void screenLayoutDraw(int pageIndex);                 // baca gLayout.pages[pageIndex], loop cells, gambar tiap cell sesuai style
void drawGenericCell(int x,int y,int w,int h, const PrinterData& p, CellStyle style);  // style-parameterized: refactor drawCell()+drawRow() jadi satu, param style menentukan densitas info (compact=nama+tipe+state+bar kecil spt drawCell skrg; detail=full spt drawRow skrg; mini=nama+state saja)
void onLayoutMessage(const char* topic, byte* payload, unsigned int len);  // MQTT callback: parse, simpan ke gLayout in-memory, tulis ke LittleFS, invalidate redraw
void loadLayoutFromCache();    // baca /layout.json dari LittleFS saat boot (sebelum WiFi/MQTT connect) — offline-capable
void applyDefaultLayout();     // fallback baked-in, ISI PERSIS tampilan Rack+Detail hardcode sekarang (10 printer di posisi sama) — dipakai kalau LittleFS kosong DAN belum pernah terima MQTT
```
Differential-redraw (`namedCellChanged`/`sForceAll`) **dipertahankan**, digeneralisasi jadi bekerja per-cell-index (bukan per-nama-hardcode) dalam halaman aktif.

**`main.cpp` — navigasi jadi dinamis:** halaman printer (dulu index 1-5 tetap) sekarang index `1 .. 1+gLayout.pages.size()-1`, dihitung dari jumlah `pages` yang termuat. Index Claude (0) tetap 0. Index Gold/Orders bergeser mengikuti `1 + pageCount` (bukan `#define` tetap lagi — dihitung saat boot setelah layout termuat, sebelum loop pertama). Auto-rotate (spt Detail sekarang) aktif untuk halaman dgn `durationSec > 0`.

### 3.5 Editor layout — `apps/dashboard` (shopee-analysis), MVP

**Bukan** app terpisah, **bukan** di `apps/saas` (itu tugas sesi SaaS nanti, produk customer, ikut kontrak yang sama). Dibangun di `apps/dashboard` sesi ini karena tidak overlap dgn kerjaan sesi SaaS aktif (`apps/saas`, terverifikasi 2026-07-18: semua commit SaaS confined ke foldernya sendiri).

**Scope MVP** — satu halaman `app/(dashboard)/cyd-layout/page.tsx`:
- Form grid TETAP (bukan drag-drop bebas) — 10 slot rack + 1 slot Ganymede-lebar, cocok topologi fisik sekarang. Tiap slot = `<select>` isi printer, opsi diambil live dari `3dpb/printers` (API route baru `GET /api/cyd-layout/printers` — subscribe sesaat ke broker, baca retained, return daftar nama).
- Tombol Simpan → `POST /api/cyd-layout` — server membentuk `LayoutConfig` LENGKAP (bukan cuma page rack): page `"rack"` dari assignment form; page `"detail-1"` dst di-**generate otomatis** di server dengan mengelompokkan printer yang sama (urutan sesuai assignment rack) jadi grup-3 gaya `detail`. Publish retained ke topic §3.3.
- **Kenapa detail di-generate otomatis, bukan diedit manual:** MVP fokus pada masalah nyata (rearrange fisik rak tanpa reflash); skema JSON tetap genuinely multi-page (membuktikan fondasi utk Fase 4/produk yang nanti bisa expose UI penuh per-halaman), tapi UI-nya sengaja tak melebar ke drag-drop bebas (itu scope dashboard/SaaS lanjutan, bukan sesi ini).

## 4. Testing

- **Firmware (native/unit, kalau ada test harness PlatformIO):** `drawGenericCell` per style (dimensi/warna benar per state), parse `LayoutConfig` dari sample JSON (termasuk malformed → fallback lama dipertahankan), `applyDefaultLayout()` cocok pixel-for-pixel dgn `screenPrintersRackDraw()` lama (regression guard).
- **Dashboard:** test route `POST /api/cyd-layout` (bentuk JSON valid, page detail ter-generate benar dari assignment) + `GET /api/cyd-layout/printers` (parse retained payload).
- **Manual end-to-end (tak ada hardware-in-loop otomatis):** publish dari dashboard MVP → verifikasi log serial firmware (`Serial.printf`) menerima & re-render → foto/screenshot layar fisik sbg bukti (user, seperti pola verifikasi CYD di printer-monitor Fase 1).

## 5. Risiko & catatan terbuka

- **Migrasi git history** — `git subtree split` bisa jadi rewrite-berat kalau `claude-monitor` punya riff merge kompleks; verifikasi `git log` di repo baru sebelum hapus dari `3dpb-app`.
- **Refactor `main.cpp` paging** — index Gold/Orders yang tadinya `#define` tetap jadi dihitung dinamis; risiko regresi navigasi ke halaman non-printer kalau perhitungan offset salah. Test manual: cek semua 11(+) halaman bisa dicapai post-migrasi.
- **`durationSec` pada page pertama (Rack)** — di firmware lama, Rack (page 1) TIDAK auto-rotate (halaman statis, cuma Detail yg rotate). Skema baru: `durationSec:0` untuk Rack mempertahankan perilaku ini eksplisit.
- **Dashboard butuh MQTT client baru** — `apps/dashboard` belum pernah connect MQTT sebelumnya (selalu lewat CYD/n8n langsung). Tambah dependency `mqtt` (sudah dipakai stabil di `printer-monitor-core`, low risk).

## 6. Roadmap lanjutan (di luar spec ini)

Fase 4 — `apps/produk` (firmware CYD-produk: captive portal, printer-only, OTA) + editor di `apps/saas` (kontrak JSON/MQTT sama seperti §3.2-3.3, tak perlu dinegosiasi ulang). Detail: `docs/superpowers/specs/2026-07-16-printer-monitor-design.md` §11, vault OK `integrations/printer-monitoring-architecture.md`.
