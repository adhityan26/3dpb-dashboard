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

**2 gotcha packaging — ditemukan review Fable, dicatat biar gak kejadian pas plan:**
- `HmsLookup` load `hms-codes.json` via `readFileSync(new URL(..., import.meta.url))` — pola ini rawan patah kalau Electron main process di-bundle (mis. ke asar/CJS). Mitigasi TANPA modifikasi core: `HmsLookup` konstruktornya sudah nerima table opsional (`HmsLookup(table?)`) — sisi `apps/agent` cukup `import` JSON itu sendiri lewat cara yang aman-bundle (mis. `require`/asset loader Electron) dan suntikkan ke konstruktor, bukan andalkan default loading internal core.
- `aedes` di `packages/printer-monitor-core` cuma `devDependency` (dipakai buat test doang) — `apps/agent` WAJIB deklarasi `aedes` + `mqtt` sendiri secara eksplisit di `package.json`-nya (pnpm strict, phantom dependency gak resolve, aturan monorepo ini).

### Alur setup (dikonfirmasi user)

1. User buka Agent, tempel **token** (di-generate dari halaman Settings SaaS, sub-proyek 1) → Agent panggil `GET /api/agent/devices` (header `Authorization: Bearer slz_...`) buat tarik daftar device.
2. Tombol **"Scan LAN"** (manual, BUKAN auto-polling terus-menerus) — jalankan SSDP listener (Bambu, UDP port 2021/1900) + mDNS browse (Moonraker, `_moonraker._tcp.local`) barengan, kumpulkan hasil beberapa detik.
3. UI 2-kolom: **daftar device terdaftar** (dari SaaS, kiri) vs **printer hasil scan** (LAN, kanan) — user **pasangkan manual** (pilih device → pilih hasil scan yang cocok). Setelah dipasangkan: IP+serial otomatis keisi dari hasil scan, **access code WAJIB diisi manual** (satu-satunya kredensial yang gak pernah ke-broadcast, gak bisa di-auto).
   - **Fallback kalau printer gak ketemu scan** (ditemukan review Fable — POC sendiri cuma nangkep 8/10 printer, bukan 100%; mDNS Moonraker juga butuh komponen `[zeroconf]` aktif, gak dijamin ada di install lama): sediakan opsi **"Isi manual"** per device — IP+serial+access code diketik langsung tanpa nunggu hasil scan.
4. Device yang sudah dipasangkan+diisi access code → `Engine` connect ke printer via LAN (`BambuMqttConnector`/`MoonrakerConnector`), publish status ke broker `aedes` tertanam, DAN tampil live di dashboard window Agent.

**Mapping ID — klarifikasi eksplisit (ditemukan review Fable, sebelumnya cuma tersirat):** ID device di `Engine`/`DeviceConfig` (`packages/printer-monitor-core`) HARUS persis **`Device.shortCode`** dari SaaS — bukan `Device.id` (cuid), bukan ID lain. Ini yang dipakai buat korelasi ke cell layout (`cell.printer` di layout config referensi `shortCode`) — kalau Engine diisi ID lain, rendering CYD gagal diam-diam (cell gak pernah ketemu device yang benar).

**Penanganan gagal auth (401 vs 403 — ditemukan review Fable, sebelumnya cuma dibahas 401):** `requireAgentToken` di server bisa balikin 2 jenis gagal beda arti — 401 (token gak valid/di-revoke, `error:"invalid_token"`) vs 403 (token valid tapi langganan Pro habis, `error:"entitlement_expired"`). Agent WAJIB bedakan pesannya ke user: 401 → "Token gak valid, generate ulang dari web"; 403 → "Akses Pro kamu berakhir — perbarui buat lanjut monitoring" (BUKAN pesan generik "gagal konek" buat keduanya, biar user tahu harus ngapain).

**Auto-discovery — gotcha yang sudah divalidasi POC (bukan asumsi):**
- Bambu: broadcast SSDP non-standar UDP port 2021 (destinasi)/1900 (source), berisi IP+serial+model+nama, tertangkap nyata 8/10 printer produksi <20 detik. Access code TETAP manual (gak pernah dibroadcast).
- **BambuStudio bisa rebut port 2021 duluan** kalau jalan bareng di komputer yang sama (kejadian nyata pas POC, dan terdokumentasi juga di tool komunitas lain kayak `ha-bambulab` — bukan kasus langka). Sebelum langsung nyerah ke pesan error, coba `dgram` socket dengan **`reuseAddr: true`** dulu (sering bisa koeksis di Windows) — kalau tetap gagal, baru tampilkan pesan ramah ("Tutup BambuStudio dulu, coba scan lagi"), BUKAN crash/gagal diam-diam.

**Sinkronisasi ulang (ditemukan review Fable, sebelumnya gak didefinisikan):** device-list dan layout di-refresh dari SaaS saat Agent start, PLUS tombol **"Sync"** manual di dashboard (user edit layout/device di web → klik Sync di Agent biar kepakai, gak nunggu restart app).

### Penyimpanan kredensial — Electron `safeStorage`

IP, access code, serial per device (key = `Device.shortCode` dari SaaS) disimpan pakai **`safeStorage` API bawaan Electron** (enkripsi native OS — Credential Manager di Windows). Tidak pernah dikirim ke server dalam bentuk apa pun — cuma `Device.shortCode` (metadata non-rahasia) yang jadi kunci korelasi ke record SaaS.

**Bentuk fisik (klarifikasi — `safeStorage` cuma API enkripsi string, bukan database):** satu file JSON lokal di folder data app (`app.getPath('userData')`, setara `%APPDATA%\slizebiz-agent\` di Windows), isinya map `{ [shortCode]: { ip, serial, accessCode } }`, **seluruh isi file dienkripsi jadi satu blob** via `safeStorage.encryptString(JSON.stringify(map))` sebelum ditulis, `decryptString` pas dibaca saat app start. Bukan per-field, satu file satu blob — lebih sederhana buat skala 1-beberapa device.

**3 hal tambahan — ditemukan review Fable:**
- **Token Agent JUGA kredensial** (spec awal sempat gak jelas nyimpennya di mana) — masuk blob terenkripsi `safeStorage` yang sama, key terpisah (mis. `agentToken`), BUKAN plain-text di tempat lain.
- **Cache metadata device non-rahasia** (label, printerType — BUKAN kredensial, boleh plain JSON terpisah dari blob) disimpan lokal juga, supaya Engine bisa direkonstruksi & tetap monitoring printer LAN walau SaaS lagi unreachable pas Agent start (device+printer di LAN sehat, cuma gak bisa refresh dari web — jangan sampai monitoring lokal ikut mati gara-gara internet server down).
- **Gagal decrypt** (mis. DPAPI Windows gagal — profil user berubah/blob korup/beda mesin) HARUS ditangani sebagai "anggap kosong, minta pairing ulang" — BUKAN crash. Cek `safeStorage.isEncryptionAvailable()` setelah `app.whenReady()` sebelum baca/tulis apa pun.

### Layout & broker — kontrak lama, TIDAK berubah

Provisioning CYD (AP-mode captive portal first-boot, user ketik alamat broker) dan format layout (retained MQTT JSON `3dpb/cyd/<deviceId>/layout`) itu kontrak yang SUDAH ada dari spec CYD internal lama (§13) — TIDAK dirancang ulang di sini. Bedanya cuma: broker yang dituju sekarang **broker Agent (lokal, tertanam `aedes`)**, bukan mosquitto homelab. Agent tarik layout dari `GET /api/agent/layout` (404 kalau belum diatur di web — Agent skip publish sampai user atur), lalu republish sebagai retained message ke broker lokalnya sendiri.

**Koreksi topic status — ditemukan review Fable:** `MqttReporter` bawaan `packages/printer-monitor-core` DEFAULT publish ke topic `3dpb/printers-v2`, BUKAN `3dpb/printers`. Kontrak CYD (yang firmware-nya baca) itu `3dpb/printers` — jadi `apps/agent` WAJIB override `statusTopic` secara eksplisit saat instansiasi reporter, jangan andalkan default.

**Operasional broker lokal — belum dibahas sebelumnya, ditemukan review Fable:**
- **Port konflik/single-instance:** kalau customer kebetulan sudah punya broker MQTT lain di port 1883, atau user gak sengaja buka Agent 2x — perlu deteksi & pesan jelas (bukan gagal diam-diam), plus lock single-instance di level app Electron (`app.requestSingleInstanceLock()`).
- **Windows Firewall:** pertama kali Agent listen di port broker, Windows biasanya munculin prompt izin — kalau user klik "Block", CYD gak akan pernah bisa connect. Perlu guidance UX (deteksi gagal-listen → jelasin ke user buat cek Firewall).
- **Tanpa auth** (keputusan sadar, bukan lupa): broker lokal ini gak pakai autentikasi — siapa pun di LAN yang sama bisa baca status atau publish layout palsu ke CYD. Diterima buat MVP (ancaman minim, LAN rumah/kantor kecil), dicatat di sini biar bukan oversight.
- **IP Agent bisa berubah (DHCP):** IP yang diketik user ke captive portal CYD saat provisioning bisa berubah kalau router assign ulang. Dashboard Agent tampilkan **IP saat ini** dengan jelas + saran ke user buat setting DHCP reservation di router-nya kalau mau permanen.

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
