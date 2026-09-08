# Agent Core Extraction (`packages/agent-core`) — Sub-project 1 of Linux/Pi Agent Expansion

Status: draft v2 (direvisi setelah review Fable 5.1 kedua), menunggu review user
Tanggal: 2026-09-08
Scope: `apps/agent` (Slizebiz Agent, Electron) — refactor murni (kecuali satu perubahan workflow `SAAS_BASE_URL` yang didokumentasikan eksplisit), menghasilkan **2 implementation plan** (Plan A: ekstraksi mekanis, Plan B: `AgentRuntime`+`AgentService`)

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

### File yang dipindah (Plan A)

Dari `apps/agent/src/main/` ke `packages/agent-core/src/`:
`engine-manager.ts`, `broker.ts`, `discovery/bambu-ssdp.ts`, `discovery/moonraker-mdns.ts`, `file-manager/*` (types.ts, bambu-ftps-client.ts, threemf-parser.ts), `printer-model.ts`, `hms-table.ts` (lihat catatan import JSON di bawah), `layout-publisher.ts`, `device-cache.ts`, `saas-client.ts`, `startup.ts` (reconcileDevices), `credential-store.ts` (dirombak — lihat di bawah), **`app-state.ts`** (khusus `pickLocalIpCandidates`/`getLocalIp`, pure `node:os`, dipakai `ipc.ts:160` dan `index.ts:55` — sebelumnya kelewat di draft pertama; bagian `app-state.ts` yang menyimpan `engine`/`reporters` singleton BUKAN dipindah di Plan A, itu bagian Plan B).

**Logic yang sekarang "terkubur" di dalam `ipc.ts` dan harus diekstrak jadi fungsi bernama di core, bukan ketemu belakangan:**
- `findPlateThumbnail` (`ipc.ts:291-302`) dan `extractGcodeThumbnail` (`ipc.ts:312-321`) — pindah ke `file-manager/thumbnail.ts` baru
- Pola download-ke-temp buat parse-3mf/thumbnail (`ipc.ts:270-356`) — pindah jadi fungsi di `file-manager/`
- Upload log ke `/api/agent/logs` (`ipc.ts:213-221`) — pindah jadi `uploadLogs()` di `saas-client.ts`
- `ensureBrokerPin`/`generatePin`/`clearBrokerPin` (`credential-store.ts:47-111`) — logic ini duduk **di atas** interface `CredentialStore` (load/save murni), jadi tetap di core tapi sebagai fungsi terpisah yang menerima `CredentialStore` sebagai parameter, supaya tidak terduplikasi di tiap implementasi store

**Catatan `hms-table.ts`**: import JSON-nya sekarang pakai path relatif `../../../../packages/printer-monitor-core/src/hms-codes.json` (`hms-table.ts:3`) yang bakal patah kalau file dipindah begitu saja. Perbaikannya: `packages/printer-monitor-core` re-export `hmsTable`/data JSON-nya lewat entry point package (bukan path relatif lintas-package), `packages/agent-core` import dari situ.

**Tetap di `apps/agent`** (Electron-spesifik, tidak dipindah): `index.ts` (bootstrap Electron — Plan A cuma ganti import-nya jadi dari `@3pb/agent-core`, urutan bootstrap sendiri BELUM di-refactor jadi `AgentRuntime.start()`, itu Plan B), `ipc.ts` (Plan A: tetap fungsi module-level dipanggil langsung dari handler, BUKAN wrapper `AgentService` — itu Plan B), `window.ts`, `tray.ts`, seluruh `preload/` dan `renderer/`.

### 5 interface yang di-inject per platform

Titik coupling Electron yang nyata di kode asli, per audit Fable: `app.getPath("userData")`, `safeStorage`, `shell.openExternal`/`dialog.showOpenDialog`, `electron-log` (paling menyebar — dipakai di broker, saas-client, engine-manager, layout-publisher, ipc), dan **satu titik ke-5 yang kelewat di draft pertama**: `__AGENT_VERSION__`/`__AGENT_COMMIT_HASH__` (Vite `define` lain di `electron.vite.config.ts:59-60`, dipakai `saas-client.ts:97,163` buat header `X-Agent-Version` dan keputusan `updateAvailable`).

```ts
// packages/agent-core/src/interfaces.ts
export type CredentialLoadResult =
  | { status: "ok"; blob: CredentialBlob }
  | { status: "empty" }
  | { status: "degraded"; reason: string };

export interface CredentialStore {
  load(): Promise<CredentialLoadResult>;
  save(blob: CredentialBlob): Promise<void>;
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

### Plan B: `AgentRuntime` — dari singleton module-level jadi class

`app-state.ts` dan `broker.ts` sekarang pakai state module-level singleton (`server`, `aedesInstance`, `rateLimitMap`, `engine`, `reporters`). Aman di Electron (satu proses), tapi jadi masalah untuk (a) daemon headless nanti yang butuh instance yang bisa di-test tanpa `__resetRateLimitForTests`, dan (b) prinsip "satu akun per daemon" yang mengasumsikan satu `AgentRuntime` per proses secara eksplisit, bukan implisit lewat module scope.

```ts
// packages/agent-core/src/agent-runtime.ts
export class AgentRuntime {
  constructor(deps: {
    credentialStore: CredentialStore;
    pathProvider: PathProvider;
    logger: Logger;
    saasBaseUrl: string; // dibaca dari config runtime oleh host, dioper ke sini
  });
  // method-method yang sekarang tersebar di app-state.ts (getEngine/setEngine dst),
  // broker.ts (startBroker/getBrokerPort/getBrokerPin), dan startup.ts jadi method
  // instance di sini, bukan fungsi module-level lagi.
}
```

Bagian `AgentRuntime` juga menyerap urutan bootstrap yang sekarang di `index.ts:63-93` (tryLoadCredentials → ensureBrokerPin → startBroker → buildPairedDevices → startEngine → publishLayout) plus `startUpdateChecks` (`index.ts:107-118`) jadi method `AgentRuntime.start()` — bagian ini Electron-agnostic sepenuhnya dan justru paling dibutuhkan daemon headless nanti.

### Plan B: `AgentService` — kontrak yang dipakai Electron DAN daemon nanti

~20 operasi yang sekarang jadi handler `ipcMain.handle("agent:*")` langsung (pairDevice, sync, sendPrinterCommand, listFiles, uploadFile, download/delete/rename/parseThreemf, dst) ditarik jadi method plain async di atas satu `AgentRuntime`:

```ts
// packages/agent-core/src/agent-service.ts
export class AgentService {
  constructor(private runtime: AgentRuntime) {}
  async pairDevice(shortCode: string, secret: DeviceSecret): Promise<void> { ... }
  async sync(): Promise<SyncResult> { ... }
  async sendPrinterCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult> { ... }
  async listFiles(shortCode: string, path: string): Promise<PrinterFileEntry[]> { ... }
  // ... method lain, 1:1 dengan handler ipc.ts yang ada sekarang
}
```

`apps/agent/src/main/ipc.ts` jadi wrapper tipis: `ipcMain.handle("agent:pair-device", (_e, ...args) => service.pairDevice(...args))` untuk tiap channel. Ini yang membuat sub-project 2 nanti tinggal pasang HTTP/WS di atas `AgentService` yang sama tanpa duplikasi logic — terutama `sync()` yang urutannya (stop-engine → close-reporter → start-engine → republish-layout) sudah pernah kena bug leak sebelumnya, jangan sampai ditulis ulang beda di dua tempat.

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
- `ipc.test.ts` (791 baris) dan `broker.test.ts` ditulis ulang untuk testing lewat `AgentService`/`AgentRuntime` instance, bukan manipulasi state module-level/mock `ipcMain` langsung
- Test baru untuk `AgentService` sebagai kontrak (manggil method langsung, bukan lewat `ipcMain` mock) — `apps/agent/src/main/ipc.ts` yang sekarang jadi test tipis "handler channel X memanggil `service.x()`"
- E2E manual: build Electron desktop (Win/Mac) dan verifikasi tidak ada regresi perilaku nyata (pairing, sync, print, file browser) — tetap gak bisa diotomasi dari sesi agent

## Out of scope (Plan A dan Plan B)

- Implementasi daemon headless itu sendiri (`apps/agent-headless`) — sub-project 2, baru bisa mulai setelah Plan B selesai
- `PathProvider` untuk headless daemon (path spesifik `/var/lib/slizebiz-agent` dkk) — diputuskan di sub-project 2
- Web wizard, kiosk display, CLI, build target Linux desktop — sub-project 2-5
- `fetchLatestVersion(platform: "win"|"mac")` (`saas-client.ts:160`) belum menerima `"linux"` — tipe-nya milik core sekarang, tapi menambah member baru itu tanggung jawab sub-project 4, dicatat di sini sebagai prasyarat
- Perubahan perilaku APA PUN di Electron desktop yang ada, kecuali migrasi `SAAS_BASE_URL` yang didokumentasikan eksplisit di atas

## Referensi

- Review kelayakan Fable 5.1 (2026-09-08, putaran 1): urutan dependency sub-project, temuan risiko `tryLoadCredentials()`, rekomendasi `AgentService` sebagai transport-agnostic contract, rekomendasi Ink untuk CLI TUI (sub-project 5)
- Review Fable 5.1 (2026-09-08, putaran 2, terhadap draft spec pertama): pemisahan Plan A/Plan B, `app-state.ts`/logic-terkubur-di-`ipc.ts`/`hms-table.ts` yang kelewat di draft pertama, `BuildInfo` sebagai coupling ke-5, keputusan bridge env-var buat `SAAS_BASE_URL`, catatan build/packaging (`WORKSPACE_TS_PACKAGES`, dependency duplication, `resolveJsonModule`)
- Kode asli yang jadi basis ekstraksi: `apps/agent/src/main/{index,ipc,credential-store,app-state,broker,saas-client,engine-manager,device-cache,layout-publisher,startup,printer-model,hms-table}.ts`, `apps/agent/src/preload/index.ts`, `apps/agent/electron.vite.config.ts`, `apps/agent/scripts/build-installer.mjs`
