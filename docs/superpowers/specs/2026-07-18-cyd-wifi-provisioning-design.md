# Design: CYD internal — WiFi + broker MQTT provisioning tanpa flash (captive portal)

**Tanggal:** 2026-07-18
**Status:** Design disetujui (brainstorm), belum ditulis plan
**Terkait:** `docs/superpowers/specs/2026-07-18-cyd-internal-dynamic-layout-design.md` (spec sibling — sama repo/firmware, dieksekusi terpisah), `docs/superpowers/specs/2026-07-16-printer-monitor-design.md` §13 poin 2 (kontrak keselarasan CYD: provisioning tanpa flash), memory `project_printer_monitoring_cyd`

## 1. Ringkasan & tujuan

WiFi SSID/password & MQTT broker IP saat ini **hardcode compile-time** di `config.h` (`WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_BROKER`, `MQTT_PORT`) — ganti jaringan/broker = edit source + reflash via USB. Tujuan: provisioning **tanpa flash** — AP mode + captive portal, sesuai §13 poin 2 spec printer-monitor yang sudah dikunci sebelumnya.

Non-tujuan sesi ini: OTA firmware update (§13 poin 1, firmware tetap sekali-flash kecuali update versi — terpisah dari provisioning WiFi), Bluetooth/BLE dalam bentuk apa pun (dievaluasi & ditolak untuk provisioning — lihat §3.5; kebutuhan Bluetooth lain yaitu mini-POS payment-QR **sengaja diparkir**, subsistem terpisah dgn taruhan lebih tinggi — lihat memory `project_printer_monitoring_cyd`).

## 2. Kondisi saat ini

`src/wifi_manager.cpp` — `wifiConnect()` panggil `WiFi.begin(WIFI_SSID, WIFI_PASSWORD)` langsung dari `#define` di `config.h`, timeout 30 detik, kalau gagal **lanjut tanpa halt** (layar tetap tampil, WiFi coba lagi implicit via `wifiEnsureConnected()` yang dipanggil tiap kali `clockGetTime()`/`clockGetDate()` dibutuhkan). `MQTT_BROKER`/`MQTT_PORT` juga `#define` tetap, dipakai `api_client.cpp` (`mqtt.setServer(MQTT_BROKER, MQTT_PORT)`).

## 3. Keputusan arsitektur

### 3.1 Library: `WiFiManager` (tzapu)

Standar de-facto ESP32/ESP8266 utk AP-mode captive portal — handle AP mode, DNS spoofing (redirect semua request ke halaman config, trigger "Sign in to network" prompt otomatis di iOS/Android), web form, dan **`WiFiManagerParameter`** utk field custom di luar SSID/password bawaan.

### 3.2 Trigger masuk mode provisioning

Otomatis: boot → coba connect WiFi tersimpan (kalau ada, dari NVS via WiFiManager) → **gagal/timeout 15 detik** → otomatis AP mode `"3DPB-Display-Setup"`. Tanpa aksi fisik. First-boot (belum ada credential tersimpan sama sekali) = kasus khusus dari "gagal connect" yang sama (tak ada SSID tersimpan → langsung AP mode).

### 3.3 Field form captive portal

Selain SSID+password bawaan WiFiManager, tambah **1 custom parameter** via `WiFiManagerParameter`: **IP broker MQTT** (default terisi `192.168.88.113`, bisa diubah). Sesuai §13 poin 2 spec printer-monitor: *"user pilih SSID WiFi, password, dan IP broker MQTT dari HP"*.

### 3.4 Layar CYD saat AP mode

Firmware sendiri tampilkan instruksi di layar (bukan diam menunggu) — teks statis: nama AP (`"3DPB-Display-Setup"`), instruksi singkat ("Connect HP ke WiFi ini, browser akan otomatis buka halaman setup"). Dipicu via WiFiManager callback `setAPCallback()`.

### 3.5 Storage: NVS (`Preferences`), domain terpisah dari LittleFS

WiFiManager simpan SSID/password/custom-param (broker IP) ke NVS bawaan — domain penyimpanan berbeda dari LittleFS (dipakai cache `layout.json`, spec sibling), aman berdampingan tanpa konflik.

### 3.6 Reset — masuk ulang mode provisioning

WiFi lama masih valid tapi user mau ganti jaringan/broker (auto-trigger §3.2 cuma jalan kalau connect GAGAL, bukan kasus ini): **tahan tombol BOOT ~5 detik saat device menyala** → clear credential tersimpan (`WiFiManager::resetSettings()`) → reboot otomatis → masuk AP mode provisioning (§3.2 first-boot path). **Verifikasi implementasi:** pastikan tombol BOOT board ESP32-2432S028R terjangkau tanpa bongkar casing (item pengecekan fisik, bukan risiko desain).

### 3.7 `config.h` — dari compile-time ke runtime

`WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_BROKER`, `MQTT_PORT` (yg dulu `#define`) **dihapus** dari compile-time; dibaca dari NVS hasil provisioning saat boot. `wifi_manager.cpp`/`api_client.cpp` disesuaikan pakai variabel runtime, bukan macro. `MQTT_PORT` **tetap** `#define` (nilai `1883`, tak pernah berubah, tak perlu di-provisioning — hanya broker IP yang bervariasi).

### 3.8 Bluetooth — dievaluasi, ditolak untuk provisioning

Web Bluetooth API browser cuma BLE (bukan Bluetooth Classic), cuma Chrome/Edge (Safari/Firefox tak support — sama limitasi Web Serial utk flashing). AP-mode captive portal (§3.1-3.2) kompatibel **HP apa pun** tanpa app/browser spesifik — manfaat kompatibilitas jauh lebih besar daripada BLE-provisioning (yang cuma menghindari 1 langkah "pindah WiFi HP sementara"). ESP32 WiFi+BT berbagi radio yang sama — device ini butuh WiFi stabil terus-menerus utk MQTT, tak perlu tambah kompleksitas coexistence tanpa manfaat sepadan.

## 4. Testing

- **Manual (tak ada hardware-in-loop otomatis):** hapus credential tersimpan → boot → verifikasi AP mode muncul + instruksi di layar benar; connect HP → isi SSID+password+broker IP salah (typo) → verifikasi gagal & AP mode tetap aktif (retry); isi benar → verifikasi device connect & reboot ke mode normal → verifikasi `applyDefaultLayout()`/`loadLayoutFromCache()` (spec sibling) tetap jalan normal setelah WiFi settle.
- **Reset:** tahan BOOT 5 detik saat device sudah connect normal → verifikasi credential ter-clear + reboot ke AP mode.
- **Regresi:** printer monitor (`3dpb/printers`) & layout MQTT (spec sibling) tetap connect normal pakai broker IP hasil provisioning (bukan lagi hardcode) — verifikasi end-to-end sekali provisioning selesai.

## 5. Risiko & catatan terbuka

- **Tombol BOOT board** — verifikasi aksesibilitas fisik sebelum implementasi (§3.6).
- **WiFi+MQTT reconnect pasca-provisioning** — device reboot setelah provisioning; pastikan `loadLayoutFromCache()`/`applyDefaultLayout()` (spec sibling, dieksekusi independen) tetap jalan mulus di boot berikutnya walau WiFi/broker sekarang runtime bukan compile-time.
- **Sequencing implementasi vs spec sibling** — dua spec independen, sama-sama menyentuh `main.cpp`/`config.h`/boot sequence di repo `3pb-monitoring-display/apps/internal` (setelah migrasi). Rekomendasi: migrasi repo (§3.1 spec sibling) dulu sekali, baru DUA plan ini jalan sequential (bukan paralel) di repo yang sama utk hindari merge conflict pada file yang sama.

## 6. Roadmap lanjutan (di luar spec ini)

Mini-POS / Bluetooth-QR pembayaran — **sengaja diparkir**, subsistem terpisah dgn taruhan lebih tinggi (payment-adjacent, device offline-portable, perlu mode-switch printer-monitor↔mini-POS). Brainstorm fokus tersendiri nanti, jangan digabung ke spec provisioning ini walau sama-sama "Bluetooth" — dua kebutuhan teknis berbeda (lihat memory `project_printer_monitoring_cyd`).
