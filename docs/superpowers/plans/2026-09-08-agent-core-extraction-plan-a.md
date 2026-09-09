# Agent Core Extraction — Plan A (Mechanical) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move FTPS/MQTT/discovery/credential/SaaS-client logic out of `apps/agent/src/main/*` into a new platform-agnostic `packages/agent-core`, with 5 injected interfaces (`CredentialStore`, `PathProvider`, `Logger`, `LogFileProvider`, `BuildInfo`) replacing direct Electron/Vite-define coupling, while every moved function stays module-level (no `AgentRuntime`/`AgentService` classification — that's Plan B). `apps/agent` desktop must behave identically at the end, except the deliberate `SAAS_BASE_URL` runtime-config migration documented below.

**Architecture:** Each source file moves as-is except for the 5 coupling points named in the spec: Electron API calls become parameters (interfaces), and the two Vite `define` constants for `SAAS_BASE_URL` become a runtime JSON config file (with the existing env var kept as a first-run seed), while `BuildInfo` (version/commit hash) stays a Vite `define` but is passed as an explicit parameter instead of a bare module-level `declare const`. `apps/agent`'s `ipc.ts`/`index.ts` import from `@3pb/agent-core` and construct the Electron-specific implementations (`SafeStorageCredentialStore`, `ElectronPathProvider`, `ElectronLogAdapter`, `ElectronLogFileProvider`) locally.

**Tech Stack:** TypeScript, Node.js 22, Vitest, pnpm workspaces. New package follows the exact shape of `packages/printer-monitor-core` (`"exports": {".": "./src/index.ts"}`, no build step, consumed as raw TS source by `electron-vite`'s `externalizeDepsPlugin({exclude: WORKSPACE_TS_PACKAGES})`).

**Spec:** [docs/superpowers/specs/2026-09-08-agent-core-extraction-design.md](../specs/2026-09-08-agent-core-extraction-design.md) — this plan implements **Plan A only** (see spec's "Sub-project ini dipecah jadi 2 plan"). Plan B (`AgentRuntime`/`AgentService`) is a separate plan, written after this one is reviewed.

## Global Constraints

- **Nol import Electron** di `packages/agent-core` — setiap titik coupling harus lewat salah satu dari 5 interface (`CredentialStore`, `PathProvider`, `Logger`, `LogFileProvider`, `BuildInfo`), tidak ada `import "electron"` atau `import "electron-log/main"` di package baru ini sama sekali.
- **Fungsi tetap module-level** — jangan bikin class `AgentRuntime`/`AgentService` di plan ini. Dependency (store/logger/dst) dioper sebagai parameter fungsi biasa.
- **Semantik `CredentialLoadResult` 3-outcome wajib eksak**: `{status:"ok", blob}` (file ada, decrypt sukses), `{status:"empty"}` (genuinely first-run, file belum ada — AMAN diaugment sama seperti "ok"), `{status:"degraded", reason}` (encryption tak tersedia ATAU file ada tapi gagal decrypt — JANGAN PERNAH ditimpa). `ensureBrokerPin` HARUS memperlakukan `"empty"` sama amannya dengan `"ok"` (augment blob kosong), dan cuma `"degraded"` yang jatuh ke PIN session-only.
- **`SAAS_BASE_URL` precedence**: `process.env.SAAS_BASE_URL` (kalau di-set saat proses start) > `config.json` field `saasBaseUrl` (kalau sudah ada) > default `https://app.slizebiz.com` (ditulis ke config cuma kalau config belum ada sama sekali DAN env var juga kosong). Config yang SUDAH ADA tidak pernah ditimpa oleh env var.
- **Pesan error yang menyebut "rebuild dengan SAAS_BASE_URL"** (`saas-client.ts:89`, `index.ts:48-51` di kode asli) harus diubah merujuk `config.json`, bukan rebuild.
- **`BuildInfo` TETAP Vite `define`** (bukan ikut dihapus) — cuma `__SAAS_BASE_URL__` yang dihapus dari `electron.vite.config.ts`.
- Setiap task yang memindah file: jalankan `pnpm --filter @3pb/agent test` DAN `pnpm --filter @3pb/agent-core test` sebelum commit, dua-duanya harus hijau.
- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum tiap command pnpm/npx.
- Worktree ini: `/Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-core-extraction`, branch `claude/agent-core-extraction-spec`. Kerja DI SINI, jangan di path lain.

---

## Peta file akhir

```
packages/agent-core/
  package.json, tsconfig.json
  src/
    interfaces.ts              # 5 interface + CredentialLoadResult (Task 2)
    credential-store.ts        # types + generatePin + load/save/ensureBrokerPin/clearBrokerPin (Task 5)
    credential-store-file-aes.ts  # FileAesCredentialStore, dipakai Linux (Task 6)
    printer-model.ts           # (Task 3)
    hms-table.ts                # (Task 4)
    device-cache.ts            # (Task 7)
    discovery/bambu-ssdp.ts, discovery/moonraker-mdns.ts  # (Task 8)
    file-manager/types.ts, bambu-ftps-client.ts, threemf-parser.ts, thumbnail.ts  # (Task 9)
    saas-client.ts             # (Task 10)
    config.ts                  # resolusi SAAS_BASE_URL runtime (Task 11)
    engine-manager.ts, layout-publisher.ts  # (Task 12)
    startup.ts                  # (Task 13)
    local-network.ts            # pickLocalIpCandidates/getLocalIp dari app-state.ts (Task 13)
    index.ts                    # barrel export (ditumbuhkan tiap task)

apps/agent/src/main/
  platform-electron.ts         # SafeStorageCredentialStore, ElectronPathProvider, ElectronLogAdapter, ElectronLogFileProvider, ElectronBuildInfo (Task 6+14)
  ipc.ts                        # rewired imports (Task 14)
  index.ts                      # rewired imports + config.json bootstrap (Task 14)
  credential-store.ts, app-state.ts (partial), device-cache.ts, discovery/, file-manager/, saas-client.ts, engine-manager.ts, layout-publisher.ts, startup.ts, printer-model.ts, hms-table.ts  # DIHAPUS (Task 14, setelah semua caller rewired)

packages/printer-monitor-core/src/hms.ts  # tambah export hmsCodes (Task 4)
apps/agent/electron.vite.config.ts        # WORKSPACE_TS_PACKAGES + hapus __SAAS_BASE_URL__ define (Task 14)
```

---

### Task 1: Scaffold `packages/agent-core`

**Files:**
- Create: `packages/agent-core/package.json`
- Create: `packages/agent-core/tsconfig.json`
- Create: `packages/agent-core/src/index.ts`

**Interfaces:**
- Produces: package `@3pb/agent-core` yang bisa di-`pnpm --filter @3pb/agent-core test` (kosong, lulus trivially) dan di-import package lain via `workspace:*`.

- [ ] **Step 1: Buat `package.json`**

```json
{
  "name": "@3pb/agent-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@3pb/printer-monitor-core": "workspace:*",
    "@3pb/cyd-layout-schema": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^1.6.1",
    "@types/node": "^22"
  }
}
```

- [ ] **Step 2: Buat `tsconfig.json`** (template persis dari `packages/printer-monitor-core/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Buat `src/index.ts`** (barrel kosong, ditumbuhkan tiap task berikutnya)

```ts
export {};
```

- [ ] **Step 4: `pnpm install` di root supaya workspace baru ke-link**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-core-extraction && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm install`
Expected: selesai tanpa error, `node_modules/@3pb/agent-core` ke-symlink.

- [ ] **Step 5: Verifikasi test package baru jalan (kosong tapi harus lulus)**

Run: `cd packages/agent-core && npx vitest run`
Expected: "No test files found" ATAU 0 test — tidak error.

- [ ] **Step 6: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-core-extraction
git add packages/agent-core/package.json packages/agent-core/tsconfig.json packages/agent-core/src/index.ts pnpm-lock.yaml
git commit -m "feat(agent-core): scaffold new platform-agnostic package"
```

---

### Task 2: Interfaces (`packages/agent-core/src/interfaces.ts`)

**Files:**
- Create: `packages/agent-core/src/interfaces.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Produces: `CredentialLoadResult`, `CredentialStore`, `PathProvider`, `Logger`, `LogFileProvider`, `BuildInfo` — dipakai SEMUA task berikutnya di plan ini.

- [ ] **Step 1: Tulis `interfaces.ts`**

```ts
// packages/agent-core/src/interfaces.ts

// "ok" = file ada, decrypt sukses. "empty" = genuinely first-run (file belum ada sama
// sekali) -- AMAN diperlakukan sama seperti "ok" dengan blob kosong (lihat ensureBrokerPin
// di credential-store.ts). "degraded" = enkripsi tak tersedia ATAU file ada tapi gagal
// decrypt -- JANGAN PERNAH ditimpa (data-loss risk), harus fallback ke mode session-only.
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
  // null = tidak ada file log (mis. daemon systemd yang log ke journal, bukan file) --
  // dipakai sub-project 2 nanti, Electron host selalu balikin path nyata.
  getLogFilePath(): string | null;
}

export interface BuildInfo {
  version: string;
  commitHash: string;
}
```

Catatan desain: `CredentialStore<TBlob>` generic (bukan hardcode `CredentialBlob`) supaya `interfaces.ts` tidak perlu import tipe dari `credential-store.ts` (menghindari circular import antar file di package yang sama — `credential-store.ts` yang nanti import `CredentialStore` dari sini, bukan sebaliknya).

- [ ] **Step 2: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./interfaces";
```

- [ ] **Step 3: Verifikasi typecheck**

Run: `cd packages/agent-core && npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-core/src/interfaces.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add CredentialStore/PathProvider/Logger/LogFileProvider/BuildInfo interfaces"
```

---

### Task 3: Pindah `printer-model.ts` (kalibrasi — file paling sederhana, zero Electron dep)

**Files:**
- Create: `packages/agent-core/src/printer-model.ts`
- Create: `packages/agent-core/src/printer-model.test.ts`
- Modify: `packages/agent-core/src/index.ts`
- Delete (di Task 14, BUKAN sekarang): `apps/agent/src/main/printer-model.ts` — untuk task ini, BIARKAN file lama tetap ada, cuma tambah versi baru di core. Caller (`apps/agent/src/main/engine-manager.ts`) TIDAK diubah dulu sampai Task 14 (biar app tetap kompilasi selama migrasi bertahap).

**Interfaces:**
- Consumes: `SaasDevice` (tipe ini masih di `apps/agent/src/main/saas-client.ts` sampai Task 10 memindahkannya — untuk task ini import `SaasDevice` type inline sebagai duplikat minimal di `printer-model.ts` core, karena `matchDeviceByName` cuma butuh `{shortCode: string; label: string}` sebagian dari `SaasDevice`, bukan seluruh interface).
- Produces: `CYD_TYPE_FALLBACK`, `suggestModelFromSsdp`, `matchDeviceByName` — dipakai Task 12 (`engine-manager.ts`).

- [ ] **Step 1: Copy `apps/agent/src/main/printer-model.ts` isinya persis ke lokasi baru, ganti tipe `SaasDevice` jadi inline**

```ts
// packages/agent-core/src/printer-model.ts

/** Dipakai engine-manager.ts kalau Device.model kosong -- "Bambu Lab"/"Klipper" dua-duanya
 * masuk batas 11 byte buffer firmware char type[12] (LAYOUT_LIMITS.maxPrinterModelLength). */
export const CYD_TYPE_FALLBACK: Record<"bambu" | "moonraker", string> = {
  bambu: "Bambu Lab",
  moonraker: "Klipper",
};

// Kode header `DevModel.bambu.com` dari broadcast SSDP LAN Bambu Lab -> model kanonik (ejaan
// sama dengan services/printer-monitor/config.example.json). Header ini didokumentasikan
// publik oleh integrasi open-source pihak ketiga (mis. Home Assistant Bambu Lab, bambulabs_api).
const SSDP_MODEL_CODES: Record<string, string> = {
  "3DPrinter-X1": "X1",
  "3DPrinter-X1-Carbon": "X1C",
  C11: "P1P",
  C12: "P1S",
  C13: "X1E",
  N1: "A1Mini",
  N2S: "A1",
  O1D: "H2D",
};

/** Kode tak dikenal -> null, BUKAN ditebak -- menormalkan string mentah asal-asalan bisa
 * mengirim nilai seperti "3DPrinter-X" ke layar customer, lebih buruk daripada tak menyarankan
 * apa-apa. Warning supaya tabel ini bisa ditumbuhkan dari data lapangan. */
export function suggestModelFromSsdp(devModel: string): string | null {
  const known = SSDP_MODEL_CODES[devModel];
  if (known) return known;
  // String kosong = header `DevModel.bambu.com` absen dari broadcast SSDP (bukan kode tak
  // dikenal) -- tak ada apa pun buat dicatat di sini, warning-nya cuma berguna buat menumbuhkan
  // SSDP_MODEL_CODES dari kode MENTAH yang nyata di lapangan.
  if (devModel === "") return null;
  console.warn(`[printer-model] kode DevModel Bambu tak dikenal, tak disarankan: ${devModel}`);
  return null;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Cari device SaaS yang label-nya paling mirip nama hasil scan -- REKOMENDASI untuk menandai
 * tombol "Pasangkan ke ..." di PairingScreen, bukan keputusan otomatis; user tetap pilih sendiri. */
export function matchDeviceByName(devName: string, devices: { shortCode: string; label: string }[]): string | null {
  const target = normalizeForMatch(devName);
  const match = devices.find((d) => normalizeForMatch(d.label) === target);
  return match?.shortCode ?? null;
}
```

- [ ] **Step 2: Copy test-nya, ganti import path**

Baca `apps/agent/src/main/printer-model.test.ts` isi lengkapnya dulu (`cat apps/agent/src/main/printer-model.test.ts`), lalu salin PERSIS ke `packages/agent-core/src/printer-model.test.ts`, satu-satunya perubahan adalah baris `import ... from "./printer-model"` (path relatif tetap sama karena struktur folder-nya identik — tidak perlu diubah). Kalau ada test yang memakai tipe `SaasDevice` penuh sebagai fixture, sesuaikan fixture-nya ke bentuk `{shortCode, label}` minimal sesuai signature baru.

- [ ] **Step 3: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/printer-model.test.ts`
Expected: PASS, jumlah test sama persis dengan `apps/agent/src/main/printer-model.test.ts`.

- [ ] **Step 4: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts (tambahkan baris)
export * from "./printer-model";
```

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/printer-model.ts packages/agent-core/src/printer-model.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): move printer-model.ts (zero Electron dependency, calibration move)"
```

---

### Task 4: `hmsCodes` export di `printer-monitor-core` + pindah `hms-table.ts`

**Files:**
- Modify: `packages/printer-monitor-core/src/hms.ts`
- Create: `packages/agent-core/src/hms-table.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Produces: `hmsTable: Record<string,string>` (agent-core) — dipakai Task 12 (`engine-manager.ts`).

**Masalah yang diperbaiki**: `apps/agent/src/main/hms-table.ts` sekarang import JSON lewat path relatif lintas-package (`../../../../packages/printer-monitor-core/src/hms-codes.json`) yang bakal patah kalau file dipindah. Perbaikannya: `printer-monitor-core` re-export data JSON-nya sebagai named export lewat entry point package-nya sendiri.

- [ ] **Step 1: Baca `packages/printer-monitor-core/src/hms.ts` dulu untuk konfirmasi struktur yang ada**

Sudah dikonfirmasi: file ini punya `loadBundled()` privat yang baca `hms-codes.json` via `new URL(..., import.meta.url)`. Tambahkan named export baru di file yang sama TANPA mengubah `loadBundled`/`HmsLookup` yang sudah ada.

- [ ] **Step 2: Tambah export `hmsCodes` di `hms.ts`**

```ts
// packages/printer-monitor-core/src/hms.ts — tambahkan di dekat bagian atas file, setelah import yang ada
import hmsCodesJson from "./hms-codes.json";

// Named export dari JSON yang sama yang dipakai HmsLookup's loadBundled() secara internal --
// disediakan supaya package lain (agent-core) bisa import data-nya lewat entry point package
// ini, bukan path relatif lintas-package yang rapuh (patah kalau struktur folder berubah).
export const hmsCodes: Record<string, string> = hmsCodesJson as Record<string, string>;
```

- [ ] **Step 3: Jalankan test printer-monitor-core, pastikan tidak regresi**

Run: `cd packages/printer-monitor-core && npx vitest run`
Expected: semua test yang sudah ada tetap PASS (tidak ada test baru dibutuhkan — ini cuma nambah export, tidak mengubah perilaku `HmsLookup`/`loadBundled` yang sudah ada dan sudah punya test sendiri).

- [ ] **Step 4: Buat `hms-table.ts` baru di core, import dari package (bukan path relatif JSON lagi)**

```ts
// packages/agent-core/src/hms-table.ts
import { hmsCodes } from "@3pb/printer-monitor-core";

export const hmsTable: Record<string, string> = hmsCodes;
```

- [ ] **Step 5: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts (tambahkan baris)
export * from "./hms-table";
```

- [ ] **Step 6: Verifikasi typecheck & test**

Run: `cd packages/agent-core && npx tsc --noEmit && npx vitest run`
Expected: tidak ada error, semua test lulus.

- [ ] **Step 7: Commit**

```bash
git add packages/printer-monitor-core/src/hms.ts packages/agent-core/src/hms-table.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): export hmsCodes from printer-monitor-core, move hms-table.ts off relative cross-package JSON import"
```

---

### Task 5: Credential store core — types + `generatePin`/`loadCredentials`/`saveCredentials`/`ensureBrokerPin`/`clearBrokerPin`

**Files:**
- Create: `packages/agent-core/src/credential-store.ts`
- Create: `packages/agent-core/src/credential-store.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `CredentialStore<TBlob>`, `CredentialLoadResult<TBlob>`, `Logger` (Task 2).
- Produces: `DeviceSecret`, `CredentialBlob`, `loadCredentials(store): Promise<CredentialBlob>`, `saveCredentials(store, blob): Promise<void>`, `ensureBrokerPin(store, logger): Promise<string>`, `clearBrokerPin(blob): CredentialBlob` — dipakai Task 6 (adapter), Task 13 (startup.ts), Task 14 (ipc.ts/index.ts rewiring).

Ini area regresi paling berisiko di seluruh plan (per spec) — `ensureBrokerPin` HARUS memperlakukan `"empty"` (genuinely first-run) SAMA amannya dengan `"ok"` (augment blob), dan CUMA `"degraded"` yang jatuh ke PIN session-only. Test karakterisasi eksplisit untuk ketiga outcome WAJIB ada sebelum task ini dianggap selesai.

- [ ] **Step 1: Tulis test yang gagal dulu — karakterisasi 3-outcome `ensureBrokerPin`**

```ts
// packages/agent-core/src/credential-store.test.ts
import { describe, it, expect, vi } from "vitest";
import { loadCredentials, saveCredentials, ensureBrokerPin, clearBrokerPin, type CredentialBlob } from "./credential-store";
import type { CredentialStore, CredentialLoadResult, Logger } from "./interfaces";

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeStore(initial: CredentialLoadResult<CredentialBlob>): CredentialStore<CredentialBlob> & { saved: CredentialBlob[] } {
  const saved: CredentialBlob[] = [];
  let current = initial;
  return {
    saved,
    async load() {
      return current;
    },
    async save(blob) {
      saved.push(blob);
      current = { status: "ok", blob };
    },
    isEncryptionAvailable() {
      return true;
    },
  };
}

describe("loadCredentials", () => {
  it("status ok -> balikin blob-nya", async () => {
    const store = makeStore({ status: "ok", blob: { agentToken: "t", devices: {} } });
    expect(await loadCredentials(store)).toEqual({ agentToken: "t", devices: {} });
  });

  it("status empty -> balikin blob kosong", async () => {
    const store = makeStore({ status: "empty" });
    expect(await loadCredentials(store)).toEqual({ agentToken: null, devices: {} });
  });

  it("status degraded -> balikin blob kosong (BUKAN throw)", async () => {
    const store = makeStore({ status: "degraded", reason: "decrypt_failed" });
    expect(await loadCredentials(store)).toEqual({ agentToken: null, devices: {} });
  });
});

describe("ensureBrokerPin", () => {
  it("status ok dengan brokerPin sudah ada -> balikin PIN yang sama, tidak save ulang", async () => {
    const store = makeStore({ status: "ok", blob: { agentToken: "t", devices: {}, brokerPin: "1234" } });
    const pin = await ensureBrokerPin(store, makeLogger());
    expect(pin).toBe("1234");
    expect(store.saved).toHaveLength(0);
  });

  it("status ok TANPA brokerPin -> generate PIN baru, save dengan blob asli dipertahankan (augment, bukan timpa)", async () => {
    const store = makeStore({ status: "ok", blob: { agentToken: "existing-token", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } } } });
    const pin = await ensureBrokerPin(store, makeLogger());
    expect(pin).toMatch(/^\d{4}$/);
    expect(store.saved).toEqual([{ agentToken: "existing-token", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } }, brokerPin: pin }]);
  });

  it("status EMPTY (genuinely first-run) -> DIPERLAKUKAN SAMA AMANNYA seperti ok: generate PIN, save blob kosong+PIN", async () => {
    const store = makeStore({ status: "empty" });
    const pin = await ensureBrokerPin(store, makeLogger());
    expect(pin).toMatch(/^\d{4}$/);
    expect(store.saved).toEqual([{ agentToken: null, devices: {}, brokerPin: pin }]);
  });

  it("status DEGRADED -> PIN session-only, TIDAK PERNAH memanggil save (data-loss risk)", async () => {
    const store = makeStore({ status: "degraded", reason: "decrypt_failed" });
    const logger = makeLogger();
    const pin = await ensureBrokerPin(store, logger);
    expect(pin).toMatch(/^\d{4}$/);
    expect(store.saved).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("clearBrokerPin", () => {
  it("hapus field brokerPin dari blob, pure function tanpa I/O", () => {
    const blob: CredentialBlob = { agentToken: "t", devices: {}, brokerPin: "1234" };
    expect(clearBrokerPin(blob)).toEqual({ agentToken: "t", devices: {}, brokerPin: undefined });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/credential-store.test.ts`
Expected: FAIL — `credential-store.ts` belum ada.

- [ ] **Step 3: Implementasi `credential-store.ts`**

```ts
// packages/agent-core/src/credential-store.ts
import { randomInt } from "node:crypto";
import type { CredentialStore, Logger } from "./interfaces";

export interface DeviceSecret {
  ip: string;
  serial: string;
  accessCode: string;
}

export interface CredentialBlob {
  agentToken: string | null;
  devices: Record<string, DeviceSecret>;
  // String (bukan number) supaya leading zero ("0042") tak hilang. Opsional -- blob lama
  // (pra-fitur ini) tak punya field ini sama sekali, bukan error.
  brokerPin?: string;
}

const EMPTY_BLOB: CredentialBlob = { agentToken: null, devices: {} };

/** Tak pernah throw — status "empty" MAUPUN "degraded" (file absen/gagal decrypt/enkripsi tak
 * tersedia) semuanya jadi blob kosong (minta pairing ulang). Pemanggil yang butuh bedakan
 * "empty" dari "degraded" (mis. ensureBrokerPin, health-check startup) pakai store.load() langsung. */
export async function loadCredentials(store: CredentialStore<CredentialBlob>): Promise<CredentialBlob> {
  const result = await store.load();
  return result.status === "ok" ? result.blob : EMPTY_BLOB;
}

export async function saveCredentials(store: CredentialStore<CredentialBlob>, blob: CredentialBlob): Promise<void> {
  await store.save(blob);
}

function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

/**
 * Bootstrap PIN broker -- dipanggil SEKALI tiap startup (host bootstrap), TANPA user di loop,
 * jadi harus hati-hati soal timpa-data: kasus paling umum di dunia nyata -- user upgrade dari
 * versi sebelum fitur PIN ada -- punya file yang decrypt-nya SUKSES tapi belum ada brokerPin,
 * dan itu aman diaugment (data asli sudah di tangan). Kasus "empty" (genuinely first-run, file
 * belum ada sama sekali) SAMA AMANNYA -- tak ada data lama yang bisa hilang. Yang TIDAK boleh
 * ditimpa cuma "degraded" (decrypt GENUINELY gagal / enkripsi tak tersedia) -- di situ
 * agentToken & DeviceSecret lama berisiko hilang permanen kalau kita generate+save PIN begitu saja.
 */
export async function ensureBrokerPin(store: CredentialStore<CredentialBlob>, logger: Logger): Promise<string> {
  const result = await store.load();
  if (result.status === "ok" && result.blob.brokerPin) return result.blob.brokerPin;

  const pin = generatePin();
  if (result.status === "degraded") {
    // Jangan pernah log nilai PIN -- cuma catat bahwa bootstrap jatuh ke mode session-only.
    logger.error(
      "[credential-store] tak bisa simpan PIN baru dengan aman (file ada tapi gagal didekripsi, atau enkripsi tak tersedia) -- pakai PIN session-only untuk run ini",
    );
    return pin;
  }
  // "ok" (augment blob asli) MAUPUN "empty" (augment blob kosong -- genuinely first-run) dua-duanya
  // aman disave di sini, karena tak ada data lama yang berisiko tertimpa buta.
  const blob = result.status === "ok" ? result.blob : EMPTY_BLOB;
  await store.save({ ...blob, brokerPin: pin });
  return pin;
}

/** Pure function, no I/O -- hapus brokerPin dari blob (dipakai future regenerate action / support guidance), BUKAN hapus seluruh file credentials. */
export function clearBrokerPin(blob: CredentialBlob): CredentialBlob {
  return { ...blob, brokerPin: undefined };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/credential-store.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts (tambahkan baris)
export * from "./credential-store";
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/credential-store.ts packages/agent-core/src/credential-store.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add platform-agnostic credential-store core with 3-outcome load semantics"
```

---

### Task 6: `CredentialStore` implementations — `SafeStorageCredentialStore` (Electron) + `FileAesCredentialStore` (Linux, reusable)

**Files:**
- Create: `apps/agent/src/main/platform-electron.ts`
- Create: `apps/agent/src/main/platform-electron.test.ts`
- Create: `packages/agent-core/src/credential-store-file-aes.ts`
- Create: `packages/agent-core/src/credential-store-file-aes.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `CredentialStore<CredentialBlob>`, `CredentialLoadResult<CredentialBlob>` (Task 2), `CredentialBlob` (Task 5).
- Produces: `SafeStorageCredentialStore` (kelas, `apps/agent`, dipakai Task 14), `FileAesCredentialStore` (kelas, `packages/agent-core`, dipakai sub-project 2 dan sub-project 4 nanti — TIDAK dipakai `apps/agent` Win/Mac di plan ini, tapi disiapkan supaya sub-project 4 tinggal pakai).

**`FileAesCredentialStore` masuk `packages/agent-core`** (bukan `apps/agent`) karena implementasinya murni Node `crypto`+`fs`, nol dependency Electron — dipakai ulang oleh daemon headless (sub-project 2) DAN Electron Linux desktop (sub-project 4), keduanya butuh implementasi yang identik.

- [ ] **Step 1: Tulis test yang gagal untuk `SafeStorageCredentialStore` (port perilaku persis dari `credential-store.ts` lama)**

Baca dulu `apps/agent/src/main/credential-store.test.ts` yang sudah ada (sudah dibaca sebelumnya — pola mock `vi.mock("electron", ...)` dan `vi.mock("node:fs", ...)`), lalu tulis test baru dengan pola yang sama tapi menguji kelas `SafeStorageCredentialStore`, bukan fungsi module-level lama:

```ts
// apps/agent/src/main/platform-electron.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/fake/userdata") },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`ENC(${s})`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace(/^ENC\(/, "").replace(/\)$/, "")),
  },
}));
vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
}));

import { SafeStorageCredentialStore } from "./platform-electron";
import { safeStorage } from "electron";
import fs from "node:fs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SafeStorageCredentialStore.load", () => {
  it("enkripsi tak tersedia -> status degraded", async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "degraded", reason: "encryption_unavailable" });
  });

  it("file belum ada -> status empty", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "empty" });
  });

  it("file ada, decrypt sukses -> status ok + blob", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("ENC({\"agentToken\":\"t\",\"devices\":{}})"));
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "t", devices: {} } });
  });

  it("file ada tapi decrypt gagal (corrupt/key beda) -> status degraded, BUKAN empty", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("garbage"));
    vi.mocked(safeStorage.decryptString).mockImplementation(() => { throw new Error("bad key"); });
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "degraded", reason: "decrypt_failed" });
  });
});

describe("SafeStorageCredentialStore.save", () => {
  it("bikin folder kalau belum ada, tulis file terenkripsi", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const store = new SafeStorageCredentialStore();
    await store.save({ agentToken: "t", devices: {} });
    expect(fs.mkdirSync).toHaveBeenCalledWith("/fake/userdata", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/platform-electron.test.ts`
Expected: FAIL — `platform-electron.ts` belum ada.

- [ ] **Step 3: Implementasi `SafeStorageCredentialStore` di `platform-electron.ts`**

```ts
// apps/agent/src/main/platform-electron.ts
import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { CredentialStore, CredentialLoadResult } from "@3pb/agent-core";
import type { CredentialBlob } from "@3pb/agent-core";

export class SafeStorageCredentialStore implements CredentialStore<CredentialBlob> {
  private credentialFilePath(): string {
    return path.join(app.getPath("userData"), "credentials.enc");
  }

  async load(): Promise<CredentialLoadResult<CredentialBlob>> {
    if (!safeStorage.isEncryptionAvailable()) return { status: "degraded", reason: "encryption_unavailable" };
    const filePath = this.credentialFilePath();
    if (!fs.existsSync(filePath)) return { status: "empty" };
    try {
      const encrypted = fs.readFileSync(filePath);
      const decrypted = safeStorage.decryptString(encrypted);
      return { status: "ok", blob: JSON.parse(decrypted) as CredentialBlob };
    } catch {
      return { status: "degraded", reason: "decrypt_failed" };
    }
  }

  async save(blob: CredentialBlob): Promise<void> {
    const dir = app.getPath("userData");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(blob));
    fs.writeFileSync(this.credentialFilePath(), encrypted);
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/main/platform-electron.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Tulis test yang gagal untuk `FileAesCredentialStore` (baru, belum ada perilaku lama untuk dibandingkan — desain baru)**

```ts
// packages/agent-core/src/credential-store-file-aes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAesCredentialStore } from "./credential-store-file-aes";

describe("FileAesCredentialStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-core-file-aes-"));
  });

  it("belum ada file key/data -> status empty", async () => {
    const store = new FileAesCredentialStore(dir);
    expect(await store.load()).toEqual({ status: "empty" });
  });

  it("save lalu load -> roundtrip status ok dengan blob yang sama", async () => {
    const store = new FileAesCredentialStore(dir);
    await store.save({ agentToken: "t", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } } });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "t", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } } } });
  });

  it("data file ada tapi key file hilang -> status degraded (BUKAN empty -- data-loss risk kalau salah petakan)", async () => {
    const store = new FileAesCredentialStore(dir);
    await store.save({ agentToken: "t", devices: {} });
    rmSync(join(dir, "credentials.key"));
    const store2 = new FileAesCredentialStore(dir);
    expect(await store2.load()).toEqual({ status: "degraded", reason: "key_missing" });
  });

  it("isEncryptionAvailable selalu true (file-AES tak bergantung service eksternal)", () => {
    const store = new FileAesCredentialStore(dir);
    expect(store.isEncryptionAvailable()).toBe(true);
  });
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/credential-store-file-aes.test.ts`
Expected: FAIL — file belum ada.

- [ ] **Step 7: Implementasi `FileAesCredentialStore`**

```ts
// packages/agent-core/src/credential-store-file-aes.ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CredentialStore, CredentialLoadResult } from "./interfaces";
import type { CredentialBlob } from "./credential-store";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

/**
 * CredentialStore buat semua target Linux (headless daemon MAUPUN Electron Linux desktop) --
 * key AES-256 disimpan sebagai file terpisah permission 0600 di direktori yang sama dengan
 * data terenkripsi. Model ancaman: box dicuri/diakses fisik = user itu juga sudah kompromise
 * data lain di mesin yang sama -- setara asumsi yang dipakai kebanyakan aplikasi self-hosted
 * yang simpan secret di filesystem dengan permission ketat, bukan OS keyring.
 */
export class FileAesCredentialStore implements CredentialStore<CredentialBlob> {
  constructor(private readonly dataDir: string) {}

  private keyFilePath(): string {
    return path.join(this.dataDir, "credentials.key");
  }

  private dataFilePath(): string {
    return path.join(this.dataDir, "credentials.enc");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private loadOrCreateKey(): Buffer {
    if (fs.existsSync(this.keyFilePath())) {
      return fs.readFileSync(this.keyFilePath());
    }
    const key = randomBytes(KEY_LENGTH);
    this.ensureDir();
    fs.writeFileSync(this.keyFilePath(), key, { mode: 0o600 });
    return key;
  }

  async load(): Promise<CredentialLoadResult<CredentialBlob>> {
    const dataExists = fs.existsSync(this.dataFilePath());
    const keyExists = fs.existsSync(this.keyFilePath());

    if (!dataExists && !keyExists) return { status: "empty" };
    // Data ada tapi key hilang -- ini KASUS DEGRADED, bukan empty, walau secara teknis "tidak
    // ada apa-apa yang bisa dibaca sekarang" -- ada data lama di disk yang berisiko hilang
    // permanen kalau kita perlakukan seolah first-run dan generate PIN/blob baru menimpanya.
    if (dataExists && !keyExists) return { status: "degraded", reason: "key_missing" };
    if (!dataExists && keyExists) return { status: "empty" }; // key ada tanpa data = belum pernah save, aman

    try {
      const key = fs.readFileSync(this.keyFilePath());
      const raw = fs.readFileSync(this.dataFilePath());
      const iv = raw.subarray(0, IV_LENGTH);
      const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
      const ciphertext = raw.subarray(IV_LENGTH + 16);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return { status: "ok", blob: JSON.parse(decrypted.toString("utf8")) as CredentialBlob };
    } catch {
      return { status: "degraded", reason: "decrypt_failed" };
    }
  }

  async save(blob: CredentialBlob): Promise<void> {
    this.ensureDir();
    const key = this.loadOrCreateKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(JSON.stringify(blob), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    fs.writeFileSync(this.dataFilePath(), Buffer.concat([iv, authTag, ciphertext]), { mode: 0o600 });
  }

  isEncryptionAvailable(): boolean {
    return true;
  }
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/credential-store-file-aes.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 9: Tambahkan ke barrel core**

```ts
// packages/agent-core/src/index.ts (tambahkan baris)
export * from "./credential-store-file-aes";
```

- [ ] **Step 10: Commit**

```bash
git add apps/agent/src/main/platform-electron.ts apps/agent/src/main/platform-electron.test.ts packages/agent-core/src/credential-store-file-aes.ts packages/agent-core/src/credential-store-file-aes.test.ts packages/agent-core/src/index.ts
git commit -m "feat: add SafeStorageCredentialStore (Electron) and FileAesCredentialStore (Linux) implementations"
```

---

### Task 7: Pindah `device-cache.ts` (parameterisasi `PathProvider`)

**Files:**
- Create: `packages/agent-core/src/device-cache.ts`
- Create: `packages/agent-core/src/device-cache.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `PathProvider` (Task 2).
- Produces: `CachedDevice`, `loadDeviceCache(pathProvider)`, `saveDeviceCache(pathProvider, devices)` — dipakai Task 13 (`startup.ts`).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// packages/agent-core/src/device-cache.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
}));

import { loadDeviceCache, saveDeviceCache } from "./device-cache";
import fs from "node:fs";
import type { PathProvider } from "./interfaces";

const pathProvider: PathProvider = { userDataDir: () => "/fake/userdata" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadDeviceCache", () => {
  it("file belum ada -> balikin array kosong", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await loadDeviceCache(pathProvider)).toEqual([]);
  });

  it("file ada -> parse JSON-nya", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ shortCode: "ABC", label: "Printer A", printerType: "bambu" }]));
    expect(await loadDeviceCache(pathProvider)).toEqual([{ shortCode: "ABC", label: "Printer A", printerType: "bambu" }]);
  });

  it("file corrupt (JSON invalid) -> balikin array kosong, bukan throw", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("not json");
    expect(await loadDeviceCache(pathProvider)).toEqual([]);
  });
});

describe("saveDeviceCache", () => {
  it("bikin folder kalau belum ada, tulis JSON", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await saveDeviceCache(pathProvider, [{ shortCode: "ABC", label: "Printer A", printerType: "bambu" }]);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/fake/userdata", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/device-cache.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```ts
// packages/agent-core/src/device-cache.ts
import fs from "node:fs";
import path from "node:path";
import type { PathProvider } from "./interfaces";

export interface CachedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  model?: string | null;
}

function cacheFilePath(pathProvider: PathProvider): string {
  return path.join(pathProvider.userDataDir(), "device-cache.json");
}

/** Non-rahasia (label/tipe doang) — plain JSON, TANPA enkripsi. Dipakai rekonstruksi Engine pas SaaS unreachable. */
export async function loadDeviceCache(pathProvider: PathProvider): Promise<CachedDevice[]> {
  const filePath = cacheFilePath(pathProvider);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CachedDevice[];
  } catch {
    return [];
  }
}

export async function saveDeviceCache(pathProvider: PathProvider, devices: CachedDevice[]): Promise<void> {
  const dir = pathProvider.userDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cacheFilePath(pathProvider), JSON.stringify(devices));
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/device-cache.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./device-cache";
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/device-cache.ts packages/agent-core/src/device-cache.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): move device-cache.ts, parameterize with PathProvider"
```

---

### Task 8: Pindah `discovery/bambu-ssdp.ts` + `discovery/moonraker-mdns.ts` (zero Electron dep, mechanical)

**Files:**
- Create: `packages/agent-core/src/discovery/bambu-ssdp.ts`
- Create: `packages/agent-core/src/discovery/bambu-ssdp.test.ts`
- Create: `packages/agent-core/src/discovery/moonraker-mdns.ts`
- Create: `packages/agent-core/src/discovery/moonraker-mdns.test.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/package.json` (tambah dependency `bonjour-service`)

**Interfaces:**
- Produces: `scanBambu`, `scanMoonraker`, `DiscoveredBambuPrinter`, `DiscoveredMoonrakerPrinter`, `ScanResult` — dipakai Task 14 (`ipc.ts`).

- [ ] **Step 1: Tambah dependency**

```bash
cd packages/agent-core && pnpm add bonjour-service
```

- [ ] **Step 2: Copy `bambu-ssdp.ts` persis, tanpa perubahan (nol Electron dependency di file asli)**

```ts
// packages/agent-core/src/discovery/bambu-ssdp.ts
import dgram from "node:dgram";

export interface DiscoveredBambuPrinter {
  ip: string;
  serial: string;
  model: string;
  name: string;
}

export type ScanResult =
  | { ok: true; printers: DiscoveredBambuPrinter[] }
  | { ok: false; reason: "port_in_use" };

const PORTS = [2021, 1900];

export function parseSsdpPacket(buf: Buffer, sourceIp: string): DiscoveredBambuPrinter | null {
  const text = buf.toString("utf8");
  const lines = text.split("\r\n").filter(Boolean);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const isBambu = Object.keys(headers).some((k) => k.toLowerCase().includes("bambu"));
  if (!isBambu) return null;
  return {
    ip: sourceIp,
    serial: headers["USN"] ?? "",
    model: headers["DevModel.bambu.com"] ?? "",
    name: headers["DevName.bambu.com"] ?? "",
  };
}

/** Scan broadcast SSDP Bambu selama `durationMs`. Coba SEMUA port sekaligus (reuseAddr:true —
 * sering bisa koeksis dengan BambuStudio di Windows); kalau SEMUA gagal bind EADDRINUSE, balikin
 * ok:false supaya UI bisa tampilkan pesan "Tutup BambuStudio dulu" (bukan diam-diam kosong). */
export function scanBambu(durationMs = 20_000): Promise<ScanResult> {
  return new Promise((resolve) => {
    const seen = new Map<string, DiscoveredBambuPrinter>();
    const sockets: ReturnType<typeof dgram.createSocket>[] = [];
    let boundCount = 0;
    let errorCount = 0;
    let settled = false;

    function finish(result: ScanResult) {
      if (settled) return;
      settled = true;
      for (const s of sockets) s.close();
      resolve(result);
    }

    for (const port of PORTS) {
      const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
      sockets.push(sock);
      sock.on("error", () => {
        errorCount++;
        if (errorCount === PORTS.length && boundCount === 0) {
          finish({ ok: false, reason: "port_in_use" });
        }
      });
      sock.on("message", (msg, rinfo) => {
        const parsed = parseSsdpPacket(msg, rinfo.address);
        if (!parsed) return;
        seen.set(parsed.serial || parsed.ip, parsed);
      });
      sock.bind(port, () => {
        boundCount++;
      });
    }

    setTimeout(() => finish({ ok: true, printers: [...seen.values()] }), durationMs);
  });
}
```

- [ ] **Step 3: Copy test-nya**

Baca `apps/agent/src/main/discovery/bambu-ssdp.test.ts` isi lengkap, salin PERSIS ke `packages/agent-core/src/discovery/bambu-ssdp.test.ts` (path import relatif `./bambu-ssdp` tetap sama, tidak perlu diubah).

- [ ] **Step 4: Copy `moonraker-mdns.ts` persis**

```ts
// packages/agent-core/src/discovery/moonraker-mdns.ts
import { Bonjour } from "bonjour-service";

export interface DiscoveredMoonrakerPrinter {
  ip: string;
  name: string;
}

function isIPv4(addr: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(addr);
}

export function scanMoonraker(durationMs = 5_000): Promise<DiscoveredMoonrakerPrinter[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found: DiscoveredMoonrakerPrinter[] = [];
    const browser = bonjour.find({ type: "moonraker", protocol: "tcp" });
    browser.on("up", (service: { name: string; addresses?: string[] }) => {
      const ip = (service.addresses ?? []).find(isIPv4);
      if (!ip) return;
      found.push({ ip, name: service.name });
    });
    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve(found);
    }, durationMs);
  });
}
```

- [ ] **Step 5: Copy test-nya**

Baca `apps/agent/src/main/discovery/moonraker-mdns.test.ts` isi lengkap, salin PERSIS ke `packages/agent-core/src/discovery/moonraker-mdns.test.ts`.

- [ ] **Step 6: Jalankan kedua test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/discovery/`
Expected: PASS, jumlah test sama persis dengan gabungan `apps/agent/src/main/discovery/*.test.ts`.

- [ ] **Step 7: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./discovery/bambu-ssdp";
export * from "./discovery/moonraker-mdns";
```

- [ ] **Step 8: Commit**

```bash
git add packages/agent-core/src/discovery/ packages/agent-core/src/index.ts packages/agent-core/package.json pnpm-lock.yaml
git commit -m "feat(agent-core): move discovery/bambu-ssdp.ts and discovery/moonraker-mdns.ts"
```

---

### Task 9: Pindah `file-manager/*` + ekstrak logic thumbnail dari `ipc.ts`

**Files:**
- Create: `packages/agent-core/src/file-manager/types.ts`
- Create: `packages/agent-core/src/file-manager/bambu-ftps-client.ts`
- Create: `packages/agent-core/src/file-manager/bambu-ftps-client.test.ts`
- Create: `packages/agent-core/src/file-manager/threemf-parser.ts`
- Create: `packages/agent-core/src/file-manager/threemf-parser.test.ts`
- Create: `packages/agent-core/src/file-manager/thumbnail.ts` (BARU — logic yang sekarang "terkubur" di `ipc.ts`)
- Create: `packages/agent-core/src/file-manager/thumbnail.test.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/package.json` (tambah `basic-ftp`, `jszip`, `fast-xml-parser`)

**Interfaces:**
- Produces: `PrinterFileEntry`, `PrinterFileClient`, `BambuFtpsClient`, `PlateInfo`, `PlateFilament`, `parseThreemf`, `findPlateThumbnail`, `extractGcodeThumbnail` — dipakai Task 14 (`ipc.ts`).

- [ ] **Step 1: Tambah dependency**

```bash
cd packages/agent-core && pnpm add basic-ftp jszip fast-xml-parser
```

- [ ] **Step 2: Copy `types.ts`, `bambu-ftps-client.ts`, `threemf-parser.ts` PERSIS (nol Electron dependency di ketiganya)**

```ts
// packages/agent-core/src/file-manager/types.ts
export interface PrinterFileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

export interface PrinterFileClient {
  list(path: string): Promise<PrinterFileEntry[]>;
  upload(localPath: string, remotePath: string): Promise<void>;
  download(remotePath: string, localPath: string): Promise<void>;
  delete(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}
```

```ts
// packages/agent-core/src/file-manager/bambu-ftps-client.ts
import { Client, type FileInfo } from "basic-ftp";
import type { PrinterFileClient, PrinterFileEntry } from "./types";

const BAMBU_FTPS_USER = "bblp";
const BAMBU_FTPS_PORT = 990;

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

function toEntry(dir: string, info: FileInfo): PrinterFileEntry {
  return {
    name: info.name,
    path: joinPath(dir, info.name),
    size: info.size,
    isDirectory: info.isDirectory,
    modifiedAt: new Date(info.modifiedAt ?? Date.now()).toISOString(),
  };
}

export class BambuFtpsClient implements PrinterFileClient {
  constructor(
    private readonly ip: string,
    private readonly accessCode: string,
  ) {}

  private async withConnection<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client();
    try {
      await client.access({
        host: this.ip,
        port: BAMBU_FTPS_PORT,
        user: BAMBU_FTPS_USER,
        password: this.accessCode,
        secure: "implicit",
        // Bambu printers pakai sertifikat TLS self-signed di FTPS-nya -- jangan hapus flag
        // ini untuk "memperbaiki" keamanan, koneksi akan selalu gagal verifikasi kalau iya.
        secureOptions: { rejectUnauthorized: false },
      });
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async list(path: string): Promise<PrinterFileEntry[]> {
    return this.withConnection(async (client) => {
      const raw = await client.list(path);
      return raw.map((info) => toEntry(path, info));
    });
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    await this.withConnection((client) => client.uploadFrom(localPath, remotePath));
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.withConnection((client) => client.downloadTo(localPath, remotePath));
  }

  async delete(remotePath: string): Promise<void> {
    await this.withConnection((client) => client.remove(remotePath));
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.withConnection((client) => client.rename(oldPath, newPath));
  }
}
```

```ts
// packages/agent-core/src/file-manager/threemf-parser.ts
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export interface PlateFilament {
  id: number;
  color: string;
  type: string;
  amsSlot: number;
}

export interface PlateInfo {
  index: number;
  filaments: PlateFilament[];
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

interface RawFilament {
  id: string;
  color: string;
  type: string;
}

interface RawMetadata {
  key: string;
  value: string;
}

interface RawPlate {
  metadata?: RawMetadata | RawMetadata[];
  filament?: RawFilament | RawFilament[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePlate(raw: RawPlate, fallbackIndex: number): PlateInfo {
  const metadata = toArray(raw.metadata);
  const indexMeta = metadata.find((m) => m.key === "index");
  const index = indexMeta ? Number(indexMeta.value) : fallbackIndex;

  const filamentMapsMeta = metadata.find((m) => m.key === "filament_maps");
  const amsSlots = filamentMapsMeta ? filamentMapsMeta.value.trim().split(/\s+/).map(Number) : [];

  const filaments = toArray(raw.filament).map((f, i) => ({
    id: Number(f.id),
    color: f.color,
    type: f.type,
    amsSlot: amsSlots[i] ?? 1,
  }));

  return { index, filaments };
}

export async function parseThreemf(buffer: Buffer): Promise<PlateInfo[]> {
  const zip = await JSZip.loadAsync(buffer);
  const sliceInfoFile = zip.file("Metadata/slice_info.config");
  if (!sliceInfoFile) {
    throw new Error("not_bambu_3mf");
  }

  const xml = await sliceInfoFile.async("string");
  const parsed = xmlParser.parse(xml) as { config?: { plate?: RawPlate | RawPlate[] } };
  const rawPlates = toArray(parsed.config?.plate);

  return rawPlates.map((raw, i) => parsePlate(raw, i + 1));
}
```

- [ ] **Step 3: Copy test `bambu-ftps-client.test.ts` dan `threemf-parser.test.ts` PERSIS**

Baca `apps/agent/src/main/file-manager/bambu-ftps-client.test.ts` dan `apps/agent/src/main/file-manager/threemf-parser.test.ts` isi lengkap masing-masing, salin PERSIS ke lokasi baru (path import relatif tidak berubah).

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/file-manager/bambu-ftps-client.test.ts src/file-manager/threemf-parser.test.ts`
Expected: PASS, jumlah test sama dengan versi lama.

- [ ] **Step 5: Tulis test yang gagal untuk `thumbnail.ts` BARU — ekstraksi logic yang sekarang terkubur di `ipc.ts:291-321`**

```ts
// packages/agent-core/src/file-manager/thumbnail.test.ts
import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { findPlateThumbnail, extractGcodeThumbnail } from "./thumbnail";

describe("findPlateThumbnail", () => {
  it("ada plate_1.png -> balikin itu", async () => {
    const zip = new JSZip();
    zip.file("Metadata/plate_1.png", "fake-png-1");
    zip.file("Metadata/plate_1_small.png", "fake-png-1-small");
    const found = findPlateThumbnail(zip);
    expect(found).not.toBeNull();
    expect(await found!.async("string")).toBe("fake-png-1");
  });

  it("tak ada plate_1.png tapi ada plate_1_small.png -> fallback ke situ", async () => {
    const zip = new JSZip();
    zip.file("Metadata/plate_1_small.png", "fake-small");
    const found = findPlateThumbnail(zip);
    expect(await found!.async("string")).toBe("fake-small");
  });

  it("tak ada plate_1 sama sekali -> fallback ke plate_N.png pertama secara URUT NUMERIK (bukan string)", async () => {
    const zip = new JSZip();
    zip.file("Metadata/plate_11.png", "plate-11");
    zip.file("Metadata/plate_3.png", "plate-3");
    const found = findPlateThumbnail(zip);
    // urut numerik: 3 < 11, BUKAN urut string ("11" < "3")
    expect(await found!.async("string")).toBe("plate-3");
  });

  it("tak ada thumbnail sama sekali -> null", () => {
    const zip = new JSZip();
    zip.file("Metadata/slice_info.config", "<config/>");
    expect(findPlateThumbnail(zip)).toBeNull();
  });
});

describe("extractGcodeThumbnail", () => {
  it("ada marker thumbnail begin/end -> ekstrak base64 gabungan jadi data URL", () => {
    const text = [
      "; generated by BambuStudio",
      "; thumbnail begin 300x300 1234",
      "; QUJD",
      "; RUZH",
      "; thumbnail end",
      "G28",
    ].join("\n");
    expect(extractGcodeThumbnail(text)).toBe("data:image/png;base64,QUJDRUZH");
  });

  it("tanpa marker -> null (bukan crash)", () => {
    expect(extractGcodeThumbnail("G28\nG1 X10\n")).toBeNull();
  });
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/file-manager/thumbnail.test.ts`
Expected: FAIL — `thumbnail.ts` belum ada.

- [ ] **Step 7: Implementasi `thumbnail.ts`, salin persis dari `ipc.ts:291-321`**

```ts
// packages/agent-core/src/file-manager/thumbnail.ts
import type JSZip from "jszip";

// Cari file thumbnail plate di dalam zip .gcode.3mf. Coba plate_1.png dulu (paling umum),
// lalu plate_1_small.png (varian lebih kecil yang selalu ada bareng plate_1.png di file 3mf
// asli -- lihat riset vault bambu-3mf-gcode-metadata), lalu fallback ke plate_N.png pertama
// yang ketemu (urutan angka) kalau plate_1 tak ada sama sekali (kasus file project yang
// plate pertamanya sudah dihapus user di slicer).
export function findPlateThumbnail(zip: JSZip): JSZip.JSZipObject | null {
  return (
    zip.file("Metadata/plate_1.png") ??
    zip.file("Metadata/plate_1_small.png") ??
    (() => {
      const names = Object.keys(zip.files ?? {})
        .filter((n) => /^Metadata\/plate_\d+\.png$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
      return names.length > 0 ? zip.file(names[0]) : null;
    })()
  );
}

// Ekstrak thumbnail base64 yang di-embed slicer di header komentar file .gcode POLOS
// (bukan .gcode.3mf) -- format "; thumbnail begin WxH size" ... "; thumbnail end", satu
// baris base64 per baris komentar. **ASUMSI SEMENTARA, BELUM DIVERIFIKASI** -- ini konvensi
// umum PrusaSlicer/OrcaSlicer (basis slicer Bambu Studio), tapi belum dikonfirmasi terhadap
// file .gcode Bambu asli. Kalau formatnya beda, fungsi ini cuma balikin null (placeholder
// tampil, bukan crash) -- verifikasi manual terhadap file .gcode nyata dari printer Bambu
// wajib sebelum fitur ini dianggap final untuk kasus plain-gcode.
export function extractGcodeThumbnail(text: string): string | null {
  const match = text.match(/;\s*thumbnail begin[^\n]*\n([\s\S]*?)\n;\s*thumbnail end/i);
  if (!match) return null;
  const base64 = match[1]
    .split("\n")
    .map((line) => line.replace(/^;\s?/, "").trim())
    .join("");
  if (!base64) return null;
  return `data:image/png;base64,${base64}`;
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/file-manager/thumbnail.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 9: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./file-manager/types";
export * from "./file-manager/bambu-ftps-client";
export * from "./file-manager/threemf-parser";
export * from "./file-manager/thumbnail";
```

- [ ] **Step 10: Verifikasi typecheck & seluruh test package**

Run: `cd packages/agent-core && npx tsc --noEmit && npx vitest run`
Expected: tidak ada error, semua test lulus.

- [ ] **Step 11: Commit**

```bash
git add packages/agent-core/src/file-manager/ packages/agent-core/src/index.ts packages/agent-core/package.json pnpm-lock.yaml
git commit -m "feat(agent-core): move file-manager/* and extract buried thumbnail-extraction logic from ipc.ts"
```

---

### Task 10: Pindah `saas-client.ts` (parameterisasi `BuildInfo`, ekstrak `uploadLogs`)

**Files:**
- Create: `packages/agent-core/src/saas-client.ts`
- Create: `packages/agent-core/src/saas-client.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `BuildInfo`, `Logger` (Task 2).
- Produces: `SaasDevice`, `SaasFailKind`, `FetchResult`, `PatchDeviceModelResult`, `FetchVersionResult`, `fetchDevices(baseUrl, token, buildInfo, logger)`, `fetchLayout(baseUrl, token)`, `patchDeviceModel(baseUrl, token, shortCode, model)`, `fetchLatestVersion(baseUrl, token, platform, buildInfo, logger)`, `uploadLogs(baseUrl, token, content, logger)` — dipakai Task 12/13/14.

**Perubahan dari versi lama**: `saasBaseUrl()` (fungsi module-level yang baca `process.env`/`__SAAS_BASE_URL__`) DIHAPUS dari sini — base URL sekarang jadi PARAMETER eksplisit tiap fungsi (bukan dibaca sendiri dari dalam), diresolusi Task 11 dan dioper oleh caller (Task 14). `__AGENT_VERSION__`/`__AGENT_COMMIT_HASH__` diganti parameter `buildInfo: BuildInfo`. Ini SATU-SATUNYA file yang perubahannya lebih dari "ganti import path" — perilaku fungsi (apa yang di-fetch, error kind apa yang dibalikin) TETAP IDENTIK, cuma cara base-URL/build-info sampai ke fungsi yang berubah.

- [ ] **Step 1: Tulis test yang gagal (port dari `saas-client.test.ts` lama, minus test `describe("saasBaseUrl", ...)` yang sekarang dihapus, tambah parameter `baseUrl`+`buildInfo` eksplisit ke tiap call)**

Baca `apps/agent/src/main/saas-client.test.ts` isi lengkap dulu, lalu tulis ulang jadi versi baru dengan pola sama tapi signature baru. Contoh representatif (SEMUA test lain di file lama migrasi dengan pola yang sama — tambah `BASE_URL`/`BUILD_INFO` sebagai argumen eksplisit ke tiap pemanggilan, hapus manipulasi `process.env.SAAS_BASE_URL`):

```ts
// packages/agent-core/src/saas-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDevices, fetchLayout, patchDeviceModel, fetchLatestVersion, uploadLogs } from "./saas-client";
import type { Logger, BuildInfo } from "./interfaces";

const BASE_URL = "http://192.168.88.113:3300";
const BUILD_INFO: BuildInfo = { version: "0.0.1", commitHash: "abc1234" };

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("fetchDevices", () => {
  it("ok:true + data kalau 200", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => "application/json" },
      json: async () => [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" }],
    });
    const result = await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, makeLogger());
    expect(result).toEqual({ ok: true, data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" }] });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/agent/devices`, expect.objectContaining({
      headers: expect.objectContaining({ "X-Agent-Version": "0.0.1+abc1234" }),
    }));
  });

  it("401 -> invalid_token", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    expect(await fetchDevices(BASE_URL, "bad", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("403 -> entitlement_expired", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, headers: { get: () => null } });
    expect(await fetchDevices(BASE_URL, "t", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("200 tapi content-type bukan JSON -> wrong_server, logger.error dipanggil", async () => {
    const logger = makeLogger();
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "text/html" } });
    expect(await fetchDevices(BASE_URL, "t", BUILD_INFO, logger)).toEqual({ ok: false, kind: "wrong_server" });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("fetch throw (network down) -> network_error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchDevices(BASE_URL, "t", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "network_error" });
  });
});

describe("fetchLayout", () => {
  it("404 -> ok:true data:null (belum ada layout dikonfigurasi)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
    expect(await fetchLayout(BASE_URL, "t")).toEqual({ ok: true, data: null });
  });
});

describe("patchDeviceModel", () => {
  it("400 dengan body error invalid_device_model -> kind invalid_model", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, headers: { get: () => "application/json" }, json: async () => ({ error: "invalid_device_model" }) });
    expect(await patchDeviceModel(BASE_URL, "t", "ABC", "very-long-model-name")).toEqual({ ok: false, kind: "invalid_model" });
  });
});

describe("fetchLatestVersion", () => {
  it("commitHash beda dari build -> updateAvailable true", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ commitHash: "different" }) });
    const result = await fetchLatestVersion(BASE_URL, "t", "win", BUILD_INFO, makeLogger());
    expect(result).toEqual({ ok: true, data: { updateAvailable: true } });
  });

  it("commitHash sama dengan build -> updateAvailable false", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ commitHash: "abc1234" }) });
    const result = await fetchLatestVersion(BASE_URL, "t", "win", BUILD_INFO, makeLogger());
    expect(result).toEqual({ ok: true, data: { updateAvailable: false } });
  });
});

describe("uploadLogs", () => {
  it("POST ke /api/agent/logs dengan Content-Type text/plain, balikin ok:true kalau 2xx", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const result = await uploadLogs(BASE_URL, "t", Buffer.from("log content"), makeLogger());
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/agent/logs`, expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer t", "Content-Type": "text/plain" }),
    }));
  });

  it("fetch gagal/reject -> ok:false reason upload_failed", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await uploadLogs(BASE_URL, "t", Buffer.from("x"), makeLogger())).toEqual({ ok: false, reason: "upload_failed" });
  });

  it("respons non-ok -> ok:false reason upload_failed", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await uploadLogs(BASE_URL, "t", Buffer.from("x"), makeLogger())).toEqual({ ok: false, reason: "upload_failed" });
  });
});
```

Migrasi test lain yang sudah ada di `saas-client.test.ts` lama (semua `describe("fetchDevices"|"fetchLayout"|"patchDeviceModel"|"fetchLatestVersion", ...)` blok yang belum dikutip di atas) mengikuti pola yang sama: tambahkan `BASE_URL`/`BUILD_INFO` sebagai argumen, hapus `process.env.SAAS_BASE_URL` manipulation, hapus blok `describe("saasBaseUrl", ...)` sepenuhnya (fungsi itu tidak ada lagi di sini — resolusinya pindah ke Task 11).

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/saas-client.test.ts`
Expected: FAIL — `saas-client.ts` belum ada.

- [ ] **Step 3: Implementasi `saas-client.ts`**

```ts
// packages/agent-core/src/saas-client.ts
import type { LayoutConfigOut } from "@3pb/cyd-layout-schema";
import type { BuildInfo, Logger } from "./interfaces";

export interface SaasDevice {
  id: string;
  shortCode: string;
  userId: string;
  label: string;
  printerType: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

// "wrong_server": the URL answered, but with something that is NOT the Slizebiz app
// (an HTML page instead of JSON). Real case 2026-08-22: a default build baked
// https://app.slizebiz.com, which is still the Cloudflare Pages "Segera Hadir" placeholder
// (200 text/html on EVERY path, /api/agent/* included) -- every call surfaced as a generic
// "network_error" and publishLayout() silently skipped, so the CYD sat on "Tampilan belum
// diatur" with no hint that the build's SAAS_BASE_URL was the problem. Kept separate from
// network_error so the UI can say "wrong server/build" instead of "check your internet".
export type SaasFailKind = "invalid_token" | "entitlement_expired" | "network_error" | "wrong_server";

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: SaasFailKind };

export type PatchDeviceModelResult =
  | { ok: true; data: { model: string | null } }
  | { ok: false; kind: SaasFailKind | "invalid_model" };

function buildId(buildInfo: BuildInfo): string {
  return `${buildInfo.version}+${buildInfo.commitHash}`;
}

const FETCH_TIMEOUT_MS = 5_000;

function isNonJsonResponse(res: Response): boolean {
  const contentType = res.headers?.get?.("content-type");
  if (contentType == null) return false;
  return !contentType.toLowerCase().includes("json");
}

function wrongServer(baseUrl: string, path: string, res: Response, logger: Logger): { ok: false; kind: "wrong_server" } {
  logger.error(
    `[saas-client] ${baseUrl}${path} answered ${res.status} with content-type "${res.headers?.get?.("content-type")}" -- this is NOT the Slizebiz app. Check config.json's saasBaseUrl (e.g. it may still be pointing at the app.slizebiz.com placeholder).`,
  );
  return { ok: false, kind: "wrong_server" };
}

export async function fetchDevices(baseUrl: string, token: string, buildInfo: BuildInfo, logger: Logger): Promise<FetchResult<SaasDevice[]>> {
  try {
    const res = await fetch(`${baseUrl}/api/agent/devices`, {
      headers: { Authorization: `Bearer ${token}`, "X-Agent-Version": buildId(buildInfo) },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return wrongServer(baseUrl, "/api/agent/devices", res, logger);
    return { ok: true, data: (await res.json()) as SaasDevice[] };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export async function fetchLayout(baseUrl: string, token: string): Promise<FetchResult<LayoutConfigOut | null>> {
  try {
    const res = await fetch(`${baseUrl}/api/agent/layout`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return { ok: false, kind: "wrong_server" };
    return { ok: true, data: (await res.json()) as LayoutConfigOut };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export async function patchDeviceModel(baseUrl: string, token: string, shortCode: string, model: string): Promise<PatchDeviceModelResult> {
  try {
    const res = await fetch(`${baseUrl}/api/agent/devices/${shortCode}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (res.status === 400) {
      const body = await res.json().catch(() => null);
      if (body && (body as { error?: string }).error === "invalid_device_model") {
        return { ok: false, kind: "invalid_model" };
      }
      return { ok: false, kind: "network_error" };
    }
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return { ok: false, kind: "wrong_server" };
    return { ok: true, data: (await res.json()) as { model: string | null } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export type FetchVersionResult =
  | { ok: true; data: { updateAvailable: boolean } }
  | { ok: false; kind: SaasFailKind };

export async function fetchLatestVersion(baseUrl: string, token: string, platform: "win" | "mac" | "linux", buildInfo: BuildInfo, logger: Logger): Promise<FetchVersionResult> {
  try {
    const res = await fetch(`${baseUrl}/api/agent/version?platform=${platform}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Agent-Version": buildId(buildInfo) },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return wrongServer(baseUrl, `/api/agent/version?platform=${platform}`, res, logger);
    const { commitHash } = (await res.json()) as { commitHash: string | null };
    return { ok: true, data: { updateAvailable: commitHash !== null && commitHash !== buildInfo.commitHash } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

// Diekstrak dari apps/agent/src/main/ipc.ts:213-221 (agent:send-logs handler lama) --
// bagian ini murni HTTP POST, tidak menyentuh Electron sama sekali di file lama, cuma
// "terkubur" di dalam ipc handler. Pembacaan file log (path-nya) tetap tanggung jawab
// caller lewat LogFileProvider, fungsi ini cuma terima buffer yang sudah dibaca.
export async function uploadLogs(baseUrl: string, token: string, content: Buffer, logger: Logger): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/agent/logs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body: content as unknown as BodyInit,
    });
    if (!res.ok) return { ok: false, reason: "upload_failed" };
    return { ok: true };
  } catch (err) {
    logger.error("[saas-client] uploadLogs gagal", err);
    return { ok: false, reason: "upload_failed" };
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/saas-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./saas-client";
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/saas-client.ts packages/agent-core/src/saas-client.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): move saas-client.ts, parameterize BuildInfo, extract uploadLogs from ipc.ts"
```

---

### Task 11: Resolusi runtime config `SAAS_BASE_URL`

**Files:**
- Create: `packages/agent-core/src/config.ts`
- Create: `packages/agent-core/src/config.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `PathProvider` (Task 2).
- Produces: `AgentConfig` (tipe), `loadOrCreateConfig(pathProvider, envSeed): Promise<AgentConfig>` — dipakai Task 14 (`index.ts` bootstrap Electron).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// packages/agent-core/src/config.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateConfig } from "./config";
import type { PathProvider } from "./interfaces";

describe("loadOrCreateConfig", () => {
  let dir: string;
  let pathProvider: PathProvider;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-core-config-"));
    pathProvider = { userDataDir: () => dir };
  });

  it("config.json belum ada, env var kosong -> tulis default, balikin default", async () => {
    const config = await loadOrCreateConfig(pathProvider, undefined);
    expect(config.saasBaseUrl).toBe("https://app.slizebiz.com");
    const written = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    expect(written.saasBaseUrl).toBe("https://app.slizebiz.com");
  });

  it("config.json belum ada, env var diisi -> seed dari env var, tulis ke file", async () => {
    const config = await loadOrCreateConfig(pathProvider, "http://192.168.88.113:3300");
    expect(config.saasBaseUrl).toBe("http://192.168.88.113:3300");
    const written = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    expect(written.saasBaseUrl).toBe("http://192.168.88.113:3300");
  });

  it("config.json SUDAH ADA -> env var TIDAK PERNAH menimpa nilai yang tersimpan", async () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ saasBaseUrl: "https://existing.example.com" }));
    const config = await loadOrCreateConfig(pathProvider, "http://should-not-be-used:3300");
    expect(config.saasBaseUrl).toBe("https://existing.example.com");
  });

  it("env var runtime menang di ATAS config yang sudah ada -- dibaca ulang tiap panggilan, precedence env>config>default", async () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ saasBaseUrl: "https://existing.example.com" }));
    const config = await loadOrCreateConfig(pathProvider, "http://env-override:3300");
    // Env var menang MESKI config sudah ada -- beda dari "seed cuma sekali" (test sebelumnya
    // menguji SEED tidak menimpa FILE; test ini menguji env var yang di-BACA SAAT INI tetap
    // menang di atas nilai file untuk resolusi runtime, sesuai precedence Global Constraints.
    expect(config.saasBaseUrl).toBe("http://env-override:3300");
  });

  it("field saasBaseUrl eksplisit string kosong di config -> tetap dianggap invalid/kosong (bukan diam-diam fallback default)", async () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ saasBaseUrl: "" }));
    const config = await loadOrCreateConfig(pathProvider, undefined);
    expect(config.saasBaseUrl).toBe("");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/config.test.ts`
Expected: FAIL — `config.ts` belum ada.

- [ ] **Step 3: Implementasi `config.ts`**

```ts
// packages/agent-core/src/config.ts
import fs from "node:fs";
import path from "node:path";
import type { PathProvider } from "./interfaces";

export interface AgentConfig {
  saasBaseUrl: string;
}

const DEFAULT_SAAS_BASE_URL = "https://app.slizebiz.com";

function configFilePath(pathProvider: PathProvider): string {
  return path.join(pathProvider.userDataDir(), "config.json");
}

/**
 * Precedence: env var runtime (kalau di-set SAAT INI, bukan cuma saat file pertama ditulis)
 * > config.json (kalau sudah ada) > default. Config yang SUDAH ADA tidak pernah ditimpa file-nya
 * oleh env var -- env var cuma jadi SEED nilai awal saat file belum ada sama sekali. Field
 * saasBaseUrl string kosong ("") eksplisit di config TETAP dianggap kosong (bukan diam-diam
 * fallback default) -- mempertahankan perilaku "gagal keras kalau config rusak" dari kode lama.
 */
export async function loadOrCreateConfig(pathProvider: PathProvider, envSeed: string | undefined): Promise<AgentConfig> {
  const filePath = configFilePath(pathProvider);
  let stored: AgentConfig;

  if (fs.existsSync(filePath)) {
    stored = JSON.parse(fs.readFileSync(filePath, "utf8")) as AgentConfig;
  } else {
    const dir = pathProvider.userDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    stored = { saasBaseUrl: envSeed || DEFAULT_SAAS_BASE_URL };
    fs.writeFileSync(filePath, JSON.stringify(stored, null, 2));
  }

  // Env var runtime tetap menang DI ATAS nilai file untuk resolusi PANGGILAN INI (dev/staging
  // override tanpa perlu edit config.json manual), tapi tidak pernah menulis balik ke file.
  return { saasBaseUrl: envSeed || stored.saasBaseUrl };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/config.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./config";
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/config.ts packages/agent-core/src/config.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add runtime SAAS_BASE_URL config resolution with env-var first-run seed"
```

---

### Task 12: Pindah `engine-manager.ts` + `layout-publisher.ts` (parameterisasi `Logger`)

**Files:**
- Create: `packages/agent-core/src/engine-manager.ts`
- Create: `packages/agent-core/src/engine-manager.test.ts`
- Create: `packages/agent-core/src/layout-publisher.ts`
- Create: `packages/agent-core/src/layout-publisher.test.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/package.json` (tambah `mqtt`)

**Interfaces:**
- Consumes: `Logger` (Task 2), `hmsTable` (Task 4), `CYD_TYPE_FALLBACK` (Task 3), `DeviceSecret` (Task 5), `FetchResult`/`fetchLayout` (Task 10).
- Produces: `PairedDevice`, `StartedEngine`, `startEngine(paired, brokerPort, pin, logger)`, `publishLayout(baseUrl, token, brokerPort, cydDeviceId, pin, logger)` — dipakai Task 13/14.

- [ ] **Step 1: Tambah dependency**

```bash
cd packages/agent-core && pnpm add mqtt
```

- [ ] **Step 2: Copy test `engine-manager.test.ts` dan `layout-publisher.test.ts`, sesuaikan mock `electron-log/main` jadi mock `Logger` parameter biasa**

Baca `apps/agent/src/main/engine-manager.test.ts` dan `apps/agent/src/main/layout-publisher.test.ts` isi lengkap dulu. Keduanya sekarang `vi.mock("electron-log/main", ...)` — ganti pola ini: hapus `vi.mock("electron-log/main", ...)`, buat `Logger` palsu manual (`{info:vi.fn(), warn:vi.fn(), error:vi.fn()}`) dan oper sebagai parameter fungsi, assertion yang tadinya `expect(log.error).toHaveBeenCalledWith(...)` jadi `expect(logger.error).toHaveBeenCalledWith(...)`.

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/engine-manager.test.ts src/layout-publisher.test.ts`
Expected: FAIL — file implementasi belum ada.

- [ ] **Step 4: Implementasi `engine-manager.ts`**

```ts
// packages/agent-core/src/engine-manager.ts
import { Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter, HmsLookup } from "@3pb/printer-monitor-core";
import type { DeviceConfig, Connector } from "@3pb/printer-monitor-core";
import type { DeviceSecret } from "./credential-store";
import { hmsTable } from "./hms-table";
import { CYD_TYPE_FALLBACK } from "./printer-model";
import type { Logger } from "./interfaces";

export interface PairedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  model?: string | null;
  secret: DeviceSecret;
}

export interface StartedEngine {
  engine: Engine;
  reporters: MqttReporter[];
}

export async function startEngine(paired: PairedDevice[], brokerPort: number, pin: string, logger: Logger): Promise<StartedEngine> {
  const devices: DeviceConfig[] = [];
  const connectors: Connector[] = [];

  for (const p of paired) {
    if (p.printerType !== "bambu" && p.printerType !== "moonraker") {
      logger.warn(`[engine-manager] printerType tak didukung, di-skip: ${p.printerType} (${p.shortCode})`);
      continue;
    }
    const device: DeviceConfig = {
      id: p.shortCode,
      name: p.label,
      type: p.model?.trim() || CYD_TYPE_FALLBACK[p.printerType],
      connector: p.printerType,
      ip: p.secret.ip,
      serial: p.secret.serial || undefined,
      accessCode: p.secret.accessCode || undefined,
    };
    devices.push(device);
    try {
      connectors.push(
        p.printerType === "bambu" ? new BambuMqttConnector(device) : new MoonrakerConnector(device)
      );
    } catch (err) {
      logger.error(`[engine-manager] gagal bikin connector utk ${p.shortCode} (${p.printerType}) -- device ini TIDAK termonitor, device lain tetap jalan`, err);
    }
  }

  const reporter = new MqttReporter({
    url: `mqtt://127.0.0.1:${brokerPort}`,
    statusTopic: "3dpb/printers",
    password: pin,
  });
  await reporter.connect();

  const engine = new Engine({
    devices,
    connectors,
    reporters: [reporter],
    hms: new HmsLookup(hmsTable),
  });
  await engine.start();
  return { engine, reporters: [reporter] };
}
```

- [ ] **Step 5: Implementasi `layout-publisher.ts`**

```ts
// packages/agent-core/src/layout-publisher.ts
import mqtt from "mqtt";
import { fetchLayout } from "./saas-client";
import type { Logger } from "./interfaces";

const MQTT_AUTH_USERNAME_PLACEHOLDER = "agent";

export async function publishLayout(
  baseUrl: string,
  token: string,
  brokerPort: number,
  cydDeviceId: string,
  pin: string,
  logger: Logger,
): Promise<{ published: boolean }> {
  const result = await fetchLayout(baseUrl, token);
  if (!result.ok) {
    logger.error(`[layout-publisher] layout NOT published to 3dpb/cyd/${cydDeviceId}/layout -- fetchLayout failed: ${result.kind}`);
    return { published: false };
  }
  if (result.data === null) {
    logger.warn(`[layout-publisher] layout NOT published to 3dpb/cyd/${cydDeviceId}/layout -- no layout configured on the SaaS yet (404)`);
    return { published: false };
  }

  const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${brokerPort}`, {
    username: MQTT_AUTH_USERNAME_PLACEHOLDER,
    password: pin,
  });
  await client.publishAsync(`3dpb/cyd/${cydDeviceId}/layout`, JSON.stringify(result.data), { retain: true });
  await client.endAsync();
  return { published: true };
}
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/engine-manager.test.ts src/layout-publisher.test.ts`
Expected: PASS, jumlah test sama dengan versi lama.

- [ ] **Step 7: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./engine-manager";
export * from "./layout-publisher";
```

- [ ] **Step 8: Commit**

```bash
git add packages/agent-core/src/engine-manager.ts packages/agent-core/src/engine-manager.test.ts packages/agent-core/src/layout-publisher.ts packages/agent-core/src/layout-publisher.test.ts packages/agent-core/src/index.ts packages/agent-core/package.json pnpm-lock.yaml
git commit -m "feat(agent-core): move engine-manager.ts and layout-publisher.ts, parameterize Logger"
```

---

### Task 13: Pindah `startup.ts` + fungsi murni IP-picking dari `app-state.ts`

**Files:**
- Create: `packages/agent-core/src/startup.ts`
- Create: `packages/agent-core/src/startup.test.ts`
- Create: `packages/agent-core/src/local-network.ts`
- Create: `packages/agent-core/src/local-network.test.ts`
- Modify: `packages/agent-core/src/index.ts`

**Interfaces:**
- Consumes: `CredentialStore`, `loadCredentials` (Task 5), `PathProvider`, `loadDeviceCache`/`saveDeviceCache` (Task 7), `fetchDevices`, `BuildInfo`, `Logger` (Task 10), `PairedDevice` (Task 12).
- Produces: `ReconcileResult`, `reconcileDevices(baseUrl, store, pathProvider, token, buildInfo, logger)`, `buildPairedDevices(baseUrl, store, pathProvider, buildInfo, logger)`, `pickLocalIpCandidates`, `listLocalIpCandidates`, `getLocalIp` — dipakai Task 14.

**Catatan `app-state.ts`**: file lama ini juga menyimpan singleton `engine`/`reporters`/`brokerPort`/`brokerPin`/dst — SEMUA state mutable itu TIDAK dipindah di task ini (tetap di `apps/agent/src/main/app-state.ts` sampai Plan B). Task ini CUMA memindahkan 3 fungsi murni (`pickLocalIpCandidates`, `listLocalIpCandidates`, `getLocalIp`) yang tak menyentuh state module-level apa pun.

- [ ] **Step 1: Tulis test yang gagal untuk `local-network.ts`**

Baca `apps/agent/src/main/app-state.test.ts` isi lengkap dulu, cari bagian test yang menguji `pickLocalIpCandidates` (bukan test untuk `setEngine`/`getEngine`/dst yang TIDAK ikut dipindah). Salin bagian itu ke file test baru:

```ts
// packages/agent-core/src/local-network.test.ts
```
(isi persis test `pickLocalIpCandidates` dari `app-state.test.ts` lama, import path diganti `./local-network`).

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/local-network.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi `local-network.ts`**

```ts
// packages/agent-core/src/local-network.ts
import os from "node:os";

// Adapter virtual/VPN. IP-nya non-internal & IPv4 juga, jadi lolos filter naif "ambil yang
// pertama" — dan di Windows dengan Hyper-V/WSL2 (`vEthernet (WSL)`), VirtualBox, atau VPN
// aktif, adapter-adapter ini SERING muncul sebelum adapter LAN asli. Akibatnya user
// mengetik IP yang tak bisa dijangkau CYD ke captive portal, dengan gejala ("CYD gak
// pernah konek padahal IP-nya kelihatan benar") yang nyaris mustahil didiagnosis dari
// percakapan support dan gampang tertukar dengan masalah Windows Firewall.
const VIRTUAL_IFACE_PATTERNS: RegExp[] = [
  /^vEthernet/i,
  /hyper-?v/i,
  /virtualbox|vboxnet/i,
  /vmware|^vmnet/i,
  /tailscale/i,
  /zerotier/i,
  /^wg\d/i,
  /^ppp\d/i,
  /^utun\d/i,
  /^tun\d|^tap\d/i,
  /^docker|^br-|^veth/i,
  /loopback/i,
  /bluetooth/i,
  /virtual/i,
];

function isVirtualIface(name: string): boolean {
  return VIRTUAL_IFACE_PATTERNS.some((re) => re.test(name));
}

export function pickLocalIpCandidates(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
): string[] {
  const real: string[] = [];
  const virtual: string[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const iface of addrs ?? []) {
      if (!iface || iface.family !== "IPv4" || iface.internal) continue;
      (isVirtualIface(name) ? virtual : real).push(iface.address);
    }
  }
  return [...real, ...virtual];
}

export function listLocalIpCandidates(): string[] {
  return pickLocalIpCandidates(os.networkInterfaces());
}

export function getLocalIp(): string {
  return listLocalIpCandidates()[0] ?? "127.0.0.1";
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/local-network.test.ts`
Expected: PASS.

- [ ] **Step 5: Tulis test yang gagal untuk `startup.ts`**

Baca `apps/agent/src/main/startup.test.ts` isi lengkap dulu (pola `vi.mock("./credential-store", ...)`, `vi.mock("./device-cache", ...)`, `vi.mock("./saas-client", ...)`), salin ke `packages/agent-core/src/startup.test.ts` dengan penyesuaian: `reconcileDevices`/`buildPairedDevices` sekarang butuh parameter tambahan (`baseUrl`, `store`, `pathProvider`, `buildInfo`, `logger`) — sesuaikan tiap pemanggilan di test dengan argumen baru ini, mock `fetchDevices`/`loadCredentials`/`loadDeviceCache`/`saveDeviceCache` tetap lewat `vi.mock` modul seperti sebelumnya tapi sekarang fungsi-fungsi itu sendiri juga menerima parameter baru (store/pathProvider dioper transparan).

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd packages/agent-core && npx vitest run src/startup.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implementasi `startup.ts`**

```ts
// packages/agent-core/src/startup.ts
import { loadCredentials } from "./credential-store";
import { loadDeviceCache, saveDeviceCache, type CachedDevice } from "./device-cache";
import { fetchDevices, type FetchResult, type SaasDevice } from "./saas-client";
import type { PairedDevice } from "./engine-manager";
import type { CredentialStore, PathProvider, BuildInfo, Logger } from "./interfaces";
import type { CredentialBlob } from "./credential-store";

export interface ReconcileResult {
  fetchResult: FetchResult<SaasDevice[]>;
  devices: SaasDevice[];
  paired: PairedDevice[];
}

export async function reconcileDevices(
  baseUrl: string,
  store: CredentialStore<CredentialBlob>,
  pathProvider: PathProvider,
  token: string,
  buildInfo: BuildInfo,
  logger: Logger,
): Promise<ReconcileResult> {
  let metadata: CachedDevice[];
  const fetchResult = await fetchDevices(baseUrl, token, buildInfo, logger);
  if (fetchResult.ok) {
    metadata = fetchResult.data.map((d) => ({ shortCode: d.shortCode, label: d.label, printerType: d.printerType, model: d.model }));
    await saveDeviceCache(pathProvider, metadata);
  } else {
    metadata = await loadDeviceCache(pathProvider);
  }

  const devices: SaasDevice[] = fetchResult.ok
    ? fetchResult.data
    : metadata.map((m) => ({
        id: m.shortCode,
        shortCode: m.shortCode,
        userId: "",
        label: m.label,
        printerType: m.printerType,
        model: m.model ?? null,
        createdAt: "",
        updatedAt: "",
      }));

  const blob = await loadCredentials(store);
  const paired: PairedDevice[] = [];
  for (const m of metadata) {
    const secret = blob.devices[m.shortCode];
    if (!secret) continue;
    paired.push({ shortCode: m.shortCode, label: m.label, printerType: m.printerType, model: m.model, secret });
  }
  return { fetchResult, devices, paired };
}

export async function buildPairedDevices(
  baseUrl: string,
  store: CredentialStore<CredentialBlob>,
  pathProvider: PathProvider,
  buildInfo: BuildInfo,
  logger: Logger,
): Promise<PairedDevice[]> {
  const blob = await loadCredentials(store);
  if (!blob.agentToken) return [];
  const { paired } = await reconcileDevices(baseUrl, store, pathProvider, blob.agentToken, buildInfo, logger);
  return paired;
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd packages/agent-core && npx vitest run src/startup.test.ts`
Expected: PASS.

- [ ] **Step 9: Tambahkan ke barrel**

```ts
// packages/agent-core/src/index.ts
export * from "./startup";
export * from "./local-network";
```

- [ ] **Step 10: Verifikasi typecheck & seluruh test package sejauh ini**

Run: `cd packages/agent-core && npx tsc --noEmit && npx vitest run`
Expected: tidak ada error, semua test lulus.

- [ ] **Step 11: Commit**

```bash
git add packages/agent-core/src/startup.ts packages/agent-core/src/startup.test.ts packages/agent-core/src/local-network.ts packages/agent-core/src/local-network.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): move startup.ts and pure IP-candidate functions from app-state.ts"
```

---

### Task 14: Rewire `apps/agent` — `platform-electron.ts` selesai, `ipc.ts`, `index.ts`, `electron.vite.config.ts`, dan penghapusan file lama

**Files:**
- Modify: `apps/agent/src/main/platform-electron.ts` (tambah `ElectronPathProvider`, `ElectronLogAdapter`, `ElectronLogFileProvider`)
- Modify: `apps/agent/src/main/platform-electron.test.ts`
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/main/index.ts`
- Modify: `apps/agent/electron.vite.config.ts`
- Modify: `apps/agent/package.json` (tambah `@3pb/agent-core` sebagai dependency)
- Delete: `apps/agent/src/main/credential-store.ts`, `credential-store.test.ts`, `app-state.ts` (bagian yang sudah dipindah — SISA `setEngine`/`getEngine`/dst TETAP ADA, cuma bagian IP-picking dihapus), `app-state.test.ts` (sisakan test yang masih relevan), `device-cache.ts`, `device-cache.test.ts`, `discovery/`, `file-manager/`, `saas-client.ts`, `saas-client.test.ts`, `engine-manager.ts`, `engine-manager.test.ts`, `layout-publisher.ts`, `layout-publisher.test.ts`, `startup.ts`, `startup.test.ts`, `printer-model.ts`, `printer-model.test.ts`, `hms-table.ts`

**Interfaces:**
- Consumes: SEMUA yang diproduksi Task 2-13 lewat `@3pb/agent-core`.

Ini task PALING BESAR di plan ini (rewire ~15 titik pemanggilan di `ipc.ts` + bootstrap `index.ts`) — TIDAK ada test baru yang ditulis dari nol di sini (test sudah pindah ke `packages/agent-core` di task-task sebelumnya); yang dibutuhkan cuma memastikan `apps/agent/src/main/ipc.test.ts` dan `apps/agent/src/main/broker.test.ts` (yang TIDAK ikut dipindah per spec — tetap testing perilaku module-level yang ada) tetap hijau setelah rewiring, karena keduanya memanggil fungsi yang sekarang datang dari `@3pb/agent-core` alih-alih file lokal.

- [ ] **Step 1: Lengkapi `platform-electron.ts` dengan 3 adapter yang belum ada**

```ts
// apps/agent/src/main/platform-electron.ts — tambahkan di bawah SafeStorageCredentialStore yang sudah ada
import { app } from "electron";
import log from "electron-log/main";
import type { PathProvider, Logger, LogFileProvider, BuildInfo } from "@3pb/agent-core";

export class ElectronPathProvider implements PathProvider {
  userDataDir(): string {
    return app.getPath("userData");
  }
}

export class ElectronLogAdapter implements Logger {
  info(...args: unknown[]): void {
    log.info(...args);
  }
  warn(...args: unknown[]): void {
    log.warn(...args);
  }
  error(...args: unknown[]): void {
    log.error(...args);
  }
}

export class ElectronLogFileProvider implements LogFileProvider {
  getLogFilePath(): string | null {
    return log.transports.file.getFile().path;
  }
}

// version/commitHash tetap datang dari Vite `define` (__AGENT_VERSION__/__AGENT_COMMIT_HASH__
// di electron.vite.config.ts) -- BuildInfo dibangun sekali di index.ts dan dioper eksplisit,
// bukan dibaca langsung dari declare const di dalam saas-client.ts lagi (itu perilaku LAMA).
declare const __AGENT_VERSION__: string | undefined;
declare const __AGENT_COMMIT_HASH__: string | undefined;

export function getElectronBuildInfo(): BuildInfo {
  return {
    version: typeof __AGENT_VERSION__ === "string" ? __AGENT_VERSION__ : "0.0.0",
    commitHash: typeof __AGENT_COMMIT_HASH__ === "string" ? __AGENT_COMMIT_HASH__ : "nogit",
  };
}
```

- [ ] **Step 2: Tambah test untuk 3 adapter baru di `platform-electron.test.ts`**

```ts
// apps/agent/src/main/platform-electron.test.ts — tambahkan di bawah yang sudah ada
vi.mock("electron-log/main", () => ({
  default: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    transports: { file: { getFile: () => ({ path: "/fake/logs/agent.log" }) } },
  },
}));

import { ElectronPathProvider, ElectronLogAdapter, ElectronLogFileProvider, getElectronBuildInfo } from "./platform-electron";
import log from "electron-log/main";

describe("ElectronPathProvider", () => {
  it("userDataDir() delegasi ke app.getPath('userData')", () => {
    expect(new ElectronPathProvider().userDataDir()).toBe("/fake/userdata");
  });
});

describe("ElectronLogAdapter", () => {
  it("info/warn/error delegasi ke electron-log", () => {
    const adapter = new ElectronLogAdapter();
    adapter.error("test", { detail: 1 });
    expect(log.error).toHaveBeenCalledWith("test", { detail: 1 });
  });
});

describe("ElectronLogFileProvider", () => {
  it("getLogFilePath() delegasi ke electron-log transport", () => {
    expect(new ElectronLogFileProvider().getLogFilePath()).toBe("/fake/logs/agent.log");
  });
});

describe("getElectronBuildInfo", () => {
  it("fallback ke 0.0.0/nogit di luar build sungguhan (define tak ada)", () => {
    expect(getElectronBuildInfo()).toEqual({ version: "0.0.0", commitHash: "nogit" });
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/main/platform-electron.test.ts`
Expected: PASS.

- [ ] **Step 4: Tambah `@3pb/agent-core` ke `apps/agent/package.json`, `WORKSPACE_TS_PACKAGES` di `electron.vite.config.ts`, hapus define `__SAAS_BASE_URL__`**

```json
// apps/agent/package.json — tambahkan di "dependencies"
"@3pb/agent-core": "workspace:*",
```

```ts
// apps/agent/electron.vite.config.ts — ganti baris WORKSPACE_TS_PACKAGES
const WORKSPACE_TS_PACKAGES = ['@3pb/agent-core', '@3pb/printer-monitor-core', '@3pb/cyd-layout-schema']
```

```ts
// apps/agent/electron.vite.config.ts — HAPUS baris DEFAULT_SAAS_BASE_URL dan saasBaseUrl
// (dua baris ini dihapus sepenuhnya, tidak dipakai lagi):
//   const DEFAULT_SAAS_BASE_URL = 'https://app.slizebiz.com'
//   const saasBaseUrl = process.env.SAAS_BASE_URL ?? DEFAULT_SAAS_BASE_URL

// Di dalam defineConfig's main.define, HAPUS baris:
//   __SAAS_BASE_URL__: JSON.stringify(saasBaseUrl),
// __AGENT_VERSION__/__AGENT_COMMIT_HASH__ di main DAN renderer TETAP ADA, tidak diubah.
```

Jalankan `pnpm install` supaya `@3pb/agent-core` ke-link ke `apps/agent`:

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-core-extraction && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm install`

- [ ] **Step 5: Rewire `apps/agent/src/main/ipc.ts` — import dari `@3pb/agent-core`, bangun instance store/adapter, oper eksplisit ke tiap fungsi**

Baca `ipc.ts` yang sekarang (sudah dikutip lengkap di awal riset task ini) dan ganti SELURUH bagian import + body handler mengikuti pola berikut (bukan cuma ganti import — signature panggilan fungsi berubah karena parameter baru):

```ts
// apps/agent/src/main/ipc.ts — bagian import diganti total
import { ipcMain, shell, dialog } from "electron";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import {
  loadCredentials, saveCredentials, type DeviceSecret, type CredentialBlob,
  fetchDevices, patchDeviceModel, type SaasDevice, type SaasFailKind,
  uploadLogs,
  scanBambu, scanMoonraker,
  BambuFtpsClient, parseThreemf, type PlateInfo, type PrinterFileEntry,
  findPlateThumbnail, extractGcodeThumbnail,
  reconcileDevices,
} from "@3pb/agent-core";
import { getEngine, setEngine, getBrokerPort, getBrokerPin, getReporters, setReporters, getUpdateAvailable, getCredentialStoreDegraded } from "./app-state";
import { getLocalIp } from "@3pb/agent-core";
import { startEngine } from "@3pb/agent-core";
import { publishLayout } from "@3pb/agent-core";
import { SafeStorageCredentialStore, ElectronPathProvider, ElectronLogAdapter, ElectronLogFileProvider, getElectronBuildInfo } from "./platform-electron";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";
import type { AgentConfig } from "@3pb/agent-core";

// Instance singleton -- dibangun sekali per proses Electron, dioper eksplisit ke tiap
// pemanggilan fungsi core (functions module-level di agent-core TIDAK menyimpan state ini
// sendiri, semua dependency lewat parameter -- Plan A, lihat spec).
const credentialStore = new SafeStorageCredentialStore();
const pathProvider = new ElectronPathProvider();
const logger = new ElectronLogAdapter();
const logFileProvider = new ElectronLogFileProvider();
const buildInfo = getElectronBuildInfo();

export function registerIpcHandlers(config: AgentConfig): void {
  const baseUrl = config.saasBaseUrl;

  ipcMain.handle("agent:activate", async (_event, token: string) => {
    const result = await fetchDevices(baseUrl, token, buildInfo, logger);
    if (result.ok) {
      const blob = await loadCredentials(credentialStore);
      await saveCredentials(credentialStore, { ...blob, agentToken: token });
    }
    return result;
  });

  ipcMain.handle("agent:scan-lan", async () => {
    const [bambuResult, moonraker] = await Promise.all([scanBambu(), scanMoonraker()]);
    return { bambu: bambuResult, moonraker };
  });

  ipcMain.handle("agent:pair-device", async (_event, shortCode: string, secret: DeviceSecret) => {
    const blob = await loadCredentials(credentialStore);
    blob.devices[shortCode] = secret;
    await saveCredentials(credentialStore, blob);
  });

  ipcMain.handle("agent:forget-device", async (_event, shortCode: string): Promise<void> => {
    const blob = await loadCredentials(credentialStore);
    delete blob.devices[shortCode];
    await saveCredentials(credentialStore, blob);
  });

  ipcMain.handle("agent:update-device-model", async (_event, shortCode: string, model: string) => {
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false };
    const result = await patchDeviceModel(baseUrl, blob.agentToken, shortCode, model);
    if (result.ok) return { ok: true };
    if (result.kind === "invalid_model") return { ok: false, kind: "invalid_model" };
    return { ok: false };
  });

  ipcMain.handle("agent:sync", async () => {
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false, kind: "invalid_token" };

    const brokerPort = getBrokerPort();
    if (brokerPort === null) return { ok: false, kind: "broker_unavailable" };
    const brokerPin = getBrokerPin() as string;

    const { fetchResult, paired } = await reconcileDevices(baseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);

    const oldEngine = getEngine();
    if (oldEngine) await oldEngine.stop();
    for (const r of getReporters()) {
      await r.close().catch((err) => logger.error("[ipc] agent:sync gagal tutup reporter lama", err));
    }
    setReporters([]);

    if (paired.length > 0) {
      try {
        const started = await startEngine(paired, brokerPort, brokerPin, logger);
        setEngine(started.engine);
        setReporters(started.reporters);
      } catch (err) {
        logger.error("[ipc] agent:sync gagal restart engine dengan device terbaru", err);
        setEngine(null);
        return { ok: false, kind: "engine_error" };
      }
    } else {
      setEngine(null);
    }

    await publishLayout(baseUrl, blob.agentToken, brokerPort, "default", brokerPin, logger).catch((err) => {
      logger.error("[ipc] agent:sync gagal republish layout (non-fatal)", err);
    });

    if (!fetchResult.ok) return fetchResult;
    return { ok: true, deviceCount: paired.length };
  });

  ipcMain.handle("agent:get-activation-state", async () => {
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { hasToken: false, devices: [], pairedShortCodes: [] };
    const { devices, paired } = await reconcileDevices(baseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);
    return { hasToken: true, devices, pairedShortCodes: paired.map((p) => p.shortCode) };
  });

  ipcMain.handle("agent:get-snapshot", async () => {
    return getEngine()?.snapshot() ?? { payload: [] };
  });

  ipcMain.handle("agent:get-broker-info", async () => {
    return { ip: getLocalIp(), port: getBrokerPort(), pin: getBrokerPin() };
  });

  ipcMain.handle("agent:printer-command", async (_event, deviceId: string, cmd: PrinterCommand): Promise<CommandResult> => {
    const engine = getEngine();
    if (!engine) return { ok: false, message: "engine_not_running" };
    return engine.sendCommand(deviceId, cmd);
  });

  ipcMain.handle("agent:get-credential-store-status", async () => {
    return { degraded: getCredentialStoreDegraded() };
  });

  ipcMain.handle("agent:get-update-status", async () => {
    return { updateAvailable: getUpdateAvailable() };
  });

  ipcMain.handle("agent:open-download-page", async () => {
    if (!baseUrl) return;
    await shell.openExternal(`${baseUrl}/settings`);
  });

  const MAX_LOG_BYTES = 5 * 1024 * 1024;

  ipcMain.handle("agent:send-logs", async (): Promise<{ ok: boolean; reason?: string }> => {
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false, reason: "no_token" };

    const logPath = logFileProvider.getLogFilePath();
    if (!logPath) return { ok: false, reason: "read_failed" };

    let stats;
    try {
      stats = await stat(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }
    if (stats.size > MAX_LOG_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    let content: Buffer;
    try {
      content = await readFile(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }

    return uploadLogs(baseUrl, blob.agentToken, content, logger);
  });

  async function getFileClientFor(shortCode: string): Promise<BambuFtpsClient> {
    const blob = await loadCredentials(credentialStore);
    const secret = blob.devices[shortCode];
    if (!secret) throw new Error("device_not_found");
    return new BambuFtpsClient(secret.ip, secret.accessCode);
  }

  ipcMain.handle("agent:file-list", async (_event, shortCode: string, path: string): Promise<PrinterFileEntry[]> => {
    const client = await getFileClientFor(shortCode);
    return client.list(path);
  });

  ipcMain.handle("agent:file-upload", async (_event, shortCode: string, localPath: string, remotePath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.upload(localPath, remotePath);
  });

  ipcMain.handle("agent:file-download", async (_event, shortCode: string, remotePath: string, localPath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.download(remotePath, localPath);
  });

  ipcMain.handle("agent:file-delete", async (_event, shortCode: string, remotePath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.delete(remotePath);
  });

  ipcMain.handle("agent:file-rename", async (_event, shortCode: string, oldPath: string, newPath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.rename(oldPath, newPath);
  });

  ipcMain.handle("agent:file-parse-3mf", async (_event, shortCode: string, remotePath: string): Promise<PlateInfo[]> => {
    const client = await getFileClientFor(shortCode);
    const fileName = remotePath.split("/").pop() ?? "download.gcode.3mf";
    const tempPath = join(tmpdir(), `agent-3mf-${Date.now()}-${randomUUID()}-${fileName}`);
    try {
      await client.download(remotePath, tempPath);
      const buffer = await readFile(tempPath);
      return await parseThreemf(buffer);
    } finally {
      await rm(tempPath, { force: true });
    }
  });

  ipcMain.handle("agent:file-thumbnail", async (_event, shortCode: string, remotePath: string): Promise<string | null> => {
    const isThreemf = remotePath.endsWith(".gcode.3mf");
    const isPlainGcode = !isThreemf && remotePath.endsWith(".gcode");
    if (!isThreemf && !isPlainGcode) return null;
    const client = await getFileClientFor(shortCode);
    const fileName = remotePath.split("/").pop() ?? "thumb";
    const tempPath = join(tmpdir(), `agent-thumb-${Date.now()}-${randomUUID()}-${fileName}`);
    try {
      await client.download(remotePath, tempPath);
      if (isPlainGcode) {
        const text = await readFile(tempPath, "utf8");
        return extractGcodeThumbnail(text);
      }
      const buffer = await readFile(tempPath);
      const zip = await JSZip.loadAsync(buffer);
      const png = findPlateThumbnail(zip);
      if (!png) return null;
      const base64 = await png.async("base64");
      return `data:image/png;base64,${base64}`;
    } catch {
      return null;
    } finally {
      await rm(tempPath, { force: true });
    }
  });

  ipcMain.handle("agent:pick-download-folder", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
```

Catatan: `registerIpcHandlers` sekarang menerima parameter `config: AgentConfig` (bukan tanpa argumen) — ini SATU-SATUNYA perubahan signature publik fungsi ini, dipanggil dari `index.ts` di Step 6 di bawah. `ipc.test.ts` yang sudah ada HARUS disesuaikan untuk memanggil `registerIpcHandlers({saasBaseUrl: "..."})` alih-alih `registerIpcHandlers()` tanpa argumen — cari SEMUA pemanggilan `registerIpcHandlers()` di `apps/agent/src/main/ipc.test.ts` dan tambahkan argumen `{ saasBaseUrl: "http://test.example.com" }` (nilai bebas asal konsisten, test yang sudah ada tidak menguji nilai baseUrl secara spesifik).

- [ ] **Step 6: Rewire `apps/agent/src/main/index.ts`**

```ts
// apps/agent/src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { createWindow, disableApplicationMenu } from './window'
import { createTray } from './tray'
import { attachHideOnClose } from './window-lifecycle'
import { startBroker } from './broker'
import { buildPairedDevices, ensureBrokerPin, loadCredentials, fetchLatestVersion, listLocalIpCandidates, loadOrCreateConfig } from '@3pb/agent-core'
import { startEngine } from '@3pb/agent-core'
import { publishLayout } from '@3pb/agent-core'
import { registerIpcHandlers } from './ipc'
import { setEngine, setBrokerPort, setBrokerPin, setReporters, setUpdateAvailable, setCredentialStoreDegraded } from './app-state'
import { SafeStorageCredentialStore, ElectronPathProvider, ElectronLogAdapter, getElectronBuildInfo } from './platform-electron'

const gotLock = app.requestSingleInstanceLock()
const credentialStore = new SafeStorageCredentialStore()
const pathProvider = new ElectronPathProvider()
const logger = new ElectronLogAdapter()
const buildInfo = getElectronBuildInfo()

let mainWindow: BrowserWindow | null = null
let isQuitting = false

async function bootstrap(): Promise<void> {
  try {
    const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
    const base = config.saasBaseUrl
    if (base) {
      console.log(`[agent] SaaS base URL: ${base}`)
    } else {
      logger.error(
        '[agent] SAAS_BASE_URL KOSONG — build ini tak tahu harus menghubungi server Slizebiz yang mana. ' +
          'Aktivasi/sync/layout PASTI gagal ("network_error"). Cek config.json di direktori data aplikasi.',
      )
    }
    console.log('[agent] kandidat IP LAN (urut prioritas):', listLocalIpCandidates().join(', ') || '(tidak ada)')

    const credentialResult = await credentialStore.load()
    setCredentialStoreDegraded(credentialResult.status === 'degraded')
    if (credentialResult.status === 'degraded') {
      logger.error('[agent] penyimpanan kredensial lokal bermasalah (safeStorage tak tersedia atau file gagal didekripsi) -- PIN broker session-only, minta user restart/cek support')
    }

    const brokerPin = await ensureBrokerPin(credentialStore, logger)
    setBrokerPin(brokerPin)

    const brokerResult = await startBroker(1883, brokerPin)
    if (!brokerResult.ok) {
      logger.error(
        `[agent] broker MQTT lokal gagal start (${brokerResult.reason}) — monitoring lokal tak akan jalan`,
      )
      registerIpcHandlers(config)
      return
    }
    setBrokerPort(brokerResult.port)

    const paired = await buildPairedDevices(base, credentialStore, pathProvider, buildInfo, logger)
    if (paired.length > 0) {
      const started = await startEngine(paired, brokerResult.port, brokerPin, logger)
      setEngine(started.engine)
      setReporters(started.reporters)
    }

    const blob = await loadCredentials(credentialStore)
    if (blob.agentToken) {
      await publishLayout(base, blob.agentToken, brokerResult.port, "default", brokerPin, logger)
    }
    registerIpcHandlers(config)
  } catch (err) {
    logger.error('[agent] bootstrap gagal di tengah jalan (broker/engine/layout) — IPC tetap didaftarkan biar renderer bisa recover', err)
    const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
    registerIpcHandlers(config)
  }
}

async function startUpdateChecks(): Promise<void> {
  const blob = await loadCredentials(credentialStore)
  if (!blob.agentToken) return
  const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
  const platform = process.platform === 'darwin' ? 'mac' : 'win'
  const check = async () => {
    const result = await fetchLatestVersion(config.saasBaseUrl, blob.agentToken!, platform, buildInfo, logger)
    if (result.ok) setUpdateAvailable(result.data.updateAvailable)
  }
  await check()
  const timer = setInterval(check, 6 * 60 * 60 * 1000)
  timer.unref?.()
}

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('ready', async () => {
    try {
      await bootstrap()
      void startUpdateChecks().catch((err) => logger.error('[agent] update check gagal', err))
    } catch (err) {
      logger.error('[agent] bootstrap gagal total', err)
    } finally {
      disableApplicationMenu()
      mainWindow = createWindow()
      attachHideOnClose(mainWindow, () => isQuitting)
      createTray(
        () => mainWindow,
        () => {
          isQuitting = true
          app.quit()
        },
      )
    }
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
}
```

Catatan penting: `bootstrap()` yang lama punya SATU `registerIpcHandlers()` di blok `finally` yang menjamin ipc SELALU terdaftar apa pun yang terjadi (komentar asli menjelaskan ini krusial). Versi baru di atas memanggil `registerIpcHandlers(config)` di 3 titik (early-return broker gagal, akhir try block sukses, catch block) alih-alih satu `finally` — INI PERUBAHAN STRUKTUR YANG HARUS DIVERIFIKASI HATI-HATI supaya invariant "selalu terdaftar tepat sekali" tetap terjaga. Alternatif yang lebih aman (dan LEBIH DEKAT ke struktur asli): pertahankan pola `try/finally` yang sama, cuma pindahkan `const config = await loadOrCreateConfig(...)` ke BARIS PALING ATAS `bootstrap()` (sebelum `try`), supaya `config` accessible di `finally` tanpa perlu resolve dua kali:

```ts
async function bootstrap(): Promise<void> {
  const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
  try {
    // ... isi try SAMA seperti sebelumnya, TANPA registerIpcHandlers(config) di dalamnya ...
  } catch (err) {
    logger.error('[agent] bootstrap gagal di tengah jalan (broker/engine/layout) — IPC tetap didaftarkan biar renderer bisa recover', err)
  } finally {
    registerIpcHandlers(config)
  }
}
```

**Pakai bentuk `finally` ini** (bukan 3 pemanggilan terpisah di atas) — cocokkan persis dengan struktur asli, minus `registerIpcHandlers()` yang sekarang butuh argumen `config`.

- [ ] **Step 7: Update `apps/agent/src/main/app-state.ts` — hapus `pickLocalIpCandidates`/`listLocalIpCandidates`/`getLocalIp` (sudah pindah ke core), sisakan `setEngine`/`getEngine`/dst**

```ts
// apps/agent/src/main/app-state.ts — HAPUS import os dan seluruh bagian VIRTUAL_IFACE_PATTERNS/
// isVirtualIface/pickLocalIpCandidates/listLocalIpCandidates/getLocalIp (baris 1, 33-85 di file
// lama). SISAKAN hanya bagian engine/brokerPort/brokerPin/reporters/updateAvailable/
// credentialStoreDegraded (baris 2-31 di file lama) TANPA PERUBAHAN.
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

let engine: Engine | null = null;
let brokerPort: number | null = null;
let brokerPin: string | null = null;
let reporters: MqttReporter[] = [];

export function setEngine(e: Engine | null): void { engine = e; }
export function getEngine(): Engine | null { return engine; }
export function setBrokerPort(port: number | null): void { brokerPort = port; }
export function getBrokerPort(): number | null { return brokerPort; }
export function setBrokerPin(pin: string | null): void { brokerPin = pin; }
export function getBrokerPin(): string | null { return brokerPin; }
export function setReporters(r: MqttReporter[]): void { reporters = r; }
export function getReporters(): MqttReporter[] { return reporters; }

let updateAvailable = false;

export function setUpdateAvailable(available: boolean): void { updateAvailable = available; }
export function getUpdateAvailable(): boolean { return updateAvailable; }

let credentialStoreDegraded = false;

export function setCredentialStoreDegraded(degraded: boolean): void { credentialStoreDegraded = degraded; }
export function getCredentialStoreDegraded(): boolean { return credentialStoreDegraded; }
```

Di `apps/agent/src/main/app-state.test.ts`, HAPUS test yang menguji `pickLocalIpCandidates`/`listLocalIpCandidates`/`getLocalIp` (sudah pindah + ada versi barunya di `packages/agent-core/src/local-network.test.ts` Task 13) — SISAKAN test untuk `setEngine`/`getEngine`/dst.

- [ ] **Step 8: Hapus file-file lama yang sudah sepenuhnya dipindah**

```bash
cd apps/agent/src/main
rm credential-store.ts credential-store.test.ts
rm device-cache.ts device-cache.test.ts
rm -rf discovery/
rm -rf file-manager/
rm saas-client.ts saas-client.test.ts
rm engine-manager.ts engine-manager.test.ts
rm layout-publisher.ts layout-publisher.test.ts
rm startup.ts startup.test.ts
rm printer-model.ts printer-model.test.ts
rm hms-table.ts
```

- [ ] **Step 9: Update `apps/agent/src/main/ipc.test.ts` — sesuaikan pemanggilan `registerIpcHandlers()`**

Baca `ipc.test.ts` yang sekarang secara lengkap. Cari SEMUA baris `registerIpcHandlers()` (dipanggil tanpa argumen di tiap test case) dan ganti jadi `registerIpcHandlers({ saasBaseUrl: "http://test.example.com" })`. Cari juga SEMUA `vi.mock("./credential-store", ...)`, `vi.mock("./saas-client", ...)`, `vi.mock("./discovery/...", ...)`, `vi.mock("./file-manager/...", ...)`, `vi.mock("./engine-manager", ...)`, `vi.mock("./startup", ...)`, `vi.mock("./layout-publisher", ...)` — ganti SEMUA jadi satu `vi.mock("@3pb/agent-core", async () => { const actual = await vi.importActual("@3pb/agent-core"); return { ...actual, loadCredentials: vi.fn(), saveCredentials: vi.fn(), fetchDevices: vi.fn(), /* ...semua fungsi yang sebelumnya di-mock terpisah, sekarang satu modul */ }; })` mengikuti pola `vi.mock` partial-module yang sudah dipakai `engine-manager.test.ts` lama untuk `@3pb/printer-monitor-core` (`const actual = await vi.importActual(...)`).

- [ ] **Step 10: Jalankan SELURUH test suite `apps/agent`, pastikan hijau**

Run: `cd apps/agent && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run`
Expected: semua test PASS, TERMASUK `ipc.test.ts` dan `broker.test.ts` yang tidak ikut dipindah tapi sekarang import dari `@3pb/agent-core`.

- [ ] **Step 11: Typecheck penuh**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 12: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-core-extraction
git add apps/agent/src/main/platform-electron.ts apps/agent/src/main/platform-electron.test.ts apps/agent/src/main/ipc.ts apps/agent/src/main/ipc.test.ts apps/agent/src/main/index.ts apps/agent/src/main/app-state.ts apps/agent/src/main/app-state.test.ts apps/agent/electron.vite.config.ts apps/agent/package.json pnpm-lock.yaml
git add -u apps/agent/src/main/credential-store.ts apps/agent/src/main/credential-store.test.ts apps/agent/src/main/device-cache.ts apps/agent/src/main/device-cache.test.ts apps/agent/src/main/discovery apps/agent/src/main/file-manager apps/agent/src/main/saas-client.ts apps/agent/src/main/saas-client.test.ts apps/agent/src/main/engine-manager.ts apps/agent/src/main/engine-manager.test.ts apps/agent/src/main/layout-publisher.ts apps/agent/src/main/layout-publisher.test.ts apps/agent/src/main/startup.ts apps/agent/src/main/startup.test.ts apps/agent/src/main/printer-model.ts apps/agent/src/main/printer-model.test.ts apps/agent/src/main/hms-table.ts
git commit -m "refactor(agent): rewire ipc.ts/index.ts to @3pb/agent-core, remove moved source files"
```

---

### Task 15: Verifikasi akhir + dokumentasi verifikasi manual

**Files:**
- Tidak ada file baru — task verifikasi murni.

- [ ] **Step 1: Jalankan seluruh test workspace yang terpengaruh**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/agent-core-extraction && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/agent-core test && pnpm --filter @3pb/agent test && pnpm --filter @3pb/printer-monitor-core test`
Expected: semua 3 package hijau.

- [ ] **Step 2: Typecheck seluruh workspace yang terpengaruh**

Run: `pnpm --filter @3pb/agent-core exec tsc --noEmit && pnpm --filter @3pb/agent exec tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 3: Build Electron beneran (bukan cuma test) untuk pastikan `WORKSPACE_TS_PACKAGES` dan bundling `@3pb/agent-core` benar**

Run: `cd apps/agent && npx electron-vite build`
Expected: build sukses tanpa error, cek `out/main/index.js` betul-betul berisi kode dari `@3pb/agent-core` (bukan `import "@3pb/agent-core"` yang tak ter-resolve):

```bash
grep -c "ERR_MODULE_NOT_FOUND\|@3pb/agent-core" out/main/index.js || true
```
Kalau grep nemu literal string `"@3pb/agent-core"` sebagai IMPORT STATEMENT (bukan cuma di komentar/string lain), itu tanda `externalizeDepsPlugin` GAGAL bundle package baru — cek lagi `WORKSPACE_TS_PACKAGES` di `electron.vite.config.ts`.

- [ ] **Step 4: Verifikasi runtime config `SAAS_BASE_URL` bekerja (manual, terdokumentasi di sini karena tidak bisa full-otomatis dari sesi agent)**

Catat di commit message/PR description: build ini BELUM di-test end-to-end dengan printer fisik/SaaS staging nyata — verifikasi manual berikut WAJIB sebelum dianggap selesai:
1. Jalankan `apps/agent` versi dev (`pnpm dev`) TANPA `SAAS_BASE_URL` di environment sama sekali → cek `config.json` yang ditulis di userData dir berisi `https://app.slizebiz.com`.
2. Hapus `config.json`, jalankan lagi DENGAN `SAAS_BASE_URL=http://192.168.88.113:3300 pnpm dev` → cek `config.json` yang ditulis berisi IP staging itu (bukan default).
3. Restart TANPA env var (config.json dari langkah 2 sudah ada) → cek app tetap connect ke `192.168.88.113:3300` (config existing tidak ditimpa).
4. Full pairing+sync+print flow sekali di device fisik untuk pastikan tidak ada regresi perilaku nyata dari seluruh refactor Plan A ini.

- [ ] **Step 5: Commit penutup (kalau ada perbaikan kecil dari verifikasi Step 1-3)**

Kalau semua verifikasi di atas lulus tanpa perlu perbaikan, tidak ada commit tambahan — Task 14 adalah commit terakhir dari Plan A. Kalau ketemu masalah di Step 1-3, perbaiki dan commit terpisah dengan pesan yang menyebutkan temuan spesifik.
