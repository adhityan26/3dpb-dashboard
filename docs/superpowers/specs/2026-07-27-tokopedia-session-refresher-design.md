# Tokopedia Session Refresher — Design

## Goal

Sesi Tokopedia Seller Center (cookie `SELLER_TOKEN` dkk, disimpan di `lib/tokopedia/session.ts`) sering expired saat tim sedang mengurus order, dan perbaikannya sekarang murni manual: seseorang harus buka browser, export cookie via extension, lalu paste ke `TokopediaSessionCard` di Settings. Ini merepotkan kalau tidak ada yang di depan laptop. Fitur ini membangun refresh otomatis tanpa perlu kredensial Tokopedia — login Tokopedia dilakukan via tombol "Login with TikTok", yang otomatis berhasil selama sesi TikTok di browser masih aktif (tidak perlu OTP/2FA berulang).

## Non-goals

- Tidak menyimpan username/password Tokopedia — tidak dibutuhkan, login sepenuhnya via delegasi sesi TikTok.
- Tidak mengubah `lib/tokopedia/session.ts`/`client.ts`/endpoint `/api/tokopedia/session` yang sudah ada — service baru ini adalah *consumer* dari endpoint tersebut (baca status via GET, tulis sesi baru via POST/PUT yang sudah ada), bukan pengganti.
- Tidak menjamin 100% unattended selamanya — sesi TikTok di browser profile itu sendiri bisa suatu saat expired juga (kemungkinan jauh lebih jarang dari sesi Tokopedia). Saat itu terjadi, perlu login manual sekali via VNC — fitur ini menyediakan jalur itu, bukan menghilangkannya sepenuhnya.
- Tidak membangun UI baru di dashboard untuk fitur ini — semua interaksi manusia (kalau dibutuhkan) lewat VNC langsung ke service, dan notifikasi lewat WhatsApp.

## Arsitektur

Service standalone baru `services/tokopedia-session-refresher/`, Docker container terpisah dari `shopee-dashboard`, deploy ke homelab (`.113`), mengikuti pola `services/printer-monitor` yang sudah ada di repo ini (Node.js/TS, `pnpm --filter` workspace build, config via env/volume, bukan di-bake ke image).

**Kenapa terpisah, bukan digabung ke `apps/dashboard`:**
- Image dashboard tetap ringan — tidak perlu Playwright+Chromium di image yang sering di-redeploy.
- Siklus hidup independen — redeploy dashboard tidak mengganggu browser profile/VNC yang sedang jalan di service ini.
- VNC butuh browser GUI (Xvfb) nyala terus — lebih rapi dipisah dari proses Next.js.

**Satu-satunya titik integrasi**: service ini memanggil `GET /api/tokopedia/session` (baca `tokenExpiry`) dan endpoint simpan-sesi yang sudah ada (kirim cookie baru) di dashboard — tidak ada perubahan kontrak API di sisi dashboard.

## Komponen

- `services/tokopedia-session-refresher/src/main.ts` — entrypoint, jalankan scheduler loop.
- `src/scheduler.ts` — polling berkala (`CHECK_INTERVAL_HOURS`, default beberapa jam) ke `GET /api/tokopedia/session`; kalau `tokenExpiry` sudah di bawah `REFRESH_THRESHOLD_HOURS` (default 24 jam) dari sekarang, trigger `refresh.ts`. Kalau masih jauh, tidur sampai tick berikutnya.
- `src/refresh.ts` — otomasi Playwright: buka browser dengan persistent context (`--user-data-dir` mengarah ke volume `/data/browser-profile`), navigasi ke halaman login Tokopedia Seller Center, klik tombol "Login with TikTok", tunggu redirect selesai (sesi TikTok di profile menyelesaikan login otomatis tanpa interaksi), ambil cookie hasil login, `POST`/`PUT` ke endpoint simpan-sesi dashboard. Detail selector/flow exact ditemukan saat implementasi (butuh eksplorasi manual live, lihat §Testing).
- `src/notify.ts` — wrapper kirim WhatsApp via wa-omni (`POST` ke endpoint send — bentuk request PERLU diverifikasi saat implementasi, endpoint read yang sudah dikonfirmasi ada di `http://192.168.88.92:3020/api/conversations/${id}`, endpoint send belum dikonfirmasi). Tujuan: nomor WhatsApp pribadi Adhitya (disimpan sebagai env var, bukan hardcode).
- Browser GUI + VNC: Xvfb + x11vnc + noVNC berjalan terus di container (bukan on-demand), expose satu port untuk akses manual — dipakai untuk setup awal (login TikTok pertama kali) dan untuk pemulihan manual kalau sesi TikTok di profile ikut expired.

## Konfigurasi (env)

- `DASHBOARD_URL` — base URL dashboard untuk baca/tulis sesi Tokopedia.
- `WA_OMNI_ENDPOINT`, `WA_OMNI_TOKEN`, `WA_OMNI_TARGET_NUMBER` — untuk notifikasi kegagalan.
- `CHECK_INTERVAL_HOURS` (default: 4) — cukup sering untuk menangkap window `REFRESH_THRESHOLD_HOURS` (24 jam) tanpa membebani; boleh disesuaikan kalau setelah implementasi ternyata `tokenExpiry` Tokopedia berubah lebih cepat/lambat dari perkiraan ini.
- `REFRESH_THRESHOLD_HOURS` (default: 24) — mulai coba refresh kalau sisa waktu token di bawah ini.
- `NOTIFY_COOLDOWN_HOURS` (default: 6) — jangan kirim WA ulang untuk kegagalan yang sama dalam rentang ini.

## Alur Data

```
tick scheduler
  → GET {DASHBOARD_URL}/api/tokopedia/session (baca tokenExpiry)
  → tokenExpiry - now > REFRESH_THRESHOLD_HOURS? → tidur sampai tick berikutnya
  → else → jalankan refresh.ts
      → sukses → POST cookie baru ke dashboard → log sukses → reset status notifikasi
      → gagal → cek cooldown notifikasi
          → belum pernah notify dalam NOTIFY_COOLDOWN_HOURS → notify.ts kirim WA → log
          → sudah pernah → skip notify, log saja → coba lagi tick berikutnya
```

## Penanganan Error

- **Gagal refresh** (selector tidak ketemu, timeout, atau sesi TikTok di profile browser ternyata sudah expired sehingga login TikTok minta re-auth manual): tidak crash proses — catch di level `refresh.ts`, lempar ke scheduler untuk logika notifikasi+cooldown di atas.
- **Dashboard API tidak terjangkau** (network/restart): retry dengan backoff sederhana di tick berikutnya, log saja — bukan kondisi darurat karena biasanya sementara (mis. dashboard sedang di-redeploy).
- **wa-omni sendiri gagal kirim**: log ke container logs — ini jalur notifikasi terakhir, tidak ada fallback lebih jauh dalam scope ini.

## Testing

Otomasi klik "Login with TikTok" di situs Tokopedia asli tidak realistis untuk unit test/CI — bergantung ke situs eksternal yang bisa berubah selector/flow-nya kapan saja tanpa peringatan. Scope testing:
- Unit test logika murni: fungsi keputusan threshold refresh (`scheduler.ts`, given `tokenExpiry` vs `now` vs `REFRESH_THRESHOLD_HOURS` → boolean trigger-atau-tidak), fungsi cooldown notifikasi, pembentuk payload wa-omni.
- Verifikasi end-to-end flow login (exact selector, exact redirect behavior) dilakukan manual saat implementasi via VNC — bukan test otomatis, ini eksplorasi live yang jadi dasar penulisan `refresh.ts`.
- Tidak ada golden/mocked test untuk keseluruhan flow browser — terlalu rapuh terhadap perubahan situs eksternal.

## Deploy

Tambah blok build+run baru (mengikuti pola `stl-service`/rencana `printer-monitor` di `apps/dashboard/deploy.sh`, atau script terpisah `services/tokopedia-session-refresher/deploy.sh`) — target `DOCKER_HOST=tcp://192.168.88.113:2375`, `--network homelab`, volume untuk `/data/browser-profile` (persisten lintas restart container), port VNC di-expose. Keputusan file deploy exact (nambah ke `deploy.sh` existing vs script baru) diambil saat implementasi berdasarkan preferensi menjaga `deploy.sh` tetap fokus ke dashboard atau tidak.

## Global Constraints

- Tidak menyimpan kredensial Tokopedia (username/password) di mana pun — hanya cookie sesi hasil login TikTok, konsisten dengan model keamanan yang sudah ada di `lib/tokopedia/session.ts`.
- Tidak mengubah kontrak `GET/POST /api/tokopedia/session` yang sudah ada di dashboard.
- Mengikuti pola `services/printer-monitor` (struktur folder, Dockerfile, config via env/volume) untuk konsistensi dengan service standalone lain di repo ini.
- Endpoint send wa-omni harus diverifikasi (baca respons/dokumentasi API sesungguhnya) sebelum implementasi `notify.ts` — jangan asumsikan bentuk request tanpa konfirmasi.
