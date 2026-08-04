# CYD Firmware — Konten Notifikasi (Sub-project B)

## Latar belakang

Sub-project A (backend, `docs/superpowers/specs/2026-08-04-hms-error-message-design.md`) sudah selesai & merged: MQTT topic `3dpb/printers` sekarang punya field baru `error_message` (string manusiawi hasil translate kode HMS Bambu Lab, maks 240 karakter, safety cap bukan target muat-1-baris).

Repo: `~/Documents/Project/3pb-monitoring-display/apps/produk` (firmware ESP32/LVGL 9.x, CYD -- Cheap Yellow Display). File relevan: `src/ui/notif_strip.cpp/h` (render strip header + panel notif), `src/model/notifications.h/cpp` (`Notification`, `deriveNotifications()`), `src/model/status_store.h/cpp` (`PrinterStatus`, parsing JSON).

Sub-project ini murni firmware, 4 perubahan:

1. Notifikasi FINISH yang sudah lama (sudah begitu sebelum CYD tahu, mis. saat boot) tidak perlu bikin notifikasi "perlu perhatian" -- cuma FINISH yang transisi BARU (device sudah dikenal & baru saja pindah ke FINISH) yang notify-worthy. ERROR selalu notify-worthy tanpa syarat.
2. Warna strip header: hijau kalau 0 error, merah kalau ada error. Kalau CAMPURAN (ada error DAN ada selesai), strip tetap merah (error butuh perhatian) tapi ditambah badge hijau kecil menunjukkan jumlah selesai, supaya bagian yang sukses tidak "hilang" di balik warna merah yang menuduh semua.
3. Panel notif menampilkan `error_message` yang manusiawi (bukan raw `error_msg` lama).
4. Baris error di panel notif otomatis tumbuh tinggi (wrap multi-baris) mengikuti panjang pesan, bukan dipotong 1 baris seperti sekarang.

**Konteks kritis -- insiden freeze memori LVGL 2026-08-04:** Pool statis LVGL (`LV_MEM_SIZE=24576`, `platformio.ini`) sempat habis total gara-gara panel notif dibangun tanpa batas, menyebabkan freeze fisik. Sudah diperbaiki dgn (a) budget-check runtime `lv_mem_monitor()` sebelum tiap row panel dibangun (`NOTIF_PANEL_MIN_FREE=5120`, berhenti + tampilkan "+N lainnya" kalau free di bawah itu) dan (b) pause rotasi/swipe halaman grid selagi panel notif kebuka (dua operasi ini sama-sama makan pool besar, tak boleh jalan bareng). Kedua mekanisme itu **generik** (tidak hardcode ke ukuran row tertentu) sehingga otomatis menyesuaikan ke row yang lebih besar (poin 4 di atas) tanpa perlu diubah -- tapi WAJIB diverifikasi ulang secara fisik (`lv_mem_monitor()`, sama teknik yg dipakai nemuin root cause sebelumnya) begitu perubahan ini diimplementasi, sebelum dianggap selesai.

## Perubahan

### 1. Boot-quiet FINISH, ERROR selalu tampil

`src/model/notifications.h` -- tambah struct baru:

```cpp
struct NotificationBaseline {
  char ids[MAX_TRACKED_PRINTERS][24];
  char lastState[MAX_TRACKED_PRINTERS][16];
  uint8_t count = 0;
};
```

(`MAX_TRACKED_PRINTERS` dari `status_store.h`, sudah di-include transitif lewat `notifications.h`.)

`deriveNotifications()` ganti signature jadi `void deriveNotifications(const StatusStore& store, NotificationBaseline& baseline, NotificationSet& out)`. Untuk tiap printer di `store`:

1. Cari entri printer itu di `baseline` by `id` (linear scan). Kalau belum ada DAN `baseline.count < MAX_TRACKED_PRINTERS`, tambah entri baru dgn `lastState[i][0] = '\0'` (belum pernah dilihat).
2. `prevState` = isi `lastState` entri itu SEBELUM diupdate (string kosong kalau baru pertama kali dilihat).
3. `isError` = `state == "ERROR"` (unchanged). `isFinish` = `state == "FINISH"`.
4. `finishIsFreshTransition = isFinish && prevState[0] != '\0' && strcmp(prevState, "FINISH") != 0`.
5. Notifikasi dibuat kalau `isError || finishIsFreshTransition` (BUKAN `isError || isFinish` seperti sekarang).
6. SETELAH langkah di atas (baca prevState duluan, baru timpa), update `lastState` entri itu ke `state` printer saat ini -- ini jalan utk SEMUA state (RUNNING/IDLE/dll), bukan cuma FINISH/ERROR, supaya transisi keluar-masuk FINISH kedeteksi benar di masa depan.

Efek: baris pertama kali sebuah printer terlihat (baik itu betulan boot CYD, ATAU printer baru pertama kali muncul di tengah sesi -- mis. ditambah ke layout), kalau state-nya FINISH tidak dianggap notify-worthy (kita tak tahu kapan sebenarnya selesai). Begitu device sudah py riwayat state (`prevState` non-kosong) dan BENAR-BENAR pindah ke FINISH, baru dianggap notifikasi baru. Reconnect MQTT (bukan reboot device) tidak mereset baseline karena ini murni in-RAM, tidak terikat status koneksi -- baseline hanya hilang saat device benar-benar restart, sesuai maksud "boot-quiet".

`NotificationBaseline` jadi state baru yang dipegang caller (`state_machine.cpp`, mirip `DismissSet` yang sudah ada) -- diinisialisasi default (semua kosong) sekali saat masuk `Running`, hidup selama sesi.

### 2. Warna strip: hijau/merah + badge sukses saat campuran

`src/ui/notif_strip.cpp` -- hitung `errorCount`/`finishCount` dari `visible.items[]` (`n.isError`) di `notifUiUpdate()`.

- `errorCount == 0`: strip hijau (pakai `themeColorForState("FINISH")` dari `theme.h`, `0x3ddc84` -- reuse warna yang sama dgn grid cell FINISH, BUKAN hex baru), teks `"{finishCount} selesai"`.
- `errorCount >= 1`: strip merah (`themeColorForState("ERROR")`, `0xe0574c` -- reuse, GANTI `NOTIF_BG` lama `0xc2372c` yang beda tone dgn cell error), teks `"{errorCount} error"`.
- Tambahan kalau `errorCount >= 1 && finishCount >= 1` (campuran): badge kecil pill hijau (`themeColorForState("FINISH")`) berisi teks `"{finishCount} selesai"`, ditempatkan di slot kanan strip (posisi yang sama dgn `clockLabel`, yang sudah disembunyikan tiap kali strip dlm mode notif -- tak ada konflik layout). Badge dibuat cuma saat kondisi campuran aktif, dihapus (`lv_obj_delete`) begitu tidak lagi campuran (mis. error terakhir di-dismiss). Field baru di `NotifUi`: `lv_obj_t* successBadge = nullptr;` (pola sama seperti `ui.panel`).

Style badge: rounded rect kecil (radius = setengah tinggi, mis. tinggi 14px radius 7) + label kecil `lv_font_montserrat_10` di dalamnya, mengikuti pola badge nomor yang sudah ada di `cell_arc.cpp` (`BADGE_W`/style serupa) tapi berbentuk pill (lebar mengikuti teks) bukan lingkaran tetap.

### 3. Konsumsi `error_message`

`src/model/status_store.h` -- tambah field baru ke `PrinterStatus`:

```cpp
char error_message[241] = "";  // MAX_ERROR_MESSAGE_LEN backend (240) + NUL -- lihat
                                 // packages/printer-monitor-core/src/hms.ts (monorepo shopee-analysis)
```

`error_msg[24]` (raw, lama) TETAP ADA tak berubah -- konsumen lain / fallback tak tersentuh.

`src/model/status_store.cpp` (`parsePrintersPayload`) -- tambah baris parse:
```cpp
strlcpy(s.error_message, p["error_message"] | "", sizeof(s.error_message));
```
(pola identik dgn field lain, pakai `|` default ArduinoJson kalau field belum ada di payload -- backward compatible kalau backend lama blm publish field ini.)

`src/model/notifications.h` -- `Notification.detail` grow dari `char[64]` ke `char[241]` (buat nampung `error_message` penuh, bukan cuma preview).

`src/model/notifications.cpp` (`deriveNotifications`) -- ganti baris pengisian detail:
```cpp
strlcpy(n.detail, isError ? s.error_message : "selesai", sizeof(n.detail));
```
(GANTI `s.error_msg` lama jadi `s.error_message` baru -- satu-satunya tempat yang perlu tahu bedanya.)

`buildKey()` (bikin `Notification.key`) TETAP pakai `s.error_msg` lama (raw), BUKAN `error_message` baru -- key cukup unik & stabil dari field lama, tak perlu diubah, dan mengubahnya berisiko mengubah perilaku dismiss-key yang sudah teruji.

### 4. Panel: baris error auto-wrap multi-baris

`src/ui/notif_strip.cpp` (`buildPanelRow()`) -- baris `row` yang sekarang fixed `lv_obj_set_size(row, LV_PCT(100), 32)` diubah kondisional per `n.isError`:

- `!n.isError` (selesai): TIDAK BERUBAH -- tinggi tetap 32, label detail tetap `LV_LABEL_LONG_DOT` (1 baris, "selesai" selalu pendek, tak pernah kepotong).
- `n.isError`: tinggi row `LV_SIZE_CONTENT` (auto, bukan 32 fixed), label detail (yang menampilkan `n.detail`) pakai `LV_LABEL_LONG_WRAP` (bukan `LONG_DOT`) + `lv_obj_set_width()` diset ke lebar kolom yang tersedia (sama seperti field label lain di `cell_arc.cpp` yang sudah pakai pola width+wrap). Detail label untuk error TETAP di kolom yang sama (di bawah nama printer/status, sebelum tombol ✕) -- struktur `row`/`col`/`title`/`detail`/`xBtn`/`xLbl` (6 objek) tidak berubah, cuma sizing mode `row` dan `detail` yang beda utk baris error.

## Testing

`test/test_status_store.cpp` -- test baru: payload dgn `error_message` terisi -> field `PrinterStatus.error_message` terisi benar; payload TANPA `error_message` (backward-compat, simulasi backend lama) -> `error_message` default kosong, `error_msg` lama tetap terisi kalau ada.

`test/test_notifications.cpp` sudah ada, dgn 2 test yang memanggil `deriveNotifications(s, out)` (signature LAMA, 2 argumen) -- keduanya WAJIB diupdate, bukan cuma ditambah test baru di sampingnya:

- `test_derives_error_and_finish_only()`: `makeStore()`-nya bikin Saturn state FINISH langsung dari kosong (baseline belum pernah lihat Saturn) -- dgn signature baru, Saturn di panggilan PERTAMA `deriveNotifications` justru TIDAK akan jadi notifikasi (boot-quiet, sesuai desain), beda dari assert yang ada sekarang (`out.count == 2`, mengharapkan Saturn ikut). Perbaikan: tambahkan 1 pemanggilan `deriveNotifications` LEBIH DULU dgn Saturn berstatus RUNNING (baseline ke-seed "sudah dikenal, belum finish"), BARU panggil lagi dgn `makeStore()` asli (Saturn FINISH) dan assert di hasil panggilan KEDUA itu -- baseline yang sama (`NotificationBaseline`, bukan instance baru) dipakai di kedua panggilan.
- `test_dismiss_hides_until_state_changes()`: sama, `all` dari `deriveNotifications(s, all)` mengasumsikan Saturn (FINISH) ikut hadir supaya `visible.count == 1` (Saturn) setelah Mars di-dismiss tetap valid -- kalau Saturn ke-suppress karena boot-quiet, assert ini gagal padahal test ini sebenarnya menguji dismiss/prune, bukan boot-suppression. Perbaikan sama: seed baseline dgn 1 panggilan awal (Saturn RUNNING) sebelum pemanggilan yang datanya dipakai assert.

Test BARU (baseline/boot-quiet-nya sendiri, tambahkan di file yang sama):

(a) Printer FINISH di payload PERTAMA kali terlihat (baseline baru/kosong) -> `deriveNotifications` TIDAK menghasilkan notifikasi utk printer itu.
(b) Printer yang sudah dikenal via 1 panggilan sebelumnya berstatus RUNNING, lalu panggilan berikutnya (baseline SAMA, dilanjutkan) berstatus FINISH -> notifikasi MUNCUL.
(c) Printer ERROR di payload PERTAMA kali terlihat (baseline kosong) -> notifikasi MUNCUL (unconditional, tak kena aturan boot-quiet).
(d) Printer FINISH->RUNNING->FINISH lewat 3 panggilan berurutan dgn baseline yang sama (transisi asli dua kali) -> notifikasi muncul lagi di panggilan KETIGA (baseline ter-update benar tiap panggilan, bukan cuma dicatat sekali di awal).

Verifikasi fisik WAJIB (bukan opsional) sebelum sub-project ini dianggap selesai:
1. Flash + `pio device monitor` -- reproduksi kasus lama (freeze pas buka panel notif / pas pindah halaman) TIDAK terjadi lagi dengan baris error yang lebih besar.
2. `lv_mem_monitor()` sebelum/sesudah `openPanel()` dgn error_message SUNGGUHAN panjang (>120 karakter, ambil dari `hms-codes.json` yang p95=211) -- catat `free_size` aktual, bandingkan dgn `NOTIF_PANEL_MIN_FREE=5120` yang ada, pastikan margin masih wajar (bukan cuma lolos tipis).
3. Verifikasi visual: badge hijau muncul HANYA saat campuran, hilang saat tidak lagi campuran (dismiss error terakhir, atau semua error selesai/dismiss).

## Di luar scope

- Menaikkan `NOTIF_PANEL_MIN_FREE` atau menambah threshold TERPISAH khusus baris error (lebih besar dari yang dipakai baris selesai) -- ditunda sampai ada data fisik dari Testing poin 2 di atas. Kalau margin ternyata mepet, ini jadi task susulan, BUKAN diputuskan spekulatif di spec ini.
- Redesign lanjutan header (mis. ikon per-status, animasi) -- di luar 4 poin yang diminta.
