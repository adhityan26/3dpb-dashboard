# CYD Produk — Sub-proyek 2: Agent Core (Desktop App) — Design

## Konteks

Sub-proyek #1 (SaaS backend & device management, `apps/saas`) sudah selesai & deployed — customer bisa daftarkan printer (metadata doang, tanpa kredensial), atur layout CYD, dan generate token buat Agent. Spec ini = sub-proyek #2: **Agent**, aplikasi desktop yang jalan di komputer customer, jembatan antara printer di LAN customer dan layar CYD fisik.

Sub-proyek #3 (firmware CYD → LVGL) tetap terpisah, spec sendiri, tidak dibahas di sini.

## Goal

Aplikasi desktop (Windows dulu) yang: (a) tarik daftar device+layout dari SaaS pakai token, (b) bantu user pasangkan device terdaftar ↔ printer fisik di LAN (auto-discovery buat isi IP+serial, access code manual), (c) simpan kredensial printer 100% lokal (gak pernah ke server), (d) connect ke printer & publish status ke broker MQTT tertanam buat CYD, (e) tampilkan dashboard live status di window-nya sendiri.

## Keputusan Kunci

### Electron, bukan Tauri

Keputusan lama (sesi brainstorm jauh sebelumnya) pakai Tauri tanpa alasan kuat yang diingat user — dipertimbangkan ulang dari nol. `packages/printer-monitor-core` butuh API Node.js mentah (TCP/MQTT ke printer, `dgram` buat auto-discovery UDP, broker `aedes` tertanam) — semua ini **gak bisa jalan di webview** (sandbox browser biasa, gak ada raw socket). Tauri (Rust host + webview) makanya butuh proses sidecar Node.js terpisah + IPC — nambah bahasa baru (Rust, belum ada sama sekali di monorepo ini) dan arsitektur 2-proses yang lebih rumit.

**Electron** = Chromium+Node.js dibundling jadi satu — engine jalan LANGSUNG di proses utama (`main process`), gak perlu sidecar/IPC/Rust sama sekali. Trade-off: installer lebih gede (~100MB+, karena bawa Chromium sendiri) vs Tauri yang ~10-20MB. Diterima karena: (a) tim ini 100% TypeScript, gak ada urgensi belajar toolchain baru; (b) pola sama dipakai app konsumen besar (Discord/Slack/VS Code) — user awam sudah terbiasa install app seukuran itu; (c) reuse penuh `packages/printer-monitor-core` tanpa porting sama sekali.

### Reuse `packages/printer-monitor-core` apa adanya

`Engine`, `BambuMqttConnector`, `MoonrakerConnector`, `normalize-bambu.ts`/`normalize-moonraker.ts`, `HmsLookup`, `payload.ts` (aggregator+staleness), `state-store.ts`, `capture-event.ts` — semua generic/config-driven (dikonfirmasi saat riset sub-proyek 1), reusable langsung sebagai dependency `apps/agent` (nama package baru) tanpa modifikasi core-nya.

### Alur setup (dikonfirmasi user)

1. User buka Agent, tempel **token** (di-generate dari halaman Settings SaaS, sub-proyek 1) → Agent panggil `GET /api/agent/devices` (header `Authorization: Bearer slz_...`) buat tarik daftar device.
2. Tombol **"Scan LAN"** (manual, BUKAN auto-polling terus-menerus) — jalankan SSDP listener (Bambu, UDP port 2021/1900) + mDNS browse (Moonraker, `_moonraker._tcp.local`) barengan, kumpulkan hasil beberapa detik.
3. UI 2-kolom: **daftar device terdaftar** (dari SaaS, kiri) vs **printer hasil scan** (LAN, kanan) — user **pasangkan manual** (pilih device → pilih hasil scan yang cocok). Setelah dipasangkan: IP+serial otomatis keisi dari hasil scan, **access code WAJIB diisi manual** (satu-satunya kredensial yang gak pernah ke-broadcast, gak bisa di-auto).
4. Device yang sudah dipasangkan+diisi access code → `Engine` connect ke printer via LAN (`BambuMqttConnector`/`MoonrakerConnector`), publish status ke broker `aedes` tertanam (topic `3dpb/printers`, kontrak sama seperti internal — CYD gak perlu tahu bedanya), DAN tampil live di dashboard window Agent.

**Auto-discovery — 2 gotcha yang sudah divalidasi POC (bukan asumsi):**
- Bambu: broadcast SSDP non-standar UDP port 2021 (destinasi)/1900 (source), berisi IP+serial+model+nama, tertangkap nyata 8/10 printer produksi <20 detik. Access code TETAP manual (gak pernah dibroadcast).
- **BambuStudio bisa rebut port 2021 duluan** kalau jalan bareng di komputer yang sama (kejadian nyata pas POC) — scan HARUS gagal dengan pesan ramah ("Tutup BambuStudio dulu, coba scan lagi"), BUKAN crash/gagal diam-diam. Ini realistis kejadian di produksi karena target user Agent JUGA pengguna BambuStudio buat slicing.

### Penyimpanan kredensial — Electron `safeStorage`

IP, access code, serial per device (key = `Device.shortCode` dari SaaS) disimpan pakai **`safeStorage` API bawaan Electron** (enkripsi native OS — Credential Manager di Windows). Tidak pernah dikirim ke server dalam bentuk apa pun — cuma `Device.shortCode` (metadata non-rahasia) yang jadi kunci korelasi ke record SaaS.

**Bentuk fisik (klarifikasi — `safeStorage` cuma API enkripsi string, bukan database):** satu file JSON lokal di folder data app (`app.getPath('userData')`, setara `%APPDATA%\slizebiz-agent\` di Windows), isinya map `{ [shortCode]: { ip, serial, accessCode } }`, **seluruh isi file dienkripsi jadi satu blob** via `safeStorage.encryptString(JSON.stringify(map))` sebelum ditulis, `decryptString` pas dibaca saat app start. Bukan per-field, satu file satu blob — lebih sederhana buat skala 1-beberapa device.

### Layout & broker — kontrak lama, TIDAK berubah

Provisioning CYD (AP-mode captive portal first-boot, user ketik alamat broker) dan format layout (retained MQTT JSON `3dpb/cyd/<deviceId>/layout`) itu kontrak yang SUDAH ada dari spec CYD internal lama (§13) — TIDAK dirancang ulang di sini. Bedanya cuma: broker yang dituju sekarang **broker Agent (lokal, tertanam `aedes`)**, bukan mosquitto homelab. Agent tarik layout dari `GET /api/agent/layout` (404 kalau belum diatur di web — Agent skip publish sampai user atur), lalu republish sebagai retained message ke broker lokalnya sendiri.

### 2 tampilan live monitoring (BUKAN 3)

SaaS web = kantor pendaftaran doang (device list, layout editor, token) — TIDAK ada monitoring live di web buat tier Pro (itu jatah Subscribe, di luar scope, belum dibangun). Yang nampilin **live status** cuma 2 tempat, sama-sama disuapin `Engine` yang sama: **dashboard window Agent** (live status semua printer terpasang) dan **layar fisik CYD** (via layout yang diatur dari web).

## Scope

**Masuk:**
- Package baru `apps/agent` (Electron): main process (engine+broker+safeStorage+API client SaaS), renderer (UI: aktivasi token, pairing, dashboard live status).
- Auto-discovery SSDP (Bambu) + mDNS (Moonraker), dengan penanganan konflik port BambuStudio.
- Integrasi `packages/printer-monitor-core` apa adanya (tanpa modifikasi).
- Broker `aedes` tertanam.
- Build/installer Windows (satu platform dulu).

**Sengaja TIDAK masuk:**
- Build Mac/Linux.
- Auto-update mekanisme.
- Crash reporting/telemetry.
- Multi-screen CYD per akun (sub-proyek 1 sudah batasi 1 layar/akun).
- Setting lanjutan (interval polling, dll) — pakai default masuk akal, gak ada UI konfigurasi.
- Firmware CYD LVGL (sub-proyek #3, spec terpisah).

## Testing

Unit test buat pairing-logic (matching device↔hasil-scan), parsing SSDP/mDNS response (reuse pola test dari POC), integrasi `safeStorage` (mock Electron API). End-to-end (Engine connect printer beneran, broker publish, CYD terima) diverifikasi manual oleh user (Claude gak punya akses ke jaringan LAN printer customer atau layar CYD fisik).

## Out of Scope (eksplisit)

- Mac/Linux build, auto-update, telemetry, multi-screen CYD, setting lanjutan, firmware LVGL (semua di atas, dicatat ulang biar gak kelewat di plan).
