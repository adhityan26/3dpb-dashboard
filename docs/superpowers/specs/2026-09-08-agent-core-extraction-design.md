# Agent Core Extraction (`packages/agent-core`) — Sub-project 1 of Linux/Pi Agent Expansion

Status: draft, menunggu review user
Tanggal: 2026-09-08
Scope: `apps/agent` (Slizebiz Agent, Electron) — refactor murni, tanpa fitur baru

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

## Sub-project ini: ekstrak core

Pindahkan logic yang sekarang nyampur dengan kode Electron di `apps/agent/src/main/*` ke package baru `packages/agent-core` (workspace package, `@3pb/agent-core`) yang **nol import Electron**. App Electron desktop yang sekarang harus tetap 100% identik perilakunya setelah refactor ini — cuma sekarang import logic dari package, bukan menulis ulang.

### File yang dipindah

Dari `apps/agent/src/main/` ke `packages/agent-core/src/`:
`engine-manager.ts`, `broker.ts`, `discovery/bambu-ssdp.ts`, `discovery/moonraker-mdns.ts`, `file-manager/*` (types.ts, bambu-ftps-client.ts, threemf-parser.ts), `printer-model.ts`, `hms-table.ts`, `layout-publisher.ts`, `device-cache.ts`, `saas-client.ts`, `startup.ts` (reconcileDevices), `credential-store.ts` (dirombak — lihat di bawah).

**Tetap di `apps/agent`** (Electron-spesifik, tidak dipindah): `index.ts` (bootstrap Electron), `ipc.ts` (jadi wrapper tipis di atas `AgentService`), `window.ts`, `tray.ts`, seluruh `preload/` dan `renderer/`.

### 4 interface yang di-inject per platform

Titik coupling Electron yang nyata di kode asli, per audit Fable: `app.getPath("userData")`, `safeStorage`, `shell.openExternal`/`dialog.showOpenDialog`, dan `electron-log` (paling menyebar — dipakai di broker, saas-client, engine-manager, layout-publisher, ipc).

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
  getLogFilePath(): string;
}
```

**Semantik `CredentialLoadResult` WAJIB dipertahankan persis** dari `tryLoadCredentials()` yang sekarang: "file ada tapi gagal decrypt" ≠ "file belum ada" — `ensureBrokerPin()` menggunakan pembedaan ini supaya tidak menimpa data. Implementasi file-AES Linux HARUS memetakan "key file hilang/rusak" ke `degraded`, bukan `empty` — kalau tertukar, upgrade/restore di Pi bisa diam-diam menghapus token+access-code. Ini area regresi paling berisiko dari seluruh refactor ini (lihat bagian Testing).

**Implementasi konkret per platform (dibangun di host masing-masing, bukan di core):**
- `SafeStorageCredentialStore` (Electron Win/Mac) — wrap `safeStorage` + file di `app.getPath("userData")`, port langsung dari `credential-store.ts` yang sekarang
- `FileAesCredentialStore` (semua Linux — Electron Linux desktop MAUPUN headless daemon nanti) — AES-256-GCM dengan key file lokal permission 0600, path key & data ditentukan oleh `PathProvider` yang di-pass (beda antara Electron Linux desktop `~/.config/slizebiz-agent/` vs daemon headless `/var/lib/slizebiz-agent/` — keputusan path headless final di sub-project 2, tidak diputuskan di sini)
- `ElectronLogAdapter implements Logger` — wrap `electron-log/main`, cuma dipakai host Electron

### `AgentRuntime` — dari singleton module-level jadi class

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

### `AgentService` — kontrak yang dipakai Electron DAN daemon nanti

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

### `SAAS_BASE_URL` jadi runtime config

Sekarang: `electron.vite.config.ts` inject `__SAAS_BASE_URL__` sebagai Vite `define` compile-time (default `https://app.slizebiz.com`, override lewat env var `SAAS_BASE_URL` saat build). Setelah refactor ini: dibaca dari `${pathProvider.userDataDir()}/config.json` (field `saasBaseUrl`) **saat runtime start**, bukan di-bake ke bundle.

- Kalau file/field belum ada saat pertama kali jalan → tulis default `https://app.slizebiz.com` ke config, pakai itu
- `AgentRuntime` menerima `saasBaseUrl` sebagai constructor param (dibaca oleh host sebelum construct runtime), semua pemanggilan `saas-client.ts` pakai nilai ini, bukan `__SAAS_BASE_URL__` global lagi
- Electron `index.ts` bootstrap: baca config file dulu (buat kalau belum ada), baru construct `AgentRuntime`
- Vite `define __SAAS_BASE_URL__` di `electron.vite.config.ts` **dihapus** sebagai bagian refactor ini (tidak dipakai lagi)

## Error handling

Semua perilaku error yang ada sekarang harus identik setelah refactor — ini bukan kesempatan untuk "sekalian benerin" kecuali disebutkan eksplisit di atas. Contoh yang harus tetap sama: guard `!client?.connected` di broker command, `credential-store` fallback ke session-only PIN saat encryption gak tersedia (dengan `console.error`/`logger.error`, bukan diam-diam), format pesan error yang sudah ada di `SyncResult`/`CommandResult`.

## Testing

- Semua test main-process Electron yang ada sekarang (file-manager, engine-manager, broker, credential-store, dll — lihat `apps/agent/src/main/*.test.ts`) dipindah bareng modul-nya ke `packages/agent-core/src/*.test.ts`, harus tetap lulus identik (assertion sama, cuma import path yang berubah)
- **Test karakterisasi baru, wajib**: `CredentialStore.load()` untuk ketiga outcome (`ok`/`empty`/`degraded`) secara eksplisit, termasuk kasus "key file ada tapi corrupt/gagal decrypt" harus balik `degraded` bukan `empty` — untuk implementasi `SafeStorageCredentialStore` MAUPUN `FileAesCredentialStore`
- Test baru untuk `AgentService` sebagai kontrak (bukan lewat `ipcMain` mock lagi, tapi manggil method langsung) — `apps/agent/src/main/ipc.test.ts` yang sekarang jadi test tipis "handler channel X memanggil `service.x()`", assertion behavior detail pindah ke test `AgentService` di core
- `pnpm --filter @3pb/agent test` dan test baru `pnpm --filter @3pb/agent-core test` dua-duanya harus hijau sebelum sub-project ini dianggap selesai
- E2E manual: build Electron desktop (Win/Mac, seperti sekarang) dan verifikasi tidak ada regresi perilaku nyata (pairing, sync, print, file browser) — tetap gak bisa diotomasi dari sesi agent, sama seperti sebelumnya

## Out of scope (sub-project ini)

- Implementasi daemon headless itu sendiri (`apps/agent-headless`) — sub-project 2
- `PathProvider` untuk headless daemon (path spesifik `/var/lib/slizebiz-agent` dkk) — diputuskan di sub-project 2, sub-project 1 cuma menyediakan interface-nya
- Web wizard, kiosk display, CLI, build target Linux desktop — sub-project 2-5
- Perubahan perilaku APA PUN di Electron desktop yang ada — ini refactor murni

## Referensi

- Review kelayakan Fable 5.1 (2026-09-08): urutan dependency sub-project, temuan risiko `tryLoadCredentials()`, rekomendasi `AgentService` sebagai transport-agnostic contract, rekomendasi Ink untuk CLI TUI (sub-project 5)
- Kode asli yang jadi basis ekstraksi: `apps/agent/src/main/{index,ipc,credential-store,app-state,broker,saas-client,engine-manager,device-cache,layout-publisher,startup}.ts`, `apps/agent/src/preload/index.ts`, `apps/agent/electron.vite.config.ts`
