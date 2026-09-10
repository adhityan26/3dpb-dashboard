# Headless Linux Daemon — Sub-project 2a (daemon core) Design

Status: draft v1 (setelah review Fable 5.1 putaran 4), menunggu review user
Tanggal: 2026-09-10
Scope: `apps/agent-headless` (proses Node.js murni, TANPA Electron/Chromium) — daemon inti: REST API di atas `AgentRuntime`/`AgentService` yang sudah ada, systemd unit, install script. **Web wizard (React) dan WebSocket push adalah sub-project 2b, TIDAK termasuk di sini** — 2a berhenti di REST API yang bisa dites dengan `curl` saja.

## Latar belakang

Sub-project 1 (spec `2026-09-08-agent-core-extraction-design.md`, Plan A+B, selesai & merged) membangun `AgentRuntime`+`AgentService` di `packages/agent-core` — transport-agnostic, sudah dipakai `apps/agent` (Electron) lewat IPC. Sub-project 2a adalah **konsumen pertama di luar Electron**: daemon headless untuk Raspberry Pi/Linux server, memasang HTTP di atas `AgentService` yang sama, tanpa duplikasi logic.

Review Fable 5.1 putaran 4 (2026-09-10) terhadap draft desain pertama menemukan satu masalah keamanan kritis (lihat Global Constraints) dan beberapa prasyarat di `packages/agent-core` yang harus selesai SEBELUM daemon bisa dibangun — spec ini mendokumentasikan keduanya sebagai bagian mengikat dari sub-project 2a, bukan catatan terpisah.

## Global Constraints

- **`brokerPin` (PIN 4 digit MQTT) TIDAK PERNAH dipakai sebagai token HTTP.** Daemon punya `apiToken` terpisah (32 byte random, hex-encoded). Alasan: PIN sengaja pendek (keyspace 10.000) untuk diketik di layar CYD, dan `PinRateLimiter`-nya bypass total alamat loopback (aman untuk MQTT reporter lokal, TIDAK aman untuk HTTP — reverse proxy/tunnel bikin semua request tampak loopback).
- **`uploadFile`/`downloadFile` di `AgentService` TIDAK diekspos langsung lewat HTTP dengan `localPath` mentah** — itu path di filesystem proses agent, bisa disalahgunakan jadi arbitrary file read/write. Daemon jadi perantara: multipart upload/streaming download ke/dari `os.tmpdir()`, lalu panggil `AgentService` dengan path temp itu, lalu hapus.
- **Refactor murni di `packages/agent-core`** untuk 4 prasyarat di bawah (Task-task Global Constraints §Prasyarat) — perilaku Electron yang ada harus tetap identik.
- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- **Sesi paralel = WAJIB worktree terpisah** (aturan repo `CLAUDE.md`) — `master` cuma integrasi.
- **Jangan `git add -A`/`git add .`** — selalu path spesifik.

## Prasyarat di `packages/agent-core` (bagian dari sub-project 2a, dikerjakan sebelum daemon)

Empat perbaikan kecil, murni refactor/hardening, tidak mengubah perilaku Electron:

1. **`AgentRuntimeDeps.updatePlatform` menerima `"linux"`** (sekarang `"win" | "mac"`). `saas-client.ts`'s `fetchLatestVersion` sudah menerima `"linux"` di parameternya — cuma tipe deps yang ketinggalan.
2. **`FileAesCredentialStore.save()` jadi atomic**: tulis ke file temp di direktori yang sama, lalu `rename()` (bukan `writeFileSync` langsung ke file final). Alasan: di SD card Raspberry Pi, mati listrik saat menulis adalah mode kegagalan yang realistis — file terpotong sekarang berarti `degraded` permanen tanpa jalur pemulihan selain hapus manual.
3. **`ensureApiToken(store, logger): Promise<string>`** baru di `credential-store.ts`, pola identik `ensureBrokerPin` (generate kalau belum ada, degraded → token session-only + log error, simpan ke `CredentialBlob.apiToken?: string` field baru). `clearApiToken(blob)` juga, pola `clearBrokerPin`.
4. **Guard `sync()` non-re-entrant** (sudah dicatat sebagai prasyarat eksplisit sub-project 2 di spec sub-project 1) — coalesce in-flight promise di `AgentService.sync()`. Daemon (concurrent HTTP requests) membuat race ini realistis, bukan cuma teoretis seperti di Electron IPC.

Keempat ini masing-masing task kecil dengan test sendiri di `packages/agent-core` — lihat implementation plan.

**TIDAK termasuk prasyarat 2a** (di-defer ke saat dibutuhkan / sub-project lain): varian stream `uploadFile`/`downloadFile` di core (2a sendiri yang membuat lapisan temp-file di level daemon, bukan mengubah signature core — lihat §File Operations di bawah), entry `linux` di endpoint SaaS `/api/agent/version` (dicatat di Out of scope, harus selesai sebelum daemon deploy ke user beneran tapi bukan pekerjaan repo ini).

## Arsitektur

`apps/agent-headless` — package baru, pure Node (tidak ada React/Electron/Vite renderer). Struktur:

```
apps/agent-headless/
  src/
    index.ts              -- entry point: parse config, bootstrap, wire signal handlers
    http-server.ts         -- Fastify instance, route registration, auth hook
    auth.ts                -- Bearer token middleware pakai ensureApiToken + PinRateLimiter (instance sendiri, trustLoopback: false)
    file-transfer.ts       -- lapisan temp-file untuk upload/download (lihat §File Operations)
    platform-node.ts       -- NodePathProvider, NodeLogAdapter, NodeLogFileProvider, getNodeBuildInfo()
    routes/
      agent-routes.ts       -- satu route per method AgentService (kecuali file up/download, lihat file-transfer.ts)
      health-routes.ts       -- GET /healthz
  scripts/
    build-info.mjs          -- generate build-info.json saat build (version dari package.json, commitHash dari git rev-parse)
    build.mjs                -- esbuild bundle jadi satu file (agent-core diekspor sebagai .ts mentah, Node tak bisa jalankan langsung tanpa bundling)
  install/
    slizebiz-agent.service   -- systemd unit template
    install.sh                -- curl|bash installer
  package.json
  tsconfig.json
```

### Bootstrap (`index.ts`)

Urutan **kebalikan dari Electron** (rekomendasi Fable): HTTP server nyala DULU, baru `runtime.start()` — supaya wizard/CLI tetap bisa diagnosa daemon selama bootstrap panjang (broker listen timeout 10s, fetch SaaS, connector printer).

```
1. Resolve config lewat loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
2. Bangun NodePathProvider, NodeLogAdapter, NodeLogFileProvider, getNodeBuildInfo()
3. Bangun FileAesCredentialStore(pathProvider.userDataDir())
4. Bangun AgentRuntime dengan semua deps di atas + updatePlatform: "linux"
5. Bangun AgentService(runtime)
6. Start HTTP server (Fastify) -- daftarkan semua route, termasuk /healthz
7. Bind port -- KALAU GAGAL BIND: log fatal, process.exit(1) (bukan retry di dalam proses -- serahkan ke systemd Restart=on-failure)
8. await runtime.start() -- TIDAK PERNAH throw (invariant sudah ada), tapi HTTP sudah reachable dari langkah 6
9. Pasang signal handler: SIGTERM -> tutup HTTP listener -> tutup WS (kalau ada, 2b) -> await runtime.stop() -> process.exit(0)
10. Pasang process.on('unhandledRejection'/'uncaughtException') -> log fatal -> process.exit(1) (peran log.errorHandler.startCatching() Electron)
```

**`stop()` menghormati guard `sync()` in-flight** (prasyarat #4 di atas) — `SIGTERM` saat `sync()` sedang jalan tidak boleh membuat `teardownEngine()` jalan duluan lalu `sync()` melahirkan engine baru setelah teardown (persis kelas bug reporter-leak yang memotivasi Plan B). `stop()` menunggu in-flight `sync()` selesai (atau menolak `sync()` baru begitu shutdown dimulai) sebelum lanjut teardown sendiri.

### Autentikasi (`auth.ts`)

- Fastify `onRequest` hook: baca header `Authorization: Bearer <token>`, bandingkan dengan `apiToken` dari `ensureApiToken()` (constant-time compare, `crypto.timingSafeEqual`).
- Rate limit: instance `PinRateLimiter` SENDIRI (bukan reuse punya broker), dipanggil dengan `trustLoopback: false` secara eksplisit — semua alamat kena limit, termasuk loopback (CLI thin client lewat loopback tapi tetap harus punya token benar, sengaja tidak diistimewakan).
- `GET /healthz` **TIDAK butuh auth** (systemd/monitoring butuh cek tanpa token) — return `{httpOk: true, brokerPort, engineRunning, credentialStoreDegraded}`, tanpa data sensitif.
- Bootstrap token pertama kali: install script mencetak token sekali ke stdout setelah instalasi, DAN menulis token ke file `/var/lib/slizebiz-agent/api-token` dengan permission `0640`, owner `root:slizebiz-agent` — CLI (sub-project 5) baca file ini (butuh sudo atau keanggotaan grup `slizebiz-agent`), bukan lewat loopback tanpa auth.

### Routing (`routes/agent-routes.ts`)

Satu route per method `AgentService`, mengikuti pola `ipc.ts` tapi dengan validasi schema di boundary (Fastify JSON schema — ini logic baru yang sah di layer transport, BUKAN pelanggaran "thin shell", karena Electron IPC punya batas kepercayaan berbeda dari HTTP publik-LAN):

| Method `AgentService` | Route | Catatan |
|---|---|---|
| `activate(token)` | `POST /api/activate` | body `{token}`, schema validasi string |
| `scanLan()` | `POST /api/scan-lan` | timeout klien HTTP/proxy HARUS >20s (scanBambu blocking 20s) |
| `pairDevice(shortCode, secret)` | `POST /api/devices/:shortCode/pair` | body = `DeviceSecret` shape, validasi schema |
| `forgetDevice(shortCode)` | `DELETE /api/devices/:shortCode` | return 204 |
| `updateDeviceModel(shortCode, model)` | `PATCH /api/devices/:shortCode/model` | |
| `sync()` | `POST /api/sync` | |
| `getActivationState()` | `GET /api/activation-state` | |
| `getSnapshot()` | `GET /api/snapshot` | (2b nanti push ini lewat WS juga, 2a cukup polling) |
| `getBrokerInfo()` | `GET /api/broker-info` | |
| `sendPrinterCommand(deviceId, cmd)` | `POST /api/printers/:deviceId/command` | body = `PrinterCommand` shape |
| `getCredentialStoreStatus()` | `GET /api/credential-store-status` | |
| `getUpdateStatus()` | `GET /api/update-status` | |
| `sendLogs()` | `POST /api/send-logs` | lihat §Logging soal `LogFileProvider` |
| `listFiles(shortCode, path)` | `GET /api/devices/:shortCode/files?path=...` | |
| `deleteFile(shortCode, remotePath)` | `DELETE /api/devices/:shortCode/files` | body/query `{remotePath}` |
| `renameFile(shortCode, oldPath, newPath)` | `POST /api/devices/:shortCode/files/rename` | |
| `parseThreemfForDevice(shortCode, remotePath)` | `GET /api/devices/:shortCode/files/parse-3mf` | |
| `getFileThumbnail(shortCode, remotePath)` | `GET /api/devices/:shortCode/files/thumbnail` | serve langsung sebagai `image/png` (decode base64 dari `data:` URL), bukan JSON |

**Tidak ada route untuk**: `agent:pick-download-folder`/`agent:open-download-page` (tetap Electron-only, sesuai spec sub-project 1).

**Mapping throw-vs-return ke HTTP status**:
- Method yang **throw** (`listFiles`/`deleteFile`/`renameFile`/`parseThreemfForDevice`/`getFileThumbnail`, plus `uploadFile`/`downloadFile` lewat `file-transfer.ts`): `Error("device_not_found")` → 404; error FTPS mentah (printer tak terhubung, dsb) → **502** (upstream = printer, bukan 500 daemon); error lain tak terduga → 500 generik, pesan mentah TIDAK dikirim ke klien (log server-side saja).
- Method yang **return discriminated union**: selalu 200, union di body — klien (wizard/CLI) branch di body seperti renderer Electron sekarang.
- `pairDevice`/`forgetDevice` (return `void`): 204.

### File Operations (`file-transfer.ts`)

`uploadFile(shortCode, localPath, remotePath)` dan `downloadFile(shortCode, remotePath, localPath)` di `AgentService` TIDAK diekspos langsung. Daemon jadi perantara:

- **Upload**: `POST /api/devices/:shortCode/files/upload` multipart — Fastify tulis body ke file temp di `os.tmpdir()` (nama acak, `randomUUID()` — pola sama seperti `parseThreemfForDevice` yang sudah ada di core), panggil `service.uploadFile(shortCode, tempPath, remotePath)`, hapus temp file di `finally`.
- **Download**: `GET /api/devices/:shortCode/files/download?remotePath=...` — panggil `service.downloadFile(shortCode, remotePath, tempPath)` ke temp file, stream isi temp file sebagai response body, hapus di `finally`.

Ini TIDAK mengubah signature `AgentService.uploadFile`/`downloadFile` di core — core tetap sama persis seperti dipakai Electron. Daemon cuma menambah satu lapisan temp-file di levelnya sendiri, pola yang sudah dipakai `parseThreemfForDevice`/`getFileThumbnail`.

### Konfigurasi & Path

- `PathProvider.userDataDir()` → `/var/lib/slizebiz-agent` (systemd `StateDirectory=slizebiz-agent` otomatis membuat dan memiliki direktori ini untuk service user — cocok dengan `mkdirSync(recursive:true)` yang sudah ada di core).
- `FileAesCredentialStore` dibangun dengan `dataDir` string yang SAMA dengan `pathProvider.userDataDir()` (dua argumen terpisah di constructor sekarang — daemon harus teruskan nilai yang sama persis ke keduanya, catat ini eksplisit di kode supaya tidak drift).
- `brokerPort` **dikonfigurasi** (bukan hardcode 1883) — field baru `AgentConfig.brokerPort?: number`, default 1883, karena Pi maker sering sudah menjalankan mosquitto di 1883 (`EADDRINUSE` bikin daemon jalan tanpa broker/engine, `/healthz` harus mengekspos status ini supaya kelihatan, bukan diam-diam).
- HTTP port: **8080 (bukan 8443)** — plain HTTP, bukan HTTPS (nama port 8443 menyesatkan konvensi TLS). Ancaman "sniffable di LAN" diterima sebagai model ancaman v1 (LAN rumah/workshop tepercaya, sama seperti asumsi MQTT broker sekarang) — didokumentasikan eksplisit di README instalasi, bukan diam-diam. TLS self-signed jadi kandidat perbaikan sub-project 2b/lanjutan kalau dibutuhkan, bukan bagian 2a.

### Logging

Pilihan: **journald-only** (bukan file rolling). `NodeLogAdapter implements Logger` menulis ke `console.log`/`console.error` (systemd otomatis menangkap stdout/stderr proses ke journal). `NodeLogFileProvider.getLogFilePath()` return `null` — **`sendLogs()`'s existing `read_failed` reason dipakai apa adanya untuk kasus ini** (bukan menambah reason baru — itu perubahan kontrak `AgentService` yang di luar scope 2a; endpoint `/api/send-logs` di 2a boleh selalu balikin `{ok:false, reason:"read_failed"}` sampai sub-project lanjutan menambah dukungan `journalctl` kalau benar-benar dibutuhkan).
- Konsekuensi: `console.error` yang dipanggil kode LAIN yang tidak lewat `Logger` (mis. `Engine`/`Reporter` di `packages/printer-monitor-core`) otomatis ikut ke journal juga (systemd menangkap `stdout`/`stderr` proses secara keseluruhan, bukan cuma yang lewat `Logger`) — TIDAK perlu trik `Object.assign(console, log.functions)` seperti Electron, karena daemon tidak punya renderer process terpisah yang perlu di-patch.

### `BuildInfo`

`scripts/build-info.mjs` generate `build-info.json` (`{version, commitHash}`) saat build time (dari `package.json` + `git rev-parse HEAD`), dibundel ke output. `getNodeBuildInfo()` baca file ini saat startup. Kalau file tidak ada (dev run tanpa build step): fallback `{version:"0.0.0", commitHash:"nogit"}` (sama seperti fallback Electron).

### Bundling

`packages/agent-core` diekspor sebagai `.ts` mentah (`exports: {".":"./src/index.ts"}`) — cocok untuk konsumen yang dibundle Vite (Electron) tapi Node tidak bisa `require`/`import` langsung tanpa transpile, dan `AgentService`'s parameter-properties constructor (`constructor(private readonly runtime: AgentRuntime)`) tidak didukung Node 22's `--experimental-strip-types`. **Daemon wajib dibundle** — `scripts/build.mjs` pakai `esbuild` (bukan Vite, tidak butuh browser target apa pun), platform `node`, target Node 22, bundle jadi satu file `dist/index.mjs` plus `build-info.json` disalin ke sebelahnya. Semua dependency runtime (`aedes`, `mqtt`, `basic-ftp`, `jszip`, `fast-xml-parser`, `bonjour-service`, `fastify`) pure JS — satu bundle tanpa `node_modules` di target Pi feasible (verifikasi ini saat implementasi, bukan asumsi buta).

### systemd unit (`install/slizebiz-agent.service`)

```ini
[Unit]
Description=Slizebiz Agent (headless daemon)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=slizebiz-agent
StateDirectory=slizebiz-agent
WorkingDirectory=/opt/slizebiz-agent/current
ExecStart=/usr/bin/node /opt/slizebiz-agent/current/dist/index.mjs
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=5
TimeoutStopSec=20
PrivateTmp=yes
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/slizebiz-agent
Environment=SAAS_BASE_URL=

[Install]
WantedBy=multi-user.target
```

Catatan: **tidak pakai `DynamicUser=yes`** — key file 0600 credential store harus stabil kepemilikannya antar restart, `DynamicUser` mengganti UID tiap start. `Type=simple` (bukan `notify`) — Node tidak punya socket unix-datagram bawaan untuk `sd_notify`; `/healthz` dipakai sebagai pengganti readiness check eksternal (mis. install script polling `/healthz` sebelum bilang "instalasi selesai"), bukan systemd readiness protocol. Bisa ditambah `Type=notify` + `execFile("systemd-notify", [...])` di iterasi lanjutan kalau dibutuhkan — tidak di 2a.

### Install script (`install/install.sh`)

Alur: deteksi arch (tolak selain `arm64`/`aarch64` — Out of scope target lain, sesuai keputusan sub-project 1), download tarball rilis daemon (dari R2, mengikuti pola `apps/agent`'s `build-installer.mjs`/R2 hosting yang sudah ada) ke `/opt/slizebiz-agent/releases/<version>/`, symlink `/opt/slizebiz-agent/current` → release itu, buat user sistem `slizebiz-agent` (`useradd --system --no-create-home`), install unit systemd, `systemctl daemon-reload && systemctl enable --now slizebiz-agent`, poll `/healthz` sampai sehat (timeout wajar, mis. 30 detik), generate `apiToken` lewat perintah `node dist/index.mjs --print-token` (mode CLI singkat: bangun `credentialStore`+`logger` saja, panggil `ensureApiToken`, cetak, exit — TIDAK start HTTP server atau `AgentRuntime.start()`, supaya idempoten dan aman dipanggil berkali-kali termasuk saat re-run install script untuk update), cetak token + URL (`http://<ip-lan>:8080`) ke stdout, tulis token ke `/var/lib/slizebiz-agent/api-token` (0640, `root:slizebiz-agent`).

**Update mekanisme**: TIDAK ada self-update dari dalam proses (service user tidak boleh menulis ke `/opt`). Update = re-run install script (`curl ... | sudo bash` lagi, atau `slizebiz-agent update` alias tipis di atasnya) yang menambah release baru + pindah symlink + `systemctl restart`. `getUpdateStatus()` (sudah ada di `AgentService`, dipakai lewat `/api/update-status`) tetap cuma notifikasi — TIDAK memicu update otomatis.

## Error Handling

Semua perilaku `AgentService`/`AgentRuntime` yang sudah ada (dan sudah diuji lewat `apps/agent`) dipertahankan identik — daemon tidak mengubah logic apa pun di core selain 4 prasyarat kecil di atas. Layer HTTP menambah: mapping status code (§Routing), validasi schema per-request (menolak body salah bentuk sebelum sampai ke `AgentService`), dan generic 500 handler yang tidak membocorkan stack trace/pesan internal ke klien.

## Testing

- **Prasyarat core** (4 item di atas): masing-masing task TDD kecil di `packages/agent-core`, mengikuti pola test yang sudah mapan di package itu (lihat plan implementasi).
- **Daemon routes**: pola yang sama seperti `apps/agent/src/main/ipc.test.ts` (sudah terbukti dari sub-project 1) — `AgentRuntime` beneran + `InMemoryCredentialStore` (sudah ada di core) sebagai fixture, mock hanya boundary I/O sungguhan (`fetch`, `BambuFtpsClient`, `node:fs/promises`, dsb), request HTTP beneran ke server Fastify pakai `app.inject()` (built-in Fastify testing, tanpa perlu buka port TCP asli).
- **Auth**: test terpisah untuk `PinRateLimiter` instance daemon (trustLoopback:false — beda dari instance broker), constant-time compare, 401 tanpa/token salah, `/healthz` tidak butuh auth.
- **`/healthz`**: test eksplisit untuk tiap kombinasi state (broker gagal start, credential store degraded, dst) — ini satu-satunya endpoint yang dites tanpa auth header.
- Build/bundling dan systemd unit **tidak bisa otomatis dites dari sesi agent** — verifikasi manual wajib sebelum dianggap selesai produksi (sama pola dengan E2E manual sub-project 1): deploy ke Raspberry Pi arm64 fisik, jalankan `install.sh`, cek daemon start, `curl /healthz`, `curl` satu endpoint yang butuh auth dengan token dari file, restart paksa (`systemctl restart`) dan cek credential/broker-pin tidak hilang.

## Out of scope (sub-project 2a)

- Web wizard (React), WebSocket push, hosting statis — sub-project 2b.
- Kiosk display, CLI SSH+TUI — sub-project 3 dan 5, dibangun DI ATAS API yang dihasilkan 2a ini, bukan bagian 2a.
- Entry `linux` di endpoint SaaS `/api/agent/version` (`apps/saas/app/api/agent/version/route.ts`) — WAJIB selesai sebelum daemon dipakai user beneran (tanpa ini, `fetchLatestVersion` selalu dapat `invalid_platform`/`network_error` tiap 6 jam), tapi ini perubahan di `apps/saas`, di luar scope repo/plan sub-project 2a — dicatat sebagai prasyarat deployment, bukan prasyarat implementasi.
- TLS/HTTPS untuk HTTP API — plain HTTP diterima untuk v1, didokumentasikan sebagai model ancaman LAN-tepercaya.
- `sd_notify`/`Type=notify` systemd readiness protocol — `/healthz` polling dipakai sebagai gantinya di v1.
- Rotasi `apiToken` lewat endpoint (perintah `rotate-api-token` di 2a cukup lewat CLI file-based/restart daemon; endpoint HTTP untuk self-rotate bisa ditambah nanti kalau dibutuhkan).
- Log rotation/journald materialization untuk `sendLogs()` yang lebih canggih dari `read_failed` polos — dicatat sebagai perbaikan lanjutan, bukan blocker 2a.
- Perubahan perilaku APA PUN di Electron desktop (`apps/agent`) yang ada — 4 prasyarat core adalah refactor murni, tidak mengubah hasil observable Electron.

## Referensi

- Review Fable 5.1 (2026-09-10, putaran 4): temuan kritis `brokerPin`-sebagai-HTTP-token, `uploadFile`/`downloadFile` localPath tak transport-agnostic, prasyarat `updatePlatform`/atomic-save/`ensureApiToken`/guard-`sync()`, gap bundling (`agent-core` diekspor `.ts` mentah), auth WebSocket (dicatat untuk 2b), rekomendasi split 2a/2b, detail systemd/install-script.
- Sub-project 1 (Plan A+B): `docs/superpowers/specs/2026-09-08-agent-core-extraction-design.md`, `docs/superpowers/plans/2026-09-08-agent-core-extraction-plan-a.md`, `docs/superpowers/plans/2026-09-09-agent-core-extraction-plan-b.md` — semua selesai & merged, `AgentRuntime`/`AgentService`/interface 5-nya adalah fondasi mengikat spec ini.
- Kode sumber referensi: `packages/agent-core/src/{agent-runtime,agent-service,local-broker,pin-rate-limiter,credential-store,credential-store-file-aes,config,interfaces}.ts`, `apps/agent/src/main/{ipc,index,platform-electron}.ts` (pola transport-translation yang di-mirror), `apps/agent/scripts/build-installer.mjs` (pola R2 hosting yang diadaptasi untuk install script daemon).
