# Design: Printer Monitor — service standalone (ganti n8n) + fondasi produk CYD

**Tanggal:** 2026-07-16
**Status:** Design disetujui (brainstorm), belum ditulis plan
**Terkait:** `docs/superpowers/specs/2026-07-08-saas-3pb-design.md` (§Fase 4 printer bridge), memory `project_printer_monitoring_cyd`, `project_saas_3pb`

## 1. Ringkasan & tujuan

Memindahkan seluruh logika monitoring status printer **dari n8n ke satu service standalone yang portabel**, sekaligus meletakkan fondasi produk (add-on SaaS: hardware CYD + agent monitoring untuk customer).

Tujuan konkret:

1. **Ganti n8n** sebagai sumber `3dpb/printers` (yang di-subscribe CYD) dengan service milik sendiri di monorepo — hilangkan ketergantungan n8n `192.168.88.186`.
2. **Perbaiki monitoring "statis"** — status printer live yang benar (progress/state/error), termasuk membersihkan baris basi (mis. Jupiter beku sejak Mei karena workflow subscribe-nya `off`) dan menampilkannya di dashboard 3pb (sekarang dashboard hanya punya CRUD daftar printer manual, tanpa status live).
3. **Core dipakai ulang** untuk dua konteks deploy tanpa menulis logika dua kali: internal (homelab) dan produk (agent di LAN customer).

Non-tujuan (spec ini mendesain arsitektur menyeluruh, tapi implementasi difase — lihat §11):
- Firmware CYD generik, web-flasher, layout editor = sub-proyek terpisah (spec sendiri).
- Billing/licensing penuh = menyusul saat fase produk.

## 2. Kondisi saat ini (hasil inspeksi n8n live + MQTT, 2026-07-16)

Sumber `3dpb/printers` sekarang = n8n (`192.168.88.186:5678`), dibuktikan dari inspeksi API workflow + payload MQTT retained. Fungsi n8n:

**A. 9× workflow `Subscribe <Nama> MQTT Status`** (per printer Bambu) — MQTT Trigger subscribe `device/<serial>/report` pakai kredensial `BL <Nama>` (berisi IP LAN printer + user `bblp` + access code, TLS 8883) → Code node ekstrak field → panggil sub-workflow `Process MQTT Message`.

Inventaris printer (otoritatif dari node `Printer Pushall Keepalive`):

| Nama | Serial | Type | Subscribe aktif |
|---|---|---|---|
| Jupiter | `00M09D562001206` | X1C | **off** (perlu dihidupkan lagi) |
| Moon | `22E8BJ612404007` | P2S | on |
| Uranus | `01P00C572300783` | P1S | on |
| Neptune | `01P00C572502172` | P1S | on |
| Saturn | `01P09C4B2000180` | P1S | on |
| Mars | `01S00A2C0502433` | P1P | on |
| Mercury | `03090A481400312` | A1Mini | on |
| Venus | `03919E462800737` | A1 | on |
| Earth | `03919D562403184` | A1 | on |
| Ganymede | — (Snapmaker U1) | U1 | on (jalur Moonraker) |

**B. `Process MQTT Message`** (aggregator pusat, id `th9fghY5V3rmqfyo`): Normalize (`gcode_state`→`normalized_state`, rakit `error_details` dari HMS + `print_error` hex + `mc_print_error_code`) → state-machine `Capture Event` (deteksi `started`/`error`/`finished` dgn membandingkan state sebelumnya di DataTable) → notifikasi Telegram + Pushover → Translate HMS (key `attr(hex8)+code(hex8)` → DataTable `hms_lookup`) → persist last-state per printer → `Format Printers` (rakit array, `TYPE_MAP` nama→model, **stale >10 menit → `OFFLINE`**) → publish **retained** `3dpb/printers` ke Mosquitto `.113:1883`.

**C. `Subscribe Ganymede (Snapmaker U1)`** — non-Bambu: Schedule Trigger → HTTP GET **Moonraker** `http://192.168.88.40/printer/objects/query?print_stats&virtual_sdcard&display_status` → parse (Klipper) → publish ke `3dpb/printers` yang sama.

**D. `Printer Pushall Keepalive`** — Schedule Trigger → publish perintah **pushall** ke `device/<serial>/request` tiap printer Bambu (Bambu hanya kirim full report berkala; pushall memaksa refresh). **Wajib direproduksi** — tanpa ini data cepat basi.

**E. `Refresh HMS Lookup Table`** — HTTP GET `raw.githubusercontent.com/suchmememanyskill/bambu-error-codes/main/codes.json` → isi DataTable `hms_lookup` (key `{attr}_{code}`).

### Kontrak data `3dpb/printers` (WAJIB dipertahankan — CYD tak boleh berubah)

Payload retained = `{"payload":[ ...printer ]}` (Ganymede mem-publish `payload` sebagai string JSON; Bambu sebagai array — **catatan inkonsistensi yang harus diseragamkan**, lihat §10). Tiap printer:

```json
{
  "name": "Mars", "type": "P1P", "state": "finish",
  "progress": 100, "remaining_min": 0,
  "filename": "Nike_Crocs_1.3.gcode.3mf",
  "error_msg": "print_error=0 | mc_print_error_code=0",
  "last_seen": "2026-07-16T00:50:44.648Z"
}
```

## 3. Arsitektur — 1 core, banyak shell

```
Sumber (LAN)          CORE ENGINE (@3pb/printer-monitor-core, TS murni)        Output
┌──────────┐   ┌──────────────────────────────────────────────────┐   ┌─────────────────┐
│ Bambu ×9 │──▶│ Connectors (pluggable)                           │   │ MQTT retained   │
│ LAN-MQTT │   │  · BambuMqttConnector (+ pushall keepalive)      │──▶│ 3dpb/printers   │──▶ CYD
│  8883    │   │  · MoonrakerConnector (HTTP poll)                │   ├─────────────────┤
├──────────┤   │ Pipeline: normalize → state-machine → HMS →      │   │ Reporter        │
│ Klipper/ │──▶│           staleness→OFFLINE → aggregate          │──▶│ (pluggable):    │──▶ dashboard
│ Snapmaker│   │ State store (abstrak: in-memory + persist adapter)│   │ MQTT / Supabase │    + push notif
└──────────┘   └──────────────────────────────────────────────────┘   └─────────────────┘
```

Core dibungkus **shell** sesuai konteks (tak ada logika ditulis dua kali):

| Shell | Untuk | Bentuk | Display | Config secret |
|---|---|---|---|---|
| **Server / CLI** | internal homelab **+** advanced user (Linux/server/Docker) | daemon headless (Docker) | **interactive TUI** saat di-attach (mis. `printer-monitor status`) | CLI prompt / file lokal |
| **Desktop** | user awam (add-on SaaS) | native app Mac/Win (rekomendasi **Tauri** — bundle kecil, core jalan sebagai sidecar) | GUI in-app | form GUI, simpan di OS keychain |

**Tidak ada web UI di service** — monitoring web = dashboard 3pb. Service hanya menampilkan status via TUI (server/CLI) atau GUI (desktop).

## 4. Prinsip pemisahan (keputusan terkunci)

1. **Service = data-plane / broker murni, limit-agnostic.** Ia connect printer apa pun yang ada di config-nya, normalize, publish. Ia **tidak** tahu tier/limit.
2. **Limit device ditegakkan di control-plane (dashboard/lisensi)** — model A: entitlement dari license key (signed, verifiable offline untuk tier lokal) / akun cloud; gate di UI "Add device". Internal = unlimited (gate non-aktif). #1 internal **tak butuh licensing sama sekali**.
3. **Secrets stay local.** `ip` + `accessCode` printer **tak pernah** meninggalkan jaringan lokal — disimpan hanya di agent (file / OS keychain). Server hanya tahu metadata device (`name/type/serial`).
4. **Reporter pluggable.** Core meng-emit status/event; adapter `Reporter` menentukan tujuan. Internal = MQTT lokal; produk = Supabase.

## 5. Alur provisioning device

1. **Add device di dashboard** → isi `name/type/serial` (+ pilih connector Bambu/Moonraker). Di sinilah **limit** dicek terhadap entitlement.
2. Device kanonik tersimpan di **VPS Postgres**; metadata di-mirror ke Supabase `devices` (produk) / tersedia via API (internal).
3. Agent **pull daftar device** (metadata saja, tanpa secret) — internal via API dashboard; produk via Supabase Realtime.
4. Device muncul di **shell agent** (TUI/GUI) → user isi `ip` + `accessCode` → **disimpan lokal saja**.
5. Agent connect printer (LAN) → normalize + deteksi event → **publish `3dpb/printers`** (CYD lokal) **+ lapor status/event ke reporter** (dashboard/Supabase untuk monitoring + push).

## 6. Komponen core & batas (interface)

Semua di `packages/printer-monitor-core/` (framework-free, unit-testable):

- **`Connector`** — `interface { start(onSample), stop() }`; menghasilkan `RawSample { deviceId, raw }`.
  - `BambuMqttConnector` — subscribe `device/<serial>/report` (mqtt.js, TLS 8883, user `bblp`, pass=accessCode); jadwal **pushall** ke `device/<serial>/request`.
  - `MoonrakerConnector` — poll HTTP `/printer/objects/query?...` interval N detik.
- **`normalize(raw, device)` → `NormalizedStatus`** — port dari n8n `Normalize Message` (state map, progress, file, remaining, print_error hex, hms[], error_details).
- **`StateMachine`** — port dari `Capture Event`: transisi → event `started`/`error`/`finished` berbasis last-state.
- **`HmsLookup`** — `codes.json` **di-bundle ke build (vendored)** supaya internal zero-internet; refresh online opsional saat tersedia; `translate(hms[]) → string[]`.
- **`Aggregator`** — gabung semua device jadi payload `3dpb/printers`; `TYPE_MAP`; **staleness >10 menit → OFFLINE**.
- **`StateStore`** — abstrak (in-memory default; adapter persist opsional untuk history).
- **`Reporter`** — `interface { publishStatus(payload), emitEvent(event) }`; impl `MqttReporter`, `SupabaseReporter`.
- **`Notifier`** (opsional) — `TelegramNotifier`, `PushoverNotifier` (port dari n8n; off default di v1 internal).

## 7. Konteks deploy & transport

| Konteks | Registry pull | Status/event push | CYD | Secrets |
|---|---|---|---|---|
| **Internal (homelab)** | API dashboard (lokal) | **MQTT lokal** (mosquitto `.113`) → dashboard subscribe | mosquitto `.113` `3dpb/printers` | file lokal di container |
| **Produk (customer)** | **Supabase Realtime** (`devices` mirror) | **Supabase** (upsert `printer_status`, insert `printer_events`) | broker **lokal** agent (offline-capable) | OS keychain / file |

**Internal = zero dependensi internet (requirement eksplisit):** semua komponen lokal (mosquitto, dashboard, service di `.113`), tanpa Supabase, tanpa license check (mode internal → modul licensing non-aktif, entitlement unlimited), HMS di-bundle (§6), dan service **men-cache daftar device lokal** sehingga tetap boot saat dashboard mati. Hanya jalur SaaS yang phone-home (license + Supabase).

**Penempatan data (produk, model A "Supabase tipis"):**
- **Agent lokal:** `ip`/`accessCode` — tak pernah ke cloud.
- **Supabase:** hot/realtime — `printer_status` (snapshot terkini per device), `printer_events` (log terbaru, boleh TTL), `devices` (mirror metadata). RLS per tenant. Tak ada data bisnis/billing/secret.
- **VPS Postgres:** source-of-truth bisnis — users, subscription/entitlement, registry device kanonik, billing (QRIS manual), kalkulator. Sesuai Fase 1, tak berubah.
- Sinkron: "Add device" → VPS (kanonik, gated) → mirror ke Supabase → agent subscribe.

## 8. Integrasi control-plane (dashboard `apps/dashboard`)

- **Device registry** — API + UI CRUD (`name/type/serial/connector`), gate limit (internal: unlimited).
- **Halaman "Printer Status"** — read-only live, konsumsi `3dpb/printers` (internal: subscribe MQTT server-side / SSE ke browser) — **ganti tampilan statis**.
- **Push notifikasi** (produk) — dari `printer_events` (trigger Supabase → Edge Function) — port peran Telegram/Pushover n8n.

## 9. Migrasi / cutover dari n8n

1. Stand up service internal (Docker `.113`), isi inventaris printer (serial dari tabel §2; **ip+accessCode diambil dari kredensial n8n / Bambu Handy** saat deploy — belum di tangan, lihat §10).
2. Jalankan **paralel** dengan n8n; verifikasi **paritas** `3dpb/printers` (bandingkan payload service vs n8n untuk printer yang sama).
3. Reproduksi **pushall keepalive** & **HMS refresh** di service.
4. Setelah paritas OK: **nonaktifkan** workflow n8n terkait printer (Subscribe ×9, Process MQTT Message, Ganymede, Pushall Keepalive, Refresh HMS). **Hidupkan lagi Jupiter** via service.
5. CYD tak disentuh (kontrak `3dpb/printers` identik).

## 10. Risiko & catatan terbuka

- **Secrets:** `ip`+`accessCode` per printer ada di credential terenkripsi n8n (API tak mengekspos) — **keputusan: user isi manual sambil testing** (dari Bambu Handy/router). **Serial Mercury** beda antara node Keepalive (`03090A481400312`) dan spec lama n8n (`0309DA4B1400312`) — verifikasi saat isi config.
- **Inkonsistensi payload existing:** jalur Bambu publish `payload` sebagai array; jalur Ganymede sebagai string JSON. Service baru harus **seragamkan** (satu format; uji CYD menerima). Casing state juga campur (`finish` vs `FINISH` vs `OFFLINE`) — normalisasi.
- **Snapmaker U1 via Moonraker** IP `192.168.88.40` — konektor kedua wajib ada sejak v1 (bukan opsional).
- **Race data-plane vs banyak printer** — satu koneksi MQTT per printer; uji reconnect & pushall.

## 11. Roadmap implementasi (difase)

- **Fase 1 — Core + shell server/CLI + cutover internal** (spec ini, prioritas sekarang): `packages/printer-monitor-core` + `services/printer-monitor` (daemon Docker + TUI, `MqttReporter`), reproduksi Bambu+Moonraker+pushall+HMS, cutover dari n8n. Selesai = n8n printer-workflow mati, CYD tetap jalan, Jupiter hidup lagi.
- **Fase 2 — Integrasi dashboard**: device registry API/UI + halaman Printer Status live (ganti statis, ini adalah web interface-nya — service sendiri TETAP tanpa web UI) + entitlement seam (unlimited internal) + **distribusi CLI sebagai single binary** (`bun build --compile`, target macOS/Linux/Windows) supaya advanced-user self-host tak perlu install Node/pnpm — tanpa rewrite core TS yang sudah ada.
- **Fase 3 — Transport produk**: `SupabaseReporter` + skema Supabase (`printer_status`/`printer_events`/`devices`) + RLS + push notif.
- **Fase 4 — Shell desktop**: Tauri Mac/Win, GUI + keychain, embed provisioning.
- **Fase 5 — Licensing**: gate limit device di control-plane (model A).

## 12. Testing

- **Unit (core):** `normalize`, `StateMachine`, staleness→OFFLINE, `HmsLookup`, `Aggregator` — data mentah dari sample MQTT nyata (sudah ditangkap).
- **Paritas:** payload `3dpb/printers` service vs snapshot n8n tertangkap → harus setara per printer.
- **Connector:** integrasi dgn mock MQTT broker + mock Moonraker HTTP.
- **Reporter:** kontrak `publishStatus`/`emitEvent` (MQTT & Supabase) via double.

## 13. Kontrak keselarasan CYD (mengikat sub-proyek firmware / web-flasher / layout editor)

Keputusan user 2026-07-16 — sub-proyek CYD berikutnya WAJIB align dengan ini:

1. **Firmware sekali flash.** Flash via USB/web-serial hanya sekali di awal (atau saat brick). Update versi firmware selanjutnya via **OTA lewat WiFi** (esp_https_ota / ArduinoOTA), bukan flash ulang.
2. **Provisioning tanpa flash.** First boot → ESP32 **AP mode + captive portal**: user pilih SSID WiFi, password, dan **IP broker MQTT** dari HP. Tidak ada kredensial di-compile ke firmware. (Evolusi opsional nanti: on-screen picker + keyboard LVGL memanfaatkan touch CYD.)
3. **Layout dinamis tanpa flash.** Firmware = **renderer generik**; layout = **JSON** (widget, posisi, urutan, binding topic/field) di-publish **retained MQTT** ke topic per-device (mis. `3dpb/cyd/<deviceId>/layout`). CYD subscribe → re-render seketika → **cache di NVS/LittleFS** (survive reboot, jalan offline). Editor drag-and-drop di dashboard hanya menulis JSON ini.
4. **Batas yang disadari:** *jenis* widget fix per versi firmware; menambah jenis widget baru = update firmware (via OTA, tetap tanpa USB).

## 14. Tata letak monorepo

```
packages/printer-monitor-core/   # @3pb/printer-monitor-core — engine (Fase 1)
services/printer-monitor/        # shell server/CLI + Docker (Fase 1; precedent: services/stl-service)
apps/dashboard/                  # registry + Printer Status page + entitlement (Fase 2)
apps/printer-monitor-desktop/    # Tauri (Fase 4)
# Supabase schema + product cloud (Fase 3) — lokasi TBD saat fase
```
