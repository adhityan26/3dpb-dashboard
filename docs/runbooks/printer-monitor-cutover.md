# Runbook: Cutover printer monitoring n8n → printer-monitor

SEMUA langkah eksekusi produksi GATED persetujuan user. Jangan jalankan tanpa perintah.

## 0. Prasyarat
- `cp services/printer-monitor/config.example.json services/printer-monitor/config.json`
- Isi `ip` + `accessCode` per printer Bambu (Bambu Handy → Settings → LAN Only Mode; ip dari router).
  VERIFIKASI serial Mercury: keepalive n8n `03090A481400312` vs spec lama `0309DA4B1400312`.
- Urutan `devices` di config = urutan payload n8n (paritas tampilan CYD).

## 1. Jalan paralel (aman — topic beda: 3dpb/printers-v2)
- Lokal: `CONFIG_PATH=./config.json pnpm --filter @3pb/printer-monitor start`
- Pantau: `pnpm --filter @3pb/printer-monitor status`
- Device yang belum diisi ip/accessCode akan SKIP dgn warning — isi bertahap sambil test.

## 2. Verifikasi paritas
- `pnpm --filter @3pb/printer-monitor parity` → harus `✅ PARITAS OK`
  (state OFFLINE di-skip karena beda timing; last_seen/progress memang beda wajar)
- Biarkan >15 menit: pastikan tidak ada printer online yang jadi OFFLINE
  (bukti pushall keepalive bekerja).
- Subscribe `3dpb/printer-events` selama periode paralel (mis. `mosquitto_sub -h <broker> -t 3dpb/printer-events -v`)
  dan verifikasi event `finished` benar-benar muncul saat satu print selesai.
  Catatan: state-machine port n8n (capture-event.ts) mendeteksi `finished` hanya lewat transisi
  running→idle; transisi Bambu RUNNING→FINISH mungkin tidak memicu event ini. Kalau `finished`
  tidak muncul untuk print yang selesai normal, catat sebagai isu paritas dan putuskan sebelum
  Fase 3 (push-notif) — jangan asumsikan sudah paritas hanya dari langkah ini.

## 3. Deploy container di .113 (gated user)
docker build -f services/printer-monitor/Dockerfile -t printer-monitor:latest .
docker save / transfer sesuai pola deploy dashboard, lalu di host .113:
docker run -d --name printer-monitor --restart unless-stopped \
  -v /path/ke/config-dir:/data printer-monitor:latest
(config.json berisi secrets HANYA di host, jangan commit)

## 4. Cutover (gated user)
1. Edit config produksi: `topics.status` → `3dpb/printers`; restart container.
2. Nonaktifkan workflow n8n (API key di ~/Documents/Project/homelab-n8n/.env):
   for id in 8fEOjLQIcRr2L0CR BAFoxWvahVFczG1O BKnv5gm1WmiB2suF CwvB8ASXcbF4vJtQ \
             WSzpRGkzgndIJ6bp hbcSJX7QG2F99r8c lc6hNYpe5oIsy24r rik0nP0XDWli1Hxy \
             ztVHpVIF0D6aPsMF ksdhKpThxvQPtRPj th9fghY5V3rmqfyo; do
     curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" \
       "$N8N_HOST/api/v1/workflows/$id/deactivate" | head -c 100; echo
   done
   # PDrDhaHe8G3olC2H (Jupiter) & jwJykB3Imez41hsQ (HMS refresh) sudah off.
3. Verifikasi CYD menampilkan status (payload sekarang dari service).
4. Jupiter: pastikan ip+accessCode terisi di config → hidup lagi via service (perbaikan bug beku-sejak-Mei).

## 5. Rollback
- Re-activate workflow n8n: sama seperti atas tapi endpoint `/activate`.
- Kembalikan `topics.status` service ke `3dpb/printers-v2`, restart.
- Retained lama n8n akan menimpa begitu ada message baru.
