# Agent Core Extraction (`packages/agent-core`) — Sub-project 1 of Linux/Pi Agent Expansion

Status: draft v3 (Plan A **selesai & merged ke master** 2026-09-09; bagian Plan B direvisi setelah review Fable 5.1 putaran 3 terhadap kode aktual post-Plan-A), menunggu review user
Tanggal: 2026-09-08 (revisi Plan B: 2026-09-09)
Scope: `apps/agent` (Slizebiz Agent, Electron) — refactor murni (kecuali satu perubahan workflow `SAAS_BASE_URL` yang didokumentasikan eksplisit), menghasilkan **2 implementation plan** (Plan A: ekstraksi mekanis — selesai, Plan B: `AgentRuntime`+`AgentService` — spec ini)

## Latar belakang

Slizebiz Agent sekarang cuma jalan sebagai Electron desktop app (Win/Mac). User ingin memperluas ke platform baru: Linux desktop (Electron, spec oke) dan Raspberry Pi/Linux server spec pas-pasan (headless, tanpa Electron/Chromium sama sekali). Karena scope-nya besar, dipecah jadi 5 sub-project independen dengan spec→plan→implementasi masing-masing:

1. **Ekstrak core jadi `packages/agent-core`** (spec ini) — refactor murni, fondasi semua sub-project lain
2. Daemon headless + web setup wizard (`apps/agent-headless`)
3. Kiosk status display (halaman read-only buat layar 7", auto-launch kiosk browser)
4. Electron build target Linux desktop (AppImage + .deb)
5. CLI — setup via SSH (thin client) + mode TUI interaktif ala bashtop/btop

**Urutan dependency** (hasil review Fable 5.1 2026-09-08): bukan rantai linier — **1 → (2 ∥ 4) → (3 ∥ 5)**. Sub-project 2 dan 4 independen setelah 1 selesai, bisa paralel. Sub-project 3 dan 5 sama-sama cuma konsumen API lokal dari sub-project 2.

**Keputusan yang sudah difinalkan lewat brainstorming (mengikat buat sub-project ini dan seterusnya):**
- Target Pi: **arm64 saja** (Pi 4/5), bukan armv7 (Node 22 official gak ada build armv7)
- **Satu akun per daemon** (bukan multi-tenant) — `AgentRuntime` singleton per proses cukup
- Kredensial di **semua target Linux** (headless daemon MAUPUN Electron Linux desktop, dua-duanya) pakai **file-AES langsung** (key lokal 0600), bukan coba-libsecret-dulu — cuma Win/Mac Electron yang tetap pakai `safeStorage`
- Web wizard & kiosk headless: **app React baru yang tipis**, pinjam tema `@3pb/ui` (Glass UI) — BUKAN reuse komponen `src/renderer` Electron (kebutuhannya beda: satu buat mouse+layar besar, satu buat browser jarak-jauh+kiosk kecil)
- `SAAS_BASE_URL` jadi **runtime config di semua target** (termasuk Electron, bukan cuma daemon) — dibaca dari file config saat start, bukan di-bake compile-time lewat Vite `define` lagi (menutup kelas kesalahan "lupa set env var pas build" yang pernah kejadian)

## Sub-project ini dipecah jadi 2 plan (revisi setelah review Fable 5.1 kedua)

Review Fable terhadap spec draft pertama menemukan permukaan `AgentRuntime`+`AgentService` (khususnya migrasi `ipc.test.ts` — 791 baris, 53 pemakaian setter `app-state` langsung, dan `broker.test.ts` yang bergantung `__resetRateLimitForTests`) terlalu besar buat dieksekusi bareng pemindahan file dalam satu plan. Sub-project ini sekarang menghasilkan **2 implementation plan berurutan**, ditulis lewat `writing-plans` sebagai 2 dokumen terpisah:

- **Plan A — Ekstraksi mekanis**: pindah file ke `packages/agent-core`, pasang 4 interface (+ 1 yang baru ketemu, lihat di bawah), migrasi `SAAS_BASE_URL`+build-info ke runtime config. Fungsi **tetap module-level** (BUKAN di-classify ke `AgentRuntime` dulu) — `apps/agent` import fungsi-fungsi itu dari `@3pb/agent-core` alih-alih dari `./main/*` lokal, perilaku 100% sama. Ini sudah cukup buat sub-project 4 (Electron Linux desktop) mulai duluan secara paralel.
- **Plan B — `AgentRuntime` + `AgentService`**: baru di sini state module-level (`app-state.ts`, state internal `broker.ts`) di-classify jadi `AgentRuntime`, `ipc.ts` di-refactor jadi wrapper tipis di atas `AgentService`, dan migrasi besar test (`ipc.test.ts`, `broker.test.ts`) dikerjakan. Sub-project 2 (daemon headless) baru bisa mulai setelah Plan B selesai — Plan A saja tidak cukup buat daemon karena daemon butuh kontrak `AgentService` yang transport-agnostic.

Kedua plan tetap **refactor murni** — app Electron desktop yang ada harus tetap identik perilakunya di akhir Plan A maupun Plan B, kecuali satu perubahan workflow eksplisit yang didokumentasikan di bagian `SAAS_BASE_URL` di bawah.

### File yang dipindah (Plan A — status: SELESAI)

Dari `apps/agent/src/main/` ke `packages/agent-core/src/`:
`engine-manager.ts`, `discovery/bambu-ssdp.ts`, `discovery/moonraker-mdns.ts`, `file-manager/*` (types.ts, bambu-ftps-client.ts, threemf-parser.ts), `printer-model.ts`, `hms-table.ts` (lihat catatan import JSON di bawah), `layout-publisher.ts`, `device-cache.ts`, `saas-client.ts`, `startup.ts` (reconcileDevices), `credential-store.ts` (dirombak — lihat di bawah), **`app-state.ts`** (khusus `pickLocalIpCandidates`/`getLocalIp`, pure `node:os`, dipakai `ipc.ts:160` dan `index.ts:55` — sebelumnya kelewat di draft pertama; bagian `app-state.ts` yang menyimpan `engine`/`reporters` singleton BUKAN dipindah di Plan A, itu bagian Plan B).

**Koreksi penting (ditemukan review Fable putaran 3, 2026-09-09): `broker.ts` TIDAK ikut pindah di Plan A**, walau draft spec ini tadinya mencantumkannya. Realitanya `apps/agent/src/main/broker.ts` masih ada persis di tempat asal, masih `import log from "electron-log/main"` langsung (bukan `Logger` yang di-inject), dan dependency `aedes` belum ada di `packages/agent-core/package.json`. Ini sekarang jadi bagian **Plan B**, bukan sudah selesai — lihat bagian "Plan B: ekstraksi `broker.ts`" di bawah.

**Logic yang sekarang "terkubur" di dalam `ipc.ts` dan harus diekstrak jadi fungsi bernama di core, bukan ketemu belakangan:**
- `findPlateThumbnail` (`ipc.ts:291-302`) dan `extractGcodeThumbnail` (`ipc.ts:312-321`) — pindah ke `file-manager/thumbnail.ts` baru
- Pola download-ke-temp buat parse-3mf/thumbnail (`ipc.ts:270-356`) — pindah jadi fungsi di `file-manager/`
- Upload log ke `/api/agent/logs` (`ipc.ts:213-221`) — pindah jadi `uploadLogs()` di `saas-client.ts`
- `ensureBrokerPin`/`generatePin`/`clearBrokerPin` (`credential-store.ts:47-111`) — logic ini duduk **di atas** interface `CredentialStore` (load/save murni), jadi tetap di core tapi sebagai fungsi terpisah yang menerima `CredentialStore` sebagai parameter, supaya tidak terduplikasi di tiap implementasi store

**Catatan `hms-table.ts`**: import JSON-nya sekarang pakai path relatif `../../../../packages/printer-monitor-core/src/hms-codes.json` (`hms-table.ts:3`) yang bakal patah kalau file dipindah begitu saja. Perbaikannya: `packages/printer-monitor-core` re-export `hmsTable`/data JSON-nya lewat entry point package (bukan path relatif lintas-package), `packages/agent-core` import dari situ.

**Tetap di `apps/agent`** (Electron-spesifik, tidak dipindah): `index.ts` (bootstrap Electron — Plan A cuma ganti import-nya jadi dari `@3pb/agent-core`, urutan bootstrap sendiri BELUM di-refactor jadi `AgentRuntime.start()`, itu Plan B), `ipc.ts` (Plan A: tetap fungsi module-level dipanggil langsung dari handler, BUKAN wrapper `AgentService` — itu Plan B), `window.ts`, `tray.ts`, seluruh `preload/` dan `renderer/`.

### 5 interface yang di-inject per platform

Titik coupling Electron yang nyata di kode asli, per audit Fable: `app.getPath("userData")`, `safeStorage`, `shell.openExternal`/`dialog.showOpenDialog`, `electron-log` (paling menyebar — dipakai di broker, saas-client, engine-manager, layout-publisher, ipc), dan **satu titik ke-5 yang kelewat di draft pertama**: `__AGENT_VERSION__`/`__AGENT_COMMIT_HASH__` (Vite `define` lain di `electron.vite.config.ts:59-60`, dipakai `saas-client.ts:97,163` buat header `X-Agent-Version` dan keputusan `updateAvailable`).

**Catatan (Plan A, sudah diimplementasikan): `CredentialStore` dibuat generik** (`CredentialStore<TBlob>`/`CredentialLoadResult<TBlob>`), bukan spesifik `CredentialBlob` seperti sketsa awal di bawah — ini yang dipakai referensi `CredentialStore<CredentialBlob>` di constructor `AgentRuntime` di atas.

```ts
// packages/agent-core/src/interfaces.ts (bentuk aktual pasca-Plan A)
export type CredentialLoadResult<TBlob> =
  | { status: "ok"; blob: TBlob }
  | { status: "empty" }
  | { status: "degraded"; reason: string };

export interface CredentialStore<TBlob> {
  load(): Promise<CredentialLoadResult<TBlob>>;
  save(blob: TBlob): Promise<void>;
  isEncryptionAvailable(): boolean;
}

export interface PathProvider {
  userDataDir(): string;
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LogFileProvider {
  getLogFilePath(): string | null; // null = tidak ada file log (mis. daemon systemd yang log ke journal)
}

export interface BuildInfo {
  version: string;
  commitHash: string;
}
```

`BuildInfo` dioper ke `saas-client.ts` (Plan A: sebagai parameter fungsi, bukan `AgentRuntime` constructor dulu — `AgentRuntime` baru ada di Plan B) menggantikan `__AGENT_VERSION__`/`__AGENT_COMMIT_HASH__`. Electron host tetap baca dari `package.json`+`git rev-parse` seperti sekarang (lewat Vite `define` yang TETAP ADA untuk `BuildInfo` — beda dari `__SAAS_BASE_URL__` yang dihapus; versi/commit-hash memang tepat sebagai compile-time constant, bukan config yang perlu diubah user).

`saas-client.ts:66` juga baca `process.env.SAAS_BASE_URL` langsung sebagai override (dev/test) — **dipertahankan**, precedence tetap `env var > config.json > default`.

**Semantik `CredentialLoadResult` WAJIB dipertahankan persis** dari `tryLoadCredentials()` yang sekarang: "file ada tapi gagal decrypt" ≠ "file belum ada" — `ensureBrokerPin()` menggunakan pembedaan ini supaya tidak menimpa data. Implementasi file-AES Linux HARUS memetakan "key file hilang/rusak" ke `degraded`, bukan `empty` — kalau tertukar, upgrade/restore di Pi bisa diam-diam menghapus token+access-code. Ini area regresi paling berisiko dari seluruh refactor ini (lihat bagian Testing).

**Implementasi konkret per platform (dibangun di host masing-masing, bukan di core):**
- `SafeStorageCredentialStore` (Electron Win/Mac) — wrap `safeStorage` + file di `app.getPath("userData")`, port langsung dari `credential-store.ts` yang sekarang
- `FileAesCredentialStore` (semua Linux — Electron Linux desktop MAUPUN headless daemon nanti) — AES-256-GCM dengan key file lokal permission 0600, path key & data ditentukan oleh `PathProvider` yang di-pass (beda antara Electron Linux desktop `~/.config/slizebiz-agent/` vs daemon headless `/var/lib/slizebiz-agent/` — keputusan path headless final di sub-project 2, tidak diputuskan di sini)
- `ElectronLogAdapter implements Logger` — wrap `electron-log/main`, cuma dipakai host Electron

### Plan B: ekstraksi `broker.ts` (`PinRateLimiter` + `LocalBroker`)

Sebelum `AgentRuntime` bisa menyerap state broker, `broker.ts` sendiri harus pindah dulu (lihat koreksi di atas — ini belum terjadi di Plan A). Langkah:

1. Tambah dependency `aedes` ke `packages/agent-core/package.json` (tetap dobel di `apps/agent/package.json` sesuai aturan duplikasi dependency di bagian Build & packaging).
2. Ganti `import log from "electron-log/main"` → `Logger` yang di-inject (2 call site di baris 164, 168 versi sekarang).
3. **Ekstrak logic rate-limit PIN jadi class terpisah `PinRateLimiter`** (file baru, murni, tanpa dependency Electron): `check(addr, presented, pin)` publik, `MAX_ATTEMPTS`/`LOCKOUT_MS` sebagai konstanta kelas. Broker bikin instance baru tiap `start()`. Ini yang menghapus KEDUA test-only escape hatch (`__resetRateLimitForTests` DAN `__checkPinForTests`) sekaligus — folding `rateLimitMap` jadi field instance saja TIDAK cukup untuk menghapus `__checkPinForTests`, karena selama logic-nya private di dalam broker, test rate-limit-bookkeeping (yang harus memanggil `checkPin` dengan alamat non-loopback tanpa buka socket TCP beneran) tetap butuh jalan pintas. Dengan `PinRateLimiter` publik, test langsung `new PinRateLimiter()` + fake timers.
4. Bungkus `server`/`aedesInstance` jadi class `LocalBroker` (`start(port, pin): Promise<...>`, `stop(): Promise<void>`, getter `port`). `AgentRuntime` punya field `broker: LocalBroker` — BUKAN melipat `server`/`aedesInstance`/`rateLimitMap` langsung jadi field `AgentRuntime` (itu cuma memindahkan masalah singleton, bukan menyelesaikannya). Ini juga bikin `broker.test.ts` pindah nyaris apa adanya (ganti pemanggilan fungsi module-level → pemanggilan method instance), dan test `AgentRuntime` bisa inject broker palsu tanpa aedes beneran.

**Dua jebakan yang harus dihindari saat migrasi `broker.test.ts` (harus dibaca penuh, bukan disampling, saat implementasi):**
- 2 test (`default 1883`, `EACCES`) pakai `vi.spyOn(net, "createServer")` — cuma bekerja karena broker sekarang `import net from "node:net"` (namespace/default import). Kalau saat refactor diganti jadi `import { createServer } from "node:net"`, spy diam-diam tidak kena dan test itu bind port 1883 beneran alih-alih di-mock. **Pertahankan gaya import `net` yang sekarang.**
- `afterEach(stopBroker)` yang sekarang module-level harus jadi `afterEach(() => broker?.stop())` per instance; test yang manggil `startBroker` dua kali dalam satu `it()` (uji idempotensi) harus tetap dijamin oleh `LocalBroker.start()` sendiri (`await this.stop()` di awal method, bukan diasumsikan caller yang urus).

### Plan B: `AgentRuntime` — dari singleton module-level jadi class

`app-state.ts` dan `broker.ts` (setelah diekstrak di atas) sekarang pakai state module-level singleton (`engine`, `reporters`, `brokerPort`, `brokerPin`, `updateAvailable`, `credentialStoreDegraded`, plus `LocalBroker` instance). Aman di Electron (satu proses), tapi jadi masalah untuk (a) daemon headless nanti yang butuh instance yang bisa di-test tanpa hook test manual, dan (b) prinsip "satu akun per daemon" yang mengasumsikan satu `AgentRuntime` per proses secara eksplisit, bukan implisit lewat module scope.

```ts
// packages/agent-core/src/agent-runtime.ts
export class AgentRuntime {
  constructor(deps: {
    credentialStore: CredentialStore<CredentialBlob>;
    pathProvider: PathProvider;
    logger: Logger;
    logFileProvider: LogFileProvider;       // dipakai sendLogs() di AgentService
    buildInfo: BuildInfo;                    // dipakai fetchDevices/reconcileDevices/fetchLatestVersion
    saasBaseUrl: string;                     // dibaca dari config runtime oleh host, dioper ke sini
    updatePlatform: "win" | "mac";           // menggantikan process.platform di startUpdateChecks; daemon nanti tambah "linux" (tanggung jawab sub-project 4, sudah dicatat di Out of scope)
    brokerPort?: number;                     // default 1883; sekarang hardcoded di index.ts, test butuh 0/port bebas
    broker?: LocalBroker;                    // opsional, buat inject broker palsu di test AgentRuntime tanpa aedes beneran
  });

  async start(): Promise<void>;   // lihat urutan & invariant di bawah
  async stop(): Promise<void>;    // lifecycle baru, WAJIB ADA — lihat di bawah

  // method-method yang sekarang tersebar di app-state.ts (getEngine/setEngine dst)
  // dan startup.ts jadi method/field instance di sini, bukan fungsi module-level lagi.
}
```

**`start()`/`stop()` adalah tambahan baru dari sketsa awal — wajib ada, dengan aturan berikut (semua temuan review Fable putaran 3 terhadap kode aktual):**

- **`stop()` belum pernah ada sekarang** (Electron mengandalkan process exit saat quit, tidak pernah `stopBroker()` eksplisit). Tapi wajib ditambahkan karena (a) test `AgentRuntime` butuh teardown bersih antar `it()` — kalau tidak, aedes+`net.Server`+`MqttReporter`+timer update-check semua leak antar test, dan (b) daemon systemd nanti butuh graceful shutdown lewat SIGTERM. Urutan: `teardownEngine()` (lihat di bawah) → `broker.stop()` → `clearInterval` timer update-check.
- **Timer `startUpdateChecks` (`index.ts:117` sekarang) harus jadi field instance** (`updateCheckTimer: NodeJS.Timeout | null`), supaya bisa di-`clearInterval` di `stop()` — sekarang tidak disimpan di mana pun, jadi tidak pernah bisa dihentikan.
- **`startUpdateChecks` SENGAJA independen dari hasil `start()` yang lain** — komentar `index.ts:101-106` di kode asli tegas: bootstrap early-return saat broker gagal, dan update check harus tetap jalan justru di kasus itu. Implementasi `start()` **harus** salah satu dari: (a) internal `try { ...urutan inti... } finally { ...mulai update check... }`, atau (b) dua method publik terpisah (`start()` dan `startUpdateChecks()`) yang host wajib panggil keduanya secara eksplisit. **JANGAN** menulis `start()` sebagai satu urutan linear yang early-return — itu menghilangkan invariant ini secara diam-diam. Catatan tambahan yang harus dipertahankan (perilaku existing, bukan bug baru): token `agentToken` di-capture sekali saat update-check mulai — kalau user baru aktivasi setelah `start()` selesai, update check baru mulai setelah restart proses berikutnya.
- **`start()` tidak boleh pernah throw** — ini menjaga invariant "IPC/handler selalu terdaftar" yang ada sekarang di `index.ts:31-36, 96-98` (host memanggil `registerIpcHandlers`/setup transport SETELAH `start()`, apa pun hasilnya). Kegagalan broker/engine/layout di-swallow+log seperti sekarang (lewat `logger`), bukan dilempar ke caller. Semua method `AgentService` juga harus tetap toleran "runtime belum start sepenuhnya" (`brokerPort===null` → `broker_unavailable`, `engine===null` → `engine_not_running`/snapshot kosong) — perilaku ini sudah ada, harus jadi assertion eksplisit di test karakterisasi `start()`.
- **Kasus `startEngine` throw di tengah `start()`**: perilaku asli `index.ts`'s outer `catch` yang harus dipertahankan persis adalah `publishLayout` **ikut ter-skip** kalau `startEngine` gagal (beda dari `sync()` yang tetap coba republish layout walau engine gagal) — bukan bug yang diminta diperbaiki di sini, tapi harus direplikasi persis dan dikasih test karakterisasi baru (index.ts sekarang sama sekali tidak punya test untuk urutan bootstrap ini).
- Log diagnostik bootstrap yang sekarang di `index.ts:44-55` (`[agent] SaaS base URL: ...`, `SAAS_BASE_URL KOSONG`, `kandidat IP LAN`) **pindah masuk `start()`** — daemon headless nanti butuh diagnosa startup yang sama, jadi lebih tepat di runtime daripada tetap di host Electron-only.

### Plan B: `AgentService` — kontrak yang dipakai Electron DAN daemon nanti

22 channel IPC nyata yang ada sekarang (dicocokkan lewat `preload/index.ts`) dipetakan 1:1 — audit Fable putaran 3 terhadap `ipc.ts` aktual mengonfirmasi klaim "1:1" ini **valid**, tidak ada handler yang menolak dipetakan ke satu method async (tidak ada closure atas state lokal per-call selain `baseUrl`, yang pindah ke constructor; tidak ada multi-round-trip; tidak ada side-effect Electron selain 2 yang di-scope-out):

| # | Channel `ipc.ts` sekarang | Method `AgentService` | Catatan |
|---|---|---|---|
| 1 | `agent:activate` | `activate(token)` | read-modify-write blob kredensial |
| 2 | `agent:scan-lan` | `scanLan()` | |
| 3 | `agent:pair-device` | `pairDevice(shortCode, secret)` | RMW blob |
| 4 | `agent:forget-device` | `forgetDevice(shortCode)` | RMW blob |
| 5 | `agent:update-device-model` | `updateDeviceModel(shortCode, model)` | |
| 6 | `agent:sync` | `sync()` | mutasi `engine`/`reporters` — lihat `teardownEngine()` di bawah |
| 7 | `agent:get-activation-state` | `getActivationState()` | |
| 8 | `agent:get-snapshot` | `getSnapshot()` | baca state sync |
| 9 | `agent:get-broker-info` | `getBrokerInfo()` | baca state sync |
| 10 | `agent:printer-command` | `sendPrinterCommand(deviceId, cmd)` | |
| 11 | `agent:get-credential-store-status` | `getCredentialStoreStatus()` | baca state sync |
| 12 | `agent:get-update-status` | `getUpdateStatus()` | baca state sync |
| 13 | `agent:send-logs` | `sendLogs()` | butuh `LogFileProvider` + `node:fs`, `MAX_LOG_BYTES` jadi konstanta core |
| 14–18 | `agent:file-list/upload/download/delete/rename` | `listFiles/uploadFile/downloadFile/deleteFile/renameFile` | lewat helper privat `getFileClientFor` |
| 19 | `agent:file-parse-3mf` | `parseThreemf(shortCode, remotePath)` | temp file `os.tmpdir()` |
| 20 | `agent:file-thumbnail` | `getFileThumbnail(shortCode, remotePath)` | temp file, jszip |
| — | `agent:open-download-page` | **tetap di host** | `shell.openExternal`, butuh `baseUrl` |
| — | `agent:pick-download-folder` | **tetap di host** | `dialog.showOpenDialog`, gak masuk akal di headless |

```ts
// packages/agent-core/src/agent-service.ts
export class AgentService {
  constructor(private runtime: AgentRuntime) {}
  async pairDevice(shortCode: string, secret: DeviceSecret): Promise<void> { ... }
  async sync(): Promise<SyncResult> { ... }
  async sendPrinterCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult> { ... }
  async listFiles(shortCode: string, path: string): Promise<PrinterFileEntry[]> { ... }
  // ... 16 method lain sesuai tabel di atas
}
```

`apps/agent/src/main/ipc.ts` jadi wrapper tipis: `ipcMain.handle("agent:pair-device", (_e, ...args) => service.pairDevice(...args))` untuk tiap channel.

**Kontrak yang harus didokumentasikan eksplisit di kode (bukan diubah — dipertahankan, tapi ditulis jelas karena nanti dipakai transport HTTP di sub-project 2):**
- **Throw vs return**: method #14–20 (operasi file) **throw** (`Error("device_not_found")`, error FTPS mentah); method lainnya return discriminated union (`{ok: false, kind: ...}`). Electron IPC otomatis serialisasi throw jadi rejected promise di sisi renderer; transport HTTP nanti butuh mapping eksplisit (mis. throw → HTTP 4xx/5xx). Jangan diseragamkan di Plan B — cukup didokumentasikan sebagai kontrak.
- **`sync()` tidak re-entrant**: dua panggilan `sync()` bersamaan sama-sama `stop()` engine lama lalu sama-sama `startEngine` baru — yang satu bisa leak reporter (persis bug yang motivasi spec ini). `ipcMain.handle` tidak serialisasi panggilan, jadi ini SUDAH bisa terjadi sekarang (perlu klik ganda cepat), tapi jadi jauh lebih realistis begitu ada transport HTTP concurrent di sub-project 2. **Bukan regresi yang harus diperbaiki di Plan B**, tapi WAJIB dicatat sebagai prasyarat sebelum sub-project 2 mulai (guard coalescing promise in-flight — perbaikan kecil, jangan lupa).
- Race read-modify-write pada blob kredensial (method #1, #3, #4 dipanggil bersamaan) — perilaku existing, cukup dicatat, tidak perlu diperbaiki.

**`sync()` dan `stop()` (di `AgentRuntime`) WAJIB berbagi satu method privat `teardownEngine()`** (stop engine lama → close semua reporter lama, urutan yang sekarang didokumentasikan di komentar `app-state.ts`). Ini persis motivasi spec ini ada — kalau kedua tempat menulis ulang urutan stop-engine/close-reporter secara terpisah, tujuan Plan B gagal di tujuannya sendiri (persis kelas bug reporter-leak yang pernah terjadi).

**Tipe return yang harus ikut pindah ke core**: `ActivationState`, `SyncResult`, `UpdateDeviceModelResult` (sekarang didefinisikan di `ipc.ts:38-48`, diimpor `preload/index.ts` dan `DashboardScreen.tsx`) — ini tipe return `AgentService`, jadi pindah bareng, dengan import path preload/renderer disesuaikan.

**Yang TIDAK masuk `AgentService`** (Electron-spesifik, tetap di `ipc.ts` host): `agent:pick-download-folder` (pakai `dialog.showOpenDialog`, gak masuk akal di headless — di-scope-out eksplisit dari daemon nanti, bukan tanggung jawab sub-project ini untuk menyelesaikan), `shell.openExternal` (buka halaman download).

### `SAAS_BASE_URL` jadi runtime config (Plan A)

Sekarang: `electron.vite.config.ts` inject `__SAAS_BASE_URL__` sebagai Vite `define` compile-time (default `https://app.slizebiz.com`, override lewat env var `SAAS_BASE_URL` saat build — dipakai untuk build staging: `SAAS_BASE_URL=http://192.168.88.113:3300 pnpm build`, lihat `build-installer.mjs:117`). Setelah refactor ini: dibaca dari `${pathProvider.userDataDir()}/config.json` (field `saasBaseUrl`) **saat runtime start**, bukan di-bake ke bundle.

**Perubahan workflow nyata yang harus diantisipasi (bukan cuma "refactor murni"):** kalau default first-run selalu `https://app.slizebiz.com`, build staging (`SAAS_BASE_URL=http://192.168.88.113:3300 pnpm build`) berhenti berfungsi — binary yang sama buat semua environment, first-run selalu coba connect ke domain production yang (per `saas-client.ts:15-21`, insiden 2026-08-22 nyata) masih placeholder Cloudflare Pages kalau belum live, hasilnya `wrong_server` tanpa cara benerin selain edit `config.json` manual (belum ada UI buat itu).

**Keputusan: env var `SAAS_BASE_URL` dipertahankan sebagai bridge di first-run.** Saat `config.json` belum ada sama sekali: kalau `process.env.SAAS_BASE_URL` di-set saat proses start (bukan cuma saat build), pakai itu sebagai nilai yang ditulis ke config; kalau tidak, baru fallback ke `https://app.slizebiz.com`. Ini mempertahankan workflow staging (`SAAS_BASE_URL=... pnpm --filter @3pb/agent dev` masih jalan seperti sekarang buat testing lokal), sekaligus tetap runtime-config buat instalasi yang sudah jadi (config.json yang sudah ada tidak pernah ditimpa oleh env var — env var cuma seed nilai awal).

- `AgentRuntime` (Plan B) menerima `saasBaseUrl` sebagai constructor param; di Plan A (sebelum `AgentRuntime` ada), fungsi-fungsi `saas-client.ts` menerima `saasBaseUrl` sebagai parameter langsung, dibaca host dari config sebelum manggil
- Electron `index.ts` bootstrap: baca config file dulu (buat + seed dari env var kalau belum ada), baru dipakai
- Vite `define __SAAS_BASE_URL__` di `electron.vite.config.ts` **dihapus** sebagai bagian Plan A (tidak dipakai lagi) — `__AGENT_VERSION__`/`__AGENT_COMMIT_HASH__` (`BuildInfo`) TETAP ADA sebagai Vite define, tidak ikut dihapus
- Pesan error yang menyebut "rebuild dengan SAAS_BASE_URL" (`saas-client.ts:89`, `index.ts:48-51`) **harus diubah** jadi merujuk `config.json`, bukan rebuild — ini pengecualian eksplisit dari klaim "pesan error harus identik" di bagian Error Handling
- Kasus "base URL kosong" (`index.ts:45-52`): field `""` eksplisit di config.json tetap dianggap error dan tetap berteriak (bukan diam-diam fallback ke default) — mempertahankan perilaku "gagal keras kalau config rusak" yang ada sekarang

## Build & packaging (Plan A)

- `electron.vite.config.ts:22` `WORKSPACE_TS_PACKAGES` **wajib** ditambah `@3pb/agent-core` — tanpa ini app terpaket mati `ERR_MODULE_NOT_FOUND` saat runtime (lihat komentar di baris 14-21 file itu buat alasannya)
- Dependency runtime core (`aedes`, `mqtt`, `basic-ftp`, `jszip`, `fast-xml-parser`, `bonjour-service`) dideklarasikan di `packages/agent-core/package.json` **dan** tetap harus ada di `apps/agent/package.json` (dibundel dari source tapi import npm-nya di-externalize dan diresolusi dari `apps/agent/out/main` saat runtime)
- Verifikasi `pnpm --filter @3pb/agent deploy --prod` di `build-installer.mjs` tetap membawa dependency transitif workspace baru ini dengan benar (`node-linker=hoisted` step yang sudah ada)
- `packages/agent-core/tsconfig.json` butuh `resolveJsonModule` (buat `hms-table.ts`) — pakai `packages/printer-monitor-core/tsconfig.json` sebagai template

## Error handling

Semua perilaku error yang ada sekarang harus identik setelah refactor — ini bukan kesempatan untuk "sekalian benerin" kecuali disebutkan eksplisit di atas. Contoh yang harus tetap sama: guard `!client?.connected` di broker command, `credential-store` fallback ke session-only PIN saat encryption gak tersedia (dengan `console.error`/`logger.error`, bukan diam-diam), format pesan error yang sudah ada di `SyncResult`/`CommandResult`.

## Testing

**Plan A:**
- Semua test main-process Electron yang bukan `ipc.test.ts`/`broker.test.ts` (file-manager, engine-manager, credential-store, dll — lihat `apps/agent/src/main/*.test.ts`) dipindah bareng modul-nya ke `packages/agent-core/src/*.test.ts` — untuk modul-modul ini assertion memang tinggal ganti import path
- `ipc.test.ts` dan `broker.test.ts` (yang `vi.mock("electron")`/`electron-log` dan manipulasi state module-level) **TETAP DI `apps/agent`, TIDAK dipindah/ditulis-ulang di Plan A** — masih testing fungsi module-level yang sekarang, cuma sumber importnya berubah jadi dari `@3pb/agent-core`. Test detail-nya baru direstrukturisasi di Plan B.
- **Test karakterisasi baru, wajib**: `CredentialStore.load()` untuk ketiga outcome (`ok`/`empty`/`degraded`) secara eksplisit, termasuk kasus "key file ada tapi corrupt/gagal decrypt" harus balik `degraded` bukan `empty` — untuk implementasi `SafeStorageCredentialStore` MAUPUN `FileAesCredentialStore`
- Test baru untuk migrasi `SAAS_BASE_URL`: seed dari env var saat config belum ada, config existing tidak pernah ditimpa, field `""` eksplisit tetap error
- `pnpm --filter @3pb/agent test` dan test baru `pnpm --filter @3pb/agent-core test` dua-duanya harus hijau sebelum Plan A dianggap selesai

**Plan B:**

**Angka aktual** (dikoreksi dari draft pertama lewat pembacaan penuh oleh Fable putaran 3, bukan estimasi): `ipc.test.ts` sekarang **803 baris**, 53 pemanggilan `registerIpcHandlers`, 58 invokasi handler, **58 panggilan setter** (`setEngine` 15×, `setBrokerPort` 16×, `setBrokerPin` 15×, `setReporters` 6×, `setUpdateAvailable` 3×, `setCredentialStoreDegraded` 3×), 5 assertion `getEngine()`/`getReporters()`.

**Klasifikasi migrasi (bukan sekadar cari-ganti, tapi juga bukan redesain konseptual)**:
- **~80% mekanis**: `registerIpcHandlers({saasBaseUrl}); await handlers["agent:x"](...)` → `const {service} = makeFixture(); await service.x(...)`; setter → assignment field fixture. Bonus: ±30 baris "reset state ke null/[]" di ekor tiap test (sumber kerapuhan sekarang — satu test lupa reset, test berikutnya bocor) **hilang total** karena tiap test dapat instance `AgentRuntime` fresh.
- **4 test menguji semantik singleton "selalu terkini, bukan snapshot beku"** (get-snapshot, get-broker-info, credential-store-status, update-status) — setelah jadi class instance ini jadi tautologi (`this.x` memang selalu terkini). Boleh dipertahankan sebagai test trivial, tapi jangan dihitung sebagai coverage baru.
- **6 test wiring `ipcMain`** (registrasi channel, open-download-page, pick-download-folder) — ini yang jadi isi `ipc.test.ts` baru versi tipis setelah migrasi (bisa 1 test parametrik 20 channel + 2 test Electron-only yang tetap ada).
- **Header mock (baris 1-82 sekarang) harus ditulis ulang total** — ini biaya sebenarnya dari migrasi ini, bukan mekanis:
  - `AgentService`/`agent-service.test.ts` hidup DI DALAM `@3pb/agent-core`, jadi tidak bisa `vi.mock("@3pb/agent-core", partial)` seperti sekarang (mock paket dirinya sendiri) — harus `vi.mock` per modul relatif (`./credential-store`, `./saas-client`, `./startup`, `./engine-manager`, `./layout-publisher`, `./file-manager/bambu-ftps-client`, `./file-manager/threemf-parser`).
  - **Rekomendasi (bukan wajib, tapi disarankan kuat)**: pakai fake `InMemoryCredentialStore` (implementasi `CredentialStore<CredentialBlob>` in-memory) alih-alih terus mock `loadCredentials`/`saveCredentials` satu-satu — menghapus ±40 baris `mockResolvedValueOnce`, dan assertion jadi lebih bermakna (`expect(await store.load()).toEqual({status:"ok", blob:{...}})` daripada `expect(saveCredentials).toHaveBeenCalledWith(...)`). Fixture ini reusable juga buat test karakterisasi `start()`.
  - `vi.mock("electron")` + `electron-log/main` + spy `console.error` hilang total (logger jadi `vi.fn()` yang di-inject langsung).
  - Environment test pindah dari `jsdom` (`apps/agent`) ke `node` (`packages/agent-core`) — lebih tepat untuk kode yang buka socket TCP beneran (broker).

**Urutan implementasi yang disarankan (supaya repo hijau di tiap commit, bukan satu commit merah raksasa)** — ini WAJIB jadi urutan task di implementation plan, bukan cuma saran:
1. Pindah `broker.ts` + `broker.test.ts` ke core dengan `PinRateLimiter` + `LocalBroker` (lihat bagian di atas). Hijau — `ipc.test.ts` tidak tersentuh sama sekali di langkah ini.
2. Tambah `AgentRuntime` di core; **`app-state.ts` di `apps/agent` tetap ada sementara sebagai facade tipis** ke satu instance `defaultRuntime` module-level (mis. `setEngine = (e) => { defaultRuntime.engine = e }`). `ipc.test.ts` LAMA tetap hijau tanpa perubahan sama sekali di langkah ini.
3. Tambah `AgentService` + `agent-service.test.ts` **baru** di core (pakai fixture `InMemoryCredentialStore`). `ipc.ts` di `apps/agent` di-refactor jadi wrapper tipis manggil `service.x()`. `ipc.test.ts` lama TETAP hijau lewat facade langkah 2 (belum dihapus).
4. Pindahkan urutan bootstrap ke `AgentRuntime.start()`/`stop()`, plus semua test karakterisasi baru untuk invariant di atas (update-check independen, start() tidak pernah throw, urutan startEngine-gagal-skip-publishLayout).
5. Baru sekarang hapus facade `app-state.ts` + `app-state.test.ts`, susutkan `ipc.test.ts` lama jadi 6 test wiring seperti yang dijelaskan di atas.

**`broker.test.ts`**: ditulis ulang mengikuti bentuk `LocalBroker`/`PinRateLimiter` di atas — dua jebakan migrasinya (gaya import `net`, `afterEach` per-instance) sudah dicatat di bagian ekstraksi broker.

E2E manual: build Electron desktop (Win/Mac) dan verifikasi tidak ada regresi perilaku nyata (pairing, sync, print, file browser) — tetap gak bisa diotomasi dari sesi agent.

## Out of scope (Plan A dan Plan B)

- Implementasi daemon headless itu sendiri (`apps/agent-headless`) — sub-project 2, baru bisa mulai setelah Plan B selesai
- `PathProvider` untuk headless daemon (path spesifik `/var/lib/slizebiz-agent` dkk) — diputuskan di sub-project 2
- Web wizard, kiosk display, CLI, build target Linux desktop — sub-project 2-5
- `fetchLatestVersion(platform: "win"|"mac")` (`saas-client.ts:160`) belum menerima `"linux"` — tipe-nya milik core sekarang, tapi menambah member baru itu tanggung jawab sub-project 4, dicatat di sini sebagai prasyarat
- **`AgentService.sync()` membuat guard coalescing in-flight promise** (mencegah dua panggilan `sync()` bersamaan sama-sama restart engine dan salah satunya leak reporter) — perbaikan kecil (~5 baris + 1 test) yang WAJIB dikerjakan sebelum sub-project 2 mulai (daemon HTTP concurrent bikin race ini realistis, bukan cuma teoretis), tapi bukan bagian Plan B karena bukan regresi dari refactor ini — dicatat di sini sebagai prasyarat eksplisit sub-project 2, sama seperti item `fetchLatestVersion` di atas
- Perubahan perilaku APA PUN di Electron desktop yang ada, kecuali migrasi `SAAS_BASE_URL` yang didokumentasikan eksplisit di atas

## Referensi

- Review kelayakan Fable 5.1 (2026-09-08, putaran 1): urutan dependency sub-project, temuan risiko `tryLoadCredentials()`, rekomendasi `AgentService` sebagai transport-agnostic contract, rekomendasi Ink untuk CLI TUI (sub-project 5)
- Review Fable 5.1 (2026-09-08, putaran 2, terhadap draft spec pertama): pemisahan Plan A/Plan B, `app-state.ts`/logic-terkubur-di-`ipc.ts`/`hms-table.ts` yang kelewat di draft pertama, `BuildInfo` sebagai coupling ke-5, keputusan bridge env-var buat `SAAS_BASE_URL`, catatan build/packaging (`WORKSPACE_TS_PACKAGES`, dependency duplication, `resolveJsonModule`)
- Review Fable 5.1 (2026-09-09, putaran 3, terhadap desain Plan B dan kode aktual post-Plan-A): koreksi `broker.ts` belum pindah, rekomendasi `PinRateLimiter`+`LocalBroker`, kebutuhan `stop()`/lifecycle dan invariant `start()` (update-check independen, tidak pernah throw), audit lengkap 20 method `AgentService` (tabel 1:1 tervalidasi terhadap `ipc.ts` aktual), angka aktual migrasi `ipc.test.ts` (803 baris/58 setter, dikoreksi dari estimasi draft pertama), kontrak throw-vs-return dan flag `sync()` non-re-entrant sebagai prasyarat sub-project 2, urutan implementasi 5-langkah berbasis facade
- Plan A: implementation plan `docs/superpowers/plans/2026-09-08-agent-core-extraction-plan-a.md` (15 task, selesai & merged ke `master` 2026-09-09, termasuk 4 ruling controller dan 1 fix round dari final review — lihat ledger SDD yang sudah dihapus post-merge, riwayat lengkap ada di commit history branch `claude/agent-core-extraction-spec`)
- Kode asli yang jadi basis ekstraksi Plan B: `apps/agent/src/main/{index,ipc,app-state,broker,ipc.test,broker.test,app-state.test}.ts`, `apps/agent/src/preload/index.ts` (post-Plan-A — `credential-store.ts`/`saas-client.ts`/`engine-manager.ts`/dll sudah pindah ke `packages/agent-core/src/` lewat Plan A)
