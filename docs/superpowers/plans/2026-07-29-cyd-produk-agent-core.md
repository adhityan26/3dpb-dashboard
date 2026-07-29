# CYD Produk — Sub-proyek 2: Agent Core (Electron Desktop) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi desktop (Electron, Windows) yang jembatani printer LAN customer ke layar CYD fisik — tarik device+layout dari SaaS (token), bantu pairing (auto-discovery + manual fallback), simpan kredensial 100% lokal, jalankan `packages/printer-monitor-core` Engine + broker `aedes` tertanam, tampilkan dashboard live.

**Architecture:** Electron main process = Node.js penuh, jalankan Engine+broker+discovery langsung (no sidecar). Renderer (React, via `electron-vite`) = UI, komunikasi ke main lewat IPC+`contextBridge` (kontekstual aman, tak expose Node API mentah ke renderer).

**Tech Stack:** Electron, `electron-vite` (scaffold+build), React (renderer), `aedes` (broker MQTT tertanam), `bonjour-service` (mDNS discovery Moonraker), `dgram` bawaan Node (SSDP discovery Bambu), `electron-builder` (installer Windows), `@3pb/printer-monitor-core` (reuse Engine/connector, workspace dependency), Vitest (test).

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum perintah apa pun.
- Monorepo pnpm-strict — dependency harus dideklarasikan eksplisit di `apps/agent/package.json`. **`aedes` cuma `devDependency` di `packages/printer-monitor-core`** (dipakai buat test doang) — `apps/agent` WAJIB deklarasi `aedes` + `bonjour-service` sendiri sebagai `dependencies` (bukan phantom dari core).
- **JANGAN `git add -A`/`git add .`** — selalu `git add <path spesifik>`.
- **ID device di `Engine`/`DeviceConfig.id` HARUS persis `Device.shortCode` dari SaaS** (bukan `Device.id`/cuid) — ini kunci korelasi ke cell layout. Salah pakai ID lain = rendering CYD gagal diam-diam.
- **`MqttReporter` default `statusTopic` adalah `3dpb/printers-v2`** — WAJIB override eksplisit ke `3dpb/printers` (kontrak CYD) saat instansiasi, jangan andalkan default.
- **`HmsLookup`** default-nya load `hms-codes.json` via `readFileSync(new URL(...))` — pola ini rawan patah kalau di-bundle Electron. WAJIB inject table eksplisit lewat konstruktor (`new HmsLookup(table)`), bukan andalkan default loading.
- Kredensial (token, IP, serial, access code) HARUS lewat `safeStorage`, tidak pernah plain-text di file lain atau dikirim ke server.
- Auth API SaaS: 401 (`invalid_token`) vs 403 (`entitlement_expired`) itu 2 kondisi beda arti — UI WAJIB bedakan pesannya, jangan digeneralisir jadi 1 pesan "gagal konek".
- Endpoint token-auth SaaS (sudah ada, dari sub-proyek 1): `GET https://<saas-host>/api/agent/devices` dan `GET https://<saas-host>/api/agent/layout`, header `Authorization: Bearer <token>`. Base URL SaaS dikonfigurasi lewat env var build-time (`SAAS_BASE_URL`), BUKAN setting yang di-expose ke user awam.

---

## File Structure

**Baru (semua di `apps/agent/`):**
- `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `electron-builder.yml`
- `src/main/index.ts` — entry, single-instance lock, window lifecycle
- `src/main/credential-store.ts` — `safeStorage` wrapper (token+kredensial device)
- `src/main/device-cache.ts` — cache metadata non-rahasia (label/printerType) lokal
- `src/main/saas-client.ts` — HTTP client ke `/api/agent/devices`+`/api/agent/layout`
- `src/main/discovery/bambu-ssdp.ts` — listener SSDP Bambu
- `src/main/discovery/moonraker-mdns.ts` — browse mDNS Moonraker
- `src/main/broker.ts` — setup `aedes` tertanam
- `src/main/engine-manager.ts` — wire Engine+connector+reporter per device terpasang
- `src/main/layout-publisher.ts` — tarik layout SaaS, republish retained ke broker lokal
- `src/main/ipc.ts` — handler IPC (dipanggil dari `index.ts`)
- `src/preload/index.ts` — `contextBridge` expose API aman ke renderer
- `src/renderer/` — `App.tsx`, `screens/ActivationScreen.tsx`, `screens/PairingScreen.tsx`, `screens/DashboardScreen.tsx`, `main.tsx`, `index.html`

**Tidak ada file existing yang dimodifikasi** — sub-proyek ini murni package baru, tidak menyentuh `apps/saas`/`apps/dashboard`/`packages/printer-monitor-core` sama sekali (reuse tanpa modifikasi, sesuai spec).

---

### Task 1: Scaffold `apps/agent` (electron-vite + toolchain end-to-end)

**Files:**
- Create: `apps/agent/package.json`, `apps/agent/tsconfig.json`, `apps/agent/tsconfig.node.json`, `apps/agent/tsconfig.web.json`, `apps/agent/electron.vite.config.ts`
- Create: `apps/agent/src/main/index.ts` (minimal — cuma buka window kosong)
- Create: `apps/agent/src/preload/index.ts` (kosong, placeholder valid — `export {}`)
- Create: `apps/agent/src/renderer/index.html`, `apps/agent/src/renderer/main.tsx`, `apps/agent/src/renderer/App.tsx` (render teks "Slizebiz Agent" doang)

**Interfaces:**
- Produces: struktur project yang bisa di-`pnpm dev`/`pnpm build` — task berikutnya nambah isi ke file-file yang sudah ada di sini.

- [ ] **Step 1: Scaffold via `electron-vite` CLI**

Run: `cd apps/agent 2>/dev/null || mkdir -p apps/agent && cd apps/agent && pnpm create electron-vite@latest . -- --template react-ts`

Kalau CLI minta konfirmasi overwrite folder, jawab lanjut (folder memang baru dibuat kosong).

- [ ] **Step 2: Sesuaikan `package.json` — nama package + workspace convention**

Edit `apps/agent/package.json`, ganti `"name"` jadi `"@3pb/agent"`, tambahkan `"private": true`. Pastikan `dependencies` punya (tambah manual kalau scaffold belum include):
```json
"@3pb/printer-monitor-core": "workspace:*",
"aedes": "^0.51.3",
"bonjour-service": "^1.2.1"
```
Dan `devDependencies` tambah:
```json
"vitest": "^1.6.1"
```
Tambahkan script test: `"test": "vitest run"`.

- [ ] **Step 3: `pnpm install` dari root**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis && pnpm install`
Expected: sukses, `apps/agent` ke-resolve sebagai workspace member baru, `pnpm-lock.yaml` ter-update.

- [ ] **Step 4: Render teks statis di `App.tsx` (bukti toolchain jalan end-to-end)**

```tsx
// apps/agent/src/renderer/App.tsx
export default function App() {
  return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Slizebiz Agent</div>
}
```

- [ ] **Step 5: Verifikasi build**

Run: `cd apps/agent && npx electron-vite build`
Expected: exit 0, folder `out/` terisi (main/preload/renderer ter-bundle).

- [ ] **Step 6: Verifikasi `pnpm test` (belum ada test file, harus lulus kosong)**

Run: `cd apps/agent && npx vitest run --passWithNoTests`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/package.json apps/agent/tsconfig.json apps/agent/tsconfig.node.json apps/agent/tsconfig.web.json apps/agent/electron.vite.config.ts apps/agent/src pnpm-lock.yaml
git commit -m "feat(agent): scaffold apps/agent electron-vite + react-ts"
```

---

### Task 2: Credential store (`safeStorage`, TDD)

**Files:**
- Create: `apps/agent/src/main/credential-store.ts`
- Create: `apps/agent/src/main/credential-store.test.ts`

**Interfaces:**
- Consumes: `electron` `safeStorage` API (`isEncryptionAvailable`, `encryptString`, `decryptString`), `app.getPath('userData')`, Node `fs`.
- Produces: `interface DeviceSecret { ip: string; serial: string; accessCode: string }`, `interface CredentialBlob { agentToken: string | null; devices: Record<string, DeviceSecret> }`, `async function loadCredentials(): Promise<CredentialBlob>` (balikin blob kosong `{agentToken: null, devices: {}}` kalau file belum ada ATAU gagal decrypt — TAK PERNAH throw), `async function saveCredentials(blob: CredentialBlob): Promise<void>`. Task 8 (engine-manager) & Task 11 (renderer aktivasi) konsumsi ini.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/main/credential-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

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

import { loadCredentials, saveCredentials } from "./credential-store";
import { safeStorage } from "electron";

beforeEach(() => vi.clearAllMocks());

describe("loadCredentials", () => {
  it("balikin blob kosong kalau file belum ada", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    const blob = await loadCredentials();
    expect(blob).toEqual({ agentToken: null, devices: {} });
  });

  it("balikin blob kosong (bukan throw) kalau decrypt gagal", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from("corrupt"));
    (safeStorage.decryptString as any).mockImplementation(() => { throw new Error("DPAPI fail"); });
    const blob = await loadCredentials();
    expect(blob).toEqual({ agentToken: null, devices: {} });
  });

  it("balikin blob kosong kalau safeStorage.isEncryptionAvailable() false", async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValue(false);
    (fs.existsSync as any).mockReturnValue(true);
    const blob = await loadCredentials();
    expect(blob).toEqual({ agentToken: null, devices: {} });
  });

  it("decrypt+parse blob tersimpan dengan benar", async () => {
    const stored = { agentToken: "slz_abc", devices: { xyz1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } } };
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from(`ENC(${JSON.stringify(stored)})`));
    const blob = await loadCredentials();
    expect(blob).toEqual(stored);
  });
});

describe("saveCredentials", () => {
  it("encrypt lalu tulis file, bikin folder kalau belum ada", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    const blob = { agentToken: "slz_x", devices: {} };
    await saveCredentials(blob);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/fake/userdata", { recursive: true });
    expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(blob));
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/credential-store.test.ts`
Expected: FAIL — `./credential-store` belum ada.

- [ ] **Step 3: Implementasi**

```typescript
// apps/agent/src/main/credential-store.ts
import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface DeviceSecret {
  ip: string;
  serial: string;
  accessCode: string;
}

export interface CredentialBlob {
  agentToken: string | null;
  devices: Record<string, DeviceSecret>;
}

const EMPTY_BLOB: CredentialBlob = { agentToken: null, devices: {} };

function credentialFilePath(): string {
  return path.join(app.getPath("userData"), "credentials.enc");
}

/** Tak pernah throw — file absen/gagal decrypt/enkripsi tak tersedia semuanya jadi blob kosong (minta pairing ulang). */
export async function loadCredentials(): Promise<CredentialBlob> {
  const filePath = credentialFilePath();
  if (!safeStorage.isEncryptionAvailable()) return EMPTY_BLOB;
  if (!fs.existsSync(filePath)) return EMPTY_BLOB;
  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted) as CredentialBlob;
  } catch {
    return EMPTY_BLOB;
  }
}

export async function saveCredentials(blob: CredentialBlob): Promise<void> {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(blob));
  fs.writeFileSync(credentialFilePath(), encrypted);
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/credential-store.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/credential-store.ts apps/agent/src/main/credential-store.test.ts
git commit -m "feat(agent): credential store via safeStorage, gagal-decrypt jadi blob kosong bukan crash"
```

---

### Task 3: Cache metadata device non-rahasia (TDD)

**Files:**
- Create: `apps/agent/src/main/device-cache.ts`
- Create: `apps/agent/src/main/device-cache.test.ts`

**Interfaces:**
- Consumes: Node `fs`, `app.getPath('userData')` (sama seperti Task 2, TAPI file terpisah & TIDAK dienkripsi — ini metadata non-rahasia).
- Produces: `interface CachedDevice { shortCode: string; label: string; printerType: string }`, `async function loadDeviceCache(): Promise<CachedDevice[]>` (balikin `[]` kalau file gak ada/rusak), `async function saveDeviceCache(devices: CachedDevice[]): Promise<void>`. Task 8 (engine-manager) konsumsi ini buat rekonstruksi Engine pas SaaS unreachable.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/main/device-cache.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => "/fake/userdata") } }));
vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
}));

import { loadDeviceCache, saveDeviceCache } from "./device-cache";

beforeEach(() => vi.clearAllMocks());

describe("loadDeviceCache", () => {
  it("balikin [] kalau file belum ada", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    expect(await loadDeviceCache()).toEqual([]);
  });

  it("balikin [] (bukan throw) kalau file isinya JSON rusak", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue("bukan json valid{{{");
    expect(await loadDeviceCache()).toEqual([]);
  });

  it("parse isi file dengan benar", async () => {
    const cached = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu" }];
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(cached));
    expect(await loadDeviceCache()).toEqual(cached);
  });
});

describe("saveDeviceCache", () => {
  it("tulis JSON plain (tak terenkripsi) ke file", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    const devices = [{ shortCode: "x", label: "L", printerType: "moonraker" }];
    await saveDeviceCache(devices);
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining("device-cache.json"), JSON.stringify(devices));
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/device-cache.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```typescript
// apps/agent/src/main/device-cache.ts
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface CachedDevice {
  shortCode: string;
  label: string;
  printerType: string;
}

function cacheFilePath(): string {
  return path.join(app.getPath("userData"), "device-cache.json");
}

/** Non-rahasia (label/tipe doang) — plain JSON, TANPA enkripsi. Dipakai rekonstruksi Engine pas SaaS unreachable. */
export async function loadDeviceCache(): Promise<CachedDevice[]> {
  const filePath = cacheFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CachedDevice[];
  } catch {
    return [];
  }
}

export async function saveDeviceCache(devices: CachedDevice[]): Promise<void> {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cacheFilePath(), JSON.stringify(devices));
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/device-cache.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/device-cache.ts apps/agent/src/main/device-cache.test.ts
git commit -m "feat(agent): cache metadata device non-rahasia, jaga rekonstruksi Engine offline"
```

---

### Task 4: Klien API SaaS (device list + layout, TDD)

**Files:**
- Create: `apps/agent/src/main/saas-client.ts`
- Create: `apps/agent/src/main/saas-client.test.ts`

**Interfaces:**
- Consumes: global `fetch` (Node 22 punya built-in), `SAAS_BASE_URL` (env var, lihat Global Constraints).
- Produces: `interface SaasDevice { id: string; shortCode: string; userId: string; label: string; printerType: string; createdAt: string; updatedAt: string }`, `type FetchResult<T> = { ok: true; data: T } | { ok: false; kind: "invalid_token" | "entitlement_expired" | "network_error" }`, `async function fetchDevices(token: string): Promise<FetchResult<SaasDevice[]>>`, `async function fetchLayout(token: string): Promise<FetchResult<LayoutConfigOut | null>>` (`null` = 404, belum diatur — BUKAN error). Task 8 & 9 & 11 konsumsi ini.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/main/saas-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDevices, fetchLayout } from "./saas-client";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
  process.env.SAAS_BASE_URL = "http://192.168.88.113:3300";
});

describe("fetchDevices", () => {
  it("ok:true + data kalau 200", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    const result = await fetchDevices("slz_valid");
    expect(result).toEqual({ ok: true, data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    expect(fetchMock).toHaveBeenCalledWith("http://192.168.88.113:3300/api/agent/devices", { headers: { Authorization: "Bearer slz_valid" } });
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchDevices("slz_bad")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await fetchDevices("slz_valid")).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw (SaaS unreachable)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchDevices("slz_valid")).toEqual({ ok: false, kind: "network_error" });
  });
});

describe("fetchLayout", () => {
  it("ok:true + data:null kalau 404 (belum diatur, BUKAN error)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "no_layout" }) });
    expect(await fetchLayout("slz_valid")).toEqual({ ok: true, data: null });
  });

  it("ok:true + data layout kalau 200", async () => {
    const layout = { schemaVersion: 1, pages: [] };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => layout });
    expect(await fetchLayout("slz_valid")).toEqual({ ok: true, data: layout });
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchLayout("slz_bad")).toEqual({ ok: false, kind: "invalid_token" });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/saas-client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```typescript
// apps/agent/src/main/saas-client.ts
export interface SaasDevice {
  id: string;
  shortCode: string;
  userId: string;
  label: string;
  printerType: string;
  createdAt: string;
  updatedAt: string;
}

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "invalid_token" | "entitlement_expired" | "network_error" };

function baseUrl(): string {
  return process.env.SAAS_BASE_URL ?? "";
}

export async function fetchDevices(token: string): Promise<FetchResult<SaasDevice[]>> {
  try {
    const res = await fetch(`${baseUrl()}/api/agent/devices`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    return { ok: true, data: (await res.json()) as SaasDevice[] };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export async function fetchLayout(token: string): Promise<FetchResult<unknown | null>> {
  try {
    const res = await fetch(`${baseUrl()}/api/agent/layout`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return { ok: false, kind: "network_error" };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/saas-client.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/saas-client.ts apps/agent/src/main/saas-client.test.ts
git commit -m "feat(agent): klien API SaaS — bedakan invalid_token/entitlement_expired/network_error"
```

---

### Task 5: Discovery SSDP Bambu (TDD + validasi POC)

**Files:**
- Create: `apps/agent/src/main/discovery/bambu-ssdp.ts`
- Create: `apps/agent/src/main/discovery/bambu-ssdp.test.ts`

**Interfaces:**
- Consumes: Node `dgram` (bawaan).
- Produces: `interface DiscoveredBambuPrinter { ip: string; serial: string; model: string; name: string }`, `type ScanResult = { ok: true; printers: DiscoveredBambuPrinter[] } | { ok: false; reason: "port_in_use" }`, `async function scanBambu(durationMs?: number): Promise<ScanResult>`. Task 12 (renderer pairing) konsumsi ini.

Ini port dari POC yang SUDAH divalidasi live (lihat riwayat brainstorm — 8/10 printer produksi tertangkap nyata). Logika parsing SUDAH benar, task ini murni bungkus jadi modul testable + tambah penanganan `EADDRINUSE` (BambuStudio conflict) + `reuseAddr` sesuai temuan review Fable.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/main/discovery/bambu-ssdp.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import dgram from "node:dgram";

vi.mock("node:dgram", () => ({
  default: { createSocket: vi.fn() },
}));

import { parseSsdpPacket, scanBambu } from "./bambu-ssdp";

describe("parseSsdpPacket", () => {
  it("parse packet NOTIFY Bambu jadi DiscoveredBambuPrinter", () => {
    const raw = [
      "NOTIFY * HTTP/1.1",
      "HOST: 239.255.255.250:1900",
      "Server: UPnP/1.0",
      "Location: 192.168.88.22",
      "NT: urn:bambulab-com:device:3dprinter:1",
      "USN: 00M09D562001206",
      "DevModel.bambu.com: BL-P001",
      "DevName.bambu.com: Jupiter",
      "",
    ].join("\r\n");
    const parsed = parseSsdpPacket(Buffer.from(raw), "192.168.88.22");
    expect(parsed).toEqual({ ip: "192.168.88.22", serial: "00M09D562001206", model: "BL-P001", name: "Jupiter" });
  });

  it("balikin null kalau bukan packet Bambu (gak ada header bambu)", () => {
    const raw = "NOTIFY * HTTP/1.1\r\nHOST: x\r\n";
    expect(parseSsdpPacket(Buffer.from(raw), "1.2.3.4")).toBeNull();
  });
});

describe("scanBambu", () => {
  let onMessageCb: ((msg: Buffer, rinfo: { address: string }) => void) | null = null;
  let onErrorCb: ((err: NodeJS.ErrnoException) => void) | null = null;

  function mockSocket() {
    onMessageCb = null;
    onErrorCb = null;
    return {
      on: vi.fn((event: string, cb: any) => {
        if (event === "message") onMessageCb = cb;
        if (event === "error") onErrorCb = cb;
      }),
      bind: vi.fn((_port: number, cb: () => void) => cb()),
      close: vi.fn(),
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it("kumpulkan printer dari beberapa packet dalam durasi scan", async () => {
    const sockets = [mockSocket(), mockSocket()];
    (dgram.createSocket as any).mockImplementation(() => sockets.shift());

    const promise = scanBambu(10);
    // Simulasikan 1 packet masuk di socket pertama (port 2021) setelah bind
    const raw = ["NOTIFY * HTTP/1.1", "NT: urn:bambulab-com:device:3dprinter:1", "USN: SERIAL1", "DevModel.bambu.com: C12", "DevName.bambu.com: Neptune", ""].join("\r\n");
    onMessageCb?.(Buffer.from(raw), { address: "192.168.88.106" });

    const result = await promise;
    expect(result).toEqual({ ok: true, printers: [{ ip: "192.168.88.106", serial: "SERIAL1", model: "C12", name: "Neptune" }] });
  });

  it("kalau SEMUA socket gagal bind EADDRINUSE, balikin ok:false reason:port_in_use", async () => {
    const sockets = [mockSocket(), mockSocket()];
    sockets.forEach((s) => { s.bind = vi.fn(); }); // bind tak pernah panggil cb sukses
    (dgram.createSocket as any).mockImplementation(() => sockets.shift());

    const promise = scanBambu(10);
    const err = new Error("bind EADDRINUSE") as NodeJS.ErrnoException;
    err.code = "EADDRINUSE";
    onErrorCb?.(err);
    onErrorCb?.(err);

    const result = await promise;
    expect(result).toEqual({ ok: false, reason: "port_in_use" });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/discovery/bambu-ssdp.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```typescript
// apps/agent/src/main/discovery/bambu-ssdp.ts
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

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/discovery/bambu-ssdp.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Verifikasi manual sekali di jaringan nyata (opsional tapi disarankan, sudah pernah lolos POC)**

Run: `cd apps/agent && node -e "import('./src/main/discovery/bambu-ssdp.ts').then(m => m.scanBambu(20000).then(r => console.log(JSON.stringify(r, null, 2))))"` (atau lewat `tsx` kalau `node --experimental-strip-types` belum stabil di versi Node yang dipakai). Kalau printer Bambu nyala di LAN yang sama, harus muncul di hasil — samakan dengan hasil POC awal.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/discovery/bambu-ssdp.ts apps/agent/src/main/discovery/bambu-ssdp.test.ts
git commit -m "feat(agent): discovery SSDP Bambu — reuseAddr + deteksi konflik BambuStudio"
```

---

### Task 6: Discovery mDNS Moonraker (TDD)

**Files:**
- Create: `apps/agent/src/main/discovery/moonraker-mdns.ts`
- Create: `apps/agent/src/main/discovery/moonraker-mdns.test.ts`

**Interfaces:**
- Consumes: `bonjour-service` (`Bonjour`, `.find({type, protocol})`).
- Produces: `interface DiscoveredMoonrakerPrinter { ip: string; name: string }`, `async function scanMoonraker(durationMs?: number): Promise<DiscoveredMoonrakerPrinter[]>`. Task 12 (renderer pairing) konsumsi ini.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/main/discovery/moonraker-mdns.test.ts
import { describe, it, expect, vi } from "vitest";

const mockBrowser = { on: vi.fn(), stop: vi.fn() };
const mockBonjourInstance = { find: vi.fn(() => mockBrowser), destroy: vi.fn() };
vi.mock("bonjour-service", () => ({ Bonjour: vi.fn(() => mockBonjourInstance) }));

import { scanMoonraker } from "./moonraker-mdns";

describe("scanMoonraker", () => {
  it("kumpulkan service yang ditemukan dalam durasi scan", async () => {
    mockBrowser.on.mockImplementation((event: string, cb: any) => {
      if (event === "up") {
        setTimeout(() => cb({ name: "Ganymede", addresses: ["192.168.88.40", "fe80::1"], port: 7125 }), 5);
      }
    });
    const result = await scanMoonraker(20);
    expect(result).toEqual([{ ip: "192.168.88.40", name: "Ganymede" }]);
    expect(mockBonjourInstance.find).toHaveBeenCalledWith({ type: "moonraker", protocol: "tcp" });
  });

  it("pilih alamat IPv4 pertama, skip IPv6", async () => {
    mockBrowser.on.mockImplementation((event: string, cb: any) => {
      if (event === "up") setTimeout(() => cb({ name: "X", addresses: ["fe80::1", "10.0.0.5"], port: 7125 }), 5);
    });
    const result = await scanMoonraker(20);
    expect(result).toEqual([{ ip: "10.0.0.5", name: "X" }]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/discovery/moonraker-mdns.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```typescript
// apps/agent/src/main/discovery/moonraker-mdns.ts
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

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/discovery/moonraker-mdns.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/discovery/moonraker-mdns.ts apps/agent/src/main/discovery/moonraker-mdns.test.ts
git commit -m "feat(agent): discovery mDNS Moonraker via bonjour-service"
```

---

### Task 7: Broker `aedes` tertanam + single-instance lock (TDD)

**Files:**
- Create: `apps/agent/src/main/broker.ts`
- Create: `apps/agent/src/main/broker.test.ts`
- Modify: `apps/agent/src/main/index.ts` (tambah `app.requestSingleInstanceLock()`)

**Interfaces:**
- Consumes: `aedes` (`Aedes`), Node `net` (`createServer`).
- Produces: `interface BrokerStartResult { ok: true; port: number } | { ok: false; reason: "port_in_use" }`, `async function startBroker(port?: number): Promise<BrokerStartResult>`, `function stopBroker(): Promise<void>`. Task 8 (engine-manager, konek `MqttReporter` ke broker ini) & Task 9 (layout-publisher) konsumsi ini.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/main/broker.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { startBroker, stopBroker } from "./broker";

describe("startBroker", () => {
  afterEach(async () => {
    await stopBroker();
  });

  it("berhasil listen di port default 1883, balikin ok:true+port", async () => {
    const result = await startBroker();
    expect(result).toEqual({ ok: true, port: 1883 });
  });

  it("balikin ok:false reason:port_in_use kalau port sudah dipakai proses lain", async () => {
    const first = await startBroker(18830);
    expect(first.ok).toBe(true);
    // startBroker kedua di port SAMA tanpa stop dulu, dari instance server net terpisah — simulasikan EADDRINUSE
    const net = await import("node:net");
    const blocker = net.createServer();
    await new Promise<void>((res) => blocker.listen(18831, res));
    const second = await startBroker(18831);
    expect(second).toEqual({ ok: false, reason: "port_in_use" });
    blocker.close();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/broker.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```typescript
// apps/agent/src/main/broker.ts
import Aedes from "aedes";
import net from "node:net";

export type BrokerStartResult = { ok: true; port: number } | { ok: false; reason: "port_in_use" };

let server: net.Server | null = null;
let aedesInstance: Aedes | null = null;

export function startBroker(port = 1883): Promise<BrokerStartResult> {
  return new Promise((resolve) => {
    aedesInstance = new Aedes();
    server = net.createServer(aedesInstance.handle);
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve({ ok: false, reason: "port_in_use" });
    });
    server.listen(port, () => resolve({ ok: true, port }));
  });
}

export function stopBroker(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      server = null;
      aedesInstance = null;
      resolve();
    });
  });
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/broker.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Single-instance lock di `index.ts`**

Baca `apps/agent/src/main/index.ts` (hasil scaffold Task 1) dulu, lalu tambahkan di baris paling awal (sebelum `app.whenReady()`):

```typescript
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  // ...sisa kode app.whenReady() yang sudah ada, dipindah ke dalam blok else ini
}
```

- [ ] **Step 6: Verifikasi manual — buka app 2x, instance kedua harus fokus ke window pertama bukan buka window baru**

(Langkah ini perlu dijalankan user setelah packaging — Claude tak punya cara otomatis memverifikasi perilaku multi-proses OS-level. Catat di laporan sebagai item verifikasi manual.)

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/main/broker.ts apps/agent/src/main/broker.test.ts apps/agent/src/main/index.ts
git commit -m "feat(agent): broker aedes tertanam + single-instance lock"
```

---

### Task 8: Engine manager — wire Engine+connector+reporter (TDD)

**Files:**
- Create: `apps/agent/src/main/engine-manager.ts`
- Create: `apps/agent/src/main/engine-manager.test.ts`
- Create: `apps/agent/src/main/hms-table.ts` (re-export JSON buat inject ke `HmsLookup`, hindari gotcha `import.meta.url` core)

**Interfaces:**
- Consumes: `Engine`, `BambuMqttConnector`, `MoonrakerConnector`, `MqttReporter`, `HmsLookup`, `DeviceConfig` (semua dari `@3pb/printer-monitor-core`), `DeviceSecret` (Task 2), `CachedDevice` (Task 3).
- Produces: `interface PairedDevice { shortCode: string; label: string; printerType: string; secret: DeviceSecret }`, `async function startEngine(paired: PairedDevice[], brokerPort: number): Promise<Engine>` (bikin `DeviceConfig[]` dengan **`id = shortCode`** persis, `MqttReporter` dengan `statusTopic` di-override eksplisit ke `"3dpb/printers"`, `HmsLookup` diisi table eksplisit). Task 11 (renderer dashboard, baca `engine.snapshot()`) konsumsi return value ini via IPC (Task 10).

- [ ] **Step 1: Buat `hms-table.ts` — re-export JSON aman-bundle**

```typescript
// apps/agent/src/main/hms-table.ts
// Import JSON langsung (bukan andalkan HmsLookup default loading via import.meta.url,
// yang rawan patah kalau di-bundle Electron/asar — lihat Global Constraints plan ini).
import hmsCodes from "../../../../packages/printer-monitor-core/src/hms-codes.json";

export const hmsTable: Record<string, string> = hmsCodes as Record<string, string>;
```

(Path relatif di atas mengasumsikan `apps/agent` sejajar `packages/printer-monitor-core` — sesuaikan kalau resolver bundler butuh alias berbeda; verifikasi lewat Step 4 di bawah, kalau resolusi gagal ganti ke `JSON.parse(fs.readFileSync(require.resolve('@3pb/printer-monitor-core/src/hms-codes.json'), 'utf8'))`.)

- [ ] **Step 2: Tulis failing test**

```typescript
// apps/agent/src/main/engine-manager.test.ts
import { describe, it, expect, vi } from "vitest";

const connectMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@3pb/printer-monitor-core", async () => {
  const actual = await vi.importActual<any>("@3pb/printer-monitor-core");
  return {
    ...actual,
    MqttReporter: vi.fn().mockImplementation((opts) => ({ ...opts, connect: connectMock, publishStatus: vi.fn(), emitEvent: vi.fn(), close: vi.fn() })),
  };
});

import { startEngine } from "./engine-manager";
import { MqttReporter } from "@3pb/printer-monitor-core";

describe("startEngine", () => {
  it("bikin DeviceConfig dengan id = shortCode (BUKAN label/serial lain)", async () => {
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "SER1", accessCode: "1234" } }];
    const engine = await startEngine(paired, 1883);
    const snapshot = engine.snapshot();
    expect(snapshot.payload[0].id).toBe("abc1234567");
  });

  it("override statusTopic ke 3dpb/printers (BUKAN default 3dpb/printers-v2)", async () => {
    await startEngine([{ shortCode: "x", label: "L", printerType: "moonraker", secret: { ip: "10.0.0.5", serial: "", accessCode: "" } }], 1883);
    expect(MqttReporter).toHaveBeenCalledWith(expect.objectContaining({ statusTopic: "3dpb/printers" }));
  });

  it("printerType tak dikenal di-skip (bukan crash seluruh Engine)", async () => {
    const paired = [
      { shortCode: "a", label: "A", printerType: "bambu", secret: { ip: "1.1.1.1", serial: "S", accessCode: "C" } },
      { shortCode: "b", label: "B", printerType: "prusa-tak-didukung", secret: { ip: "2.2.2.2", serial: "", accessCode: "" } },
    ];
    const engine = await startEngine(paired, 1883);
    expect(engine.snapshot().payload.map((p) => p.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/engine-manager.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementasi**

```typescript
// apps/agent/src/main/engine-manager.ts
import { Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter, HmsLookup } from "@3pb/printer-monitor-core";
import type { DeviceConfig, Connector } from "@3pb/printer-monitor-core";
import type { DeviceSecret } from "./credential-store";
import { hmsTable } from "./hms-table";

export interface PairedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  secret: DeviceSecret;
}

export async function startEngine(paired: PairedDevice[], brokerPort: number): Promise<Engine> {
  const devices: DeviceConfig[] = [];
  const connectors: Connector[] = [];

  for (const p of paired) {
    if (p.printerType !== "bambu" && p.printerType !== "moonraker") {
      console.warn(`[engine-manager] printerType tak didukung, di-skip: ${p.printerType} (${p.shortCode})`);
      continue;
    }
    const device: DeviceConfig = {
      id: p.shortCode, // WAJIB persis shortCode — kunci korelasi ke cell layout (Global Constraints)
      name: p.label,
      type: p.printerType,
      connector: p.printerType,
      ip: p.secret.ip,
      serial: p.secret.serial || undefined,
      accessCode: p.secret.accessCode || undefined,
    };
    devices.push(device);
    connectors.push(
      p.printerType === "bambu" ? new BambuMqttConnector(device) : new MoonrakerConnector(device)
    );
  }

  const reporter = new MqttReporter({
    url: `mqtt://127.0.0.1:${brokerPort}`,
    statusTopic: "3dpb/printers", // WAJIB override — default reporter "3dpb/printers-v2" salah buat kontrak CYD
  });
  await reporter.connect();

  const engine = new Engine({
    devices,
    connectors,
    reporters: [reporter],
    hms: new HmsLookup(hmsTable), // inject eksplisit — hindari gotcha import.meta.url default loading
  });
  await engine.start();
  return engine;
}
```

- [ ] **Step 5: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/engine-manager.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/engine-manager.ts apps/agent/src/main/engine-manager.test.ts apps/agent/src/main/hms-table.ts
git commit -m "feat(agent): engine-manager — wire Engine+connector+reporter, id=shortCode, topic+hms eksplisit"
```

---

### Task 9: Layout publisher (TDD)

**Files:**
- Create: `apps/agent/src/main/layout-publisher.ts`
- Create: `apps/agent/src/main/layout-publisher.test.ts`

**Interfaces:**
- Consumes: `fetchLayout` (Task 4), `mqtt` package (buat konek ke broker lokal Task 7 dan publish retained).
- Produces: `async function publishLayout(token: string, brokerPort: number): Promise<{ published: boolean }>` (`published: false` kalau layout belum diatur di web — SKIP publish, bukan error).

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/main/layout-publisher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./saas-client", () => ({ fetchLayout: vi.fn() }));

const publishAsyncMock = vi.fn().mockResolvedValue(undefined);
const endAsyncMock = vi.fn().mockResolvedValue(undefined);
vi.mock("mqtt", () => ({
  default: { connectAsync: vi.fn(() => Promise.resolve({ publishAsync: publishAsyncMock, endAsync: endAsyncMock })) },
}));

import { fetchLayout } from "./saas-client";
import { publishLayout } from "./layout-publisher";

beforeEach(() => vi.clearAllMocks());

describe("publishLayout", () => {
  it("skip publish (published:false) kalau layout belum diatur (data:null)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: true, data: null });
    const result = await publishLayout("slz_x", 1883);
    expect(result).toEqual({ published: false });
    expect(publishAsyncMock).not.toHaveBeenCalled();
  });

  it("publish retained ke topic 3dpb/cyd/<deviceId>/layout kalau layout ada", async () => {
    const layout = { schemaVersion: 1, pages: [{ id: "p1", cells: [] }] };
    (fetchLayout as any).mockResolvedValue({ ok: true, data: layout });
    const result = await publishLayout("slz_x", 1883, "my-cyd-1");
    expect(result).toEqual({ published: true });
    expect(publishAsyncMock).toHaveBeenCalledWith("3dpb/cyd/my-cyd-1/layout", JSON.stringify(layout), { retain: true });
  });

  it("skip publish kalau fetchLayout gagal (network_error dll)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: false, kind: "network_error" });
    const result = await publishLayout("slz_x", 1883);
    expect(result).toEqual({ published: false });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/layout-publisher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```typescript
// apps/agent/src/main/layout-publisher.ts
import mqtt from "mqtt";
import { fetchLayout } from "./saas-client";

/** deviceId default "default" — sesuai kontrak lama §13 (1 layar CYD per akun, MVP sub-proyek 1). */
export async function publishLayout(token: string, brokerPort: number, cydDeviceId = "default"): Promise<{ published: boolean }> {
  const result = await fetchLayout(token);
  if (!result.ok || result.data === null) return { published: false };

  const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${brokerPort}`);
  await client.publishAsync(`3dpb/cyd/${cydDeviceId}/layout`, JSON.stringify(result.data), { retain: true });
  await client.endAsync();
  return { published: true };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/layout-publisher.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/layout-publisher.ts apps/agent/src/main/layout-publisher.test.ts
git commit -m "feat(agent): layout publisher — republish retained ke broker lokal, skip kalau belum diatur"
```

---

### Task 10: Orkestrasi startup (rekonstruksi offline) + IPC bridge + preload (TDD)

**Files:**
- Create: `apps/agent/src/main/startup.ts` — orkestrasi gabung credential+cache+fetch-SaaS jadi `PairedDevice[]`, TERMASUK fallback ke cache pas SaaS unreachable (temuan Important review Fable — sebelumnya cuma didelegasikan vague, sekarang kode konkret)
- Create: `apps/agent/src/main/startup.test.ts`
- Create: `apps/agent/src/main/app-state.ts` — state startup (engine aktif, port broker) di module TERPISAH dari `index.ts`, biar `ipc.ts` (Task 10 & 13) bisa baca tanpa circular import (`index.ts` juga yang import `registerIpcHandlers` dari `ipc.ts`, jadi `ipc.ts` gak boleh balik import dari `index.ts`)
- Create: `apps/agent/src/main/ipc.ts`
- Create: `apps/agent/src/main/ipc.test.ts`
- Modify: `apps/agent/src/preload/index.ts` (isi `contextBridge`, ganti placeholder Task 1)

**Interfaces:**
- Consumes: semua modul Task 2-9 (`credential-store`, `device-cache`, `saas-client`, `discovery/*`, `broker`, `engine-manager`, `layout-publisher`).
- Produces: `async function buildPairedDevices(): Promise<PairedDevice[]>` (dipakai `index.ts` saat startup app), `function registerIpcHandlers(): void` (daftar `ipcMain.handle` buat tiap aksi), tipe `AgentApi` yang di-expose preload (dipakai renderer Task 11-13): `activate(token): Promise<...>`, `scanLan(): Promise<{bambu: DiscoveredBambuPrinter[]; moonraker: DiscoveredMoonrakerPrinter[]}>`, `pairDevice(shortCode, secret): Promise<void>`, `sync(): Promise<...>`, `getSnapshot(): Promise<PrintersPayload>`.

- [ ] **Step 1: Tulis failing test buat `startup.ts` (orkestrasi rekonstruksi offline)**

```typescript
// apps/agent/src/main/startup.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./credential-store", () => ({ loadCredentials: vi.fn() }));
vi.mock("./device-cache", () => ({ loadDeviceCache: vi.fn(), saveDeviceCache: vi.fn() }));
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn() }));

import { loadCredentials } from "./credential-store";
import { loadDeviceCache, saveDeviceCache } from "./device-cache";
import { fetchDevices } from "./saas-client";
import { buildPairedDevices } from "./startup";

beforeEach(() => vi.clearAllMocks());

describe("buildPairedDevices", () => {
  it("SaaS reachable: pakai data fresh, DAN update device-cache biar tersedia offline nanti", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({
      ok: true,
      data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A (fresh)", printerType: "bambu", createdAt: "x", updatedAt: "y" }],
    });

    const paired = await buildPairedDevices();

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (fresh)", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).toHaveBeenCalledWith([{ shortCode: "abc1234567", label: "Printer A (fresh)", printerType: "bambu" }]);
  });

  it("SaaS unreachable (network_error): fallback pakai device-cache lokal, TETAP jalan (bukan kosong)", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu" }]);

    const paired = await buildPairedDevices();

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).not.toHaveBeenCalled();
  });

  it("belum ada token tersimpan (belum pernah aktivasi): balikin [] tanpa panggil fetchDevices", async () => {
    (loadCredentials as any).mockResolvedValue({ agentToken: null, devices: {} });
    const paired = await buildPairedDevices();
    expect(paired).toEqual([]);
    expect(fetchDevices).not.toHaveBeenCalled();
  });

  it("device ada di cache/fresh-fetch tapi kredensialnya (IP/serial/accessCode) belum di-pairing -> di-skip, bukan crash", async () => {
    (loadCredentials as any).mockResolvedValue({ agentToken: "slz_ok", devices: {} }); // belum ada device di-pairing
    (fetchDevices as any).mockResolvedValue({ ok: true, data: [{ id: "d1", shortCode: "belum-dipasangkan", userId: "u1", label: "B", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    const paired = await buildPairedDevices();
    expect(paired).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/startup.test.ts`
Expected: FAIL — `./startup` belum ada.

- [ ] **Step 3: Implementasi `startup.ts`**

```typescript
// apps/agent/src/main/startup.ts
import { loadCredentials } from "./credential-store";
import { loadDeviceCache, saveDeviceCache, type CachedDevice } from "./device-cache";
import { fetchDevices } from "./saas-client";
import type { PairedDevice } from "./engine-manager";

/**
 * Gabung kredensial lokal (Task 2) + metadata device (fresh dari SaaS kalau reachable,
 * fallback ke cache lokal Task 3 kalau unreachable) jadi PairedDevice[] siap dipakai
 * startEngine (Task 8). Device yang belum pernah di-pairing (gak ada di credential blob)
 * di-skip, bukan bikin seluruh startup gagal.
 */
export async function buildPairedDevices(): Promise<PairedDevice[]> {
  const blob = await loadCredentials();
  if (!blob.agentToken) return [];

  let metadata: CachedDevice[];
  const result = await fetchDevices(blob.agentToken);
  if (result.ok) {
    metadata = result.data.map((d) => ({ shortCode: d.shortCode, label: d.label, printerType: d.printerType }));
    await saveDeviceCache(metadata); // refresh cache tiap kali fresh-fetch sukses
  } else {
    metadata = await loadDeviceCache(); // SaaS unreachable (401/403/network_error semua) -> andalkan cache lokal
  }

  const paired: PairedDevice[] = [];
  for (const m of metadata) {
    const secret = blob.devices[m.shortCode];
    if (!secret) continue; // device terdaftar tapi belum di-pairing (belum diisi IP/serial/accessCode)
    paired.push({ shortCode: m.shortCode, label: m.label, printerType: m.printerType, secret });
  }
  return paired;
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/startup.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/startup.ts apps/agent/src/main/startup.test.ts
git commit -m "feat(agent): orkestrasi startup — rekonstruksi PairedDevice dari cache pas SaaS unreachable"
```

- [ ] **Step 6: Tulis failing test (fokus registrasi handler, bukan re-test logic modul lain)**

```typescript
// apps/agent/src/main/ipc.test.ts
import { describe, it, expect, vi } from "vitest";

const handlers: Record<string, (...args: any[]) => any> = {};
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, fn: any) => { handlers[channel] = fn; }) },
}));
vi.mock("./credential-store", () => ({ loadCredentials: vi.fn().mockResolvedValue({ agentToken: null, devices: {} }), saveCredentials: vi.fn() }));
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }), fetchLayout: vi.fn() }));
vi.mock("./discovery/bambu-ssdp", () => ({ scanBambu: vi.fn().mockResolvedValue({ ok: true, printers: [] }) }));
vi.mock("./discovery/moonraker-mdns", () => ({ scanMoonraker: vi.fn().mockResolvedValue([]) }));

import { registerIpcHandlers } from "./ipc";
import { ipcMain } from "electron";
import { fetchDevices } from "./saas-client";

describe("registerIpcHandlers", () => {
  it("daftarkan handler 'agent:activate'", () => {
    registerIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:activate", expect.any(Function));
  });

  it("'agent:activate' panggil fetchDevices dengan token yang dioper", async () => {
    registerIpcHandlers();
    await handlers["agent:activate"]({}, "slz_test_token");
    expect(fetchDevices).toHaveBeenCalledWith("slz_test_token");
  });

  it("daftarkan handler 'agent:scan-lan'", () => {
    registerIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:scan-lan", expect.any(Function));
  });
});
```

- [ ] **Step 7: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: FAIL.

- [ ] **Step 8: Implementasi `ipc.ts`**

```typescript
// apps/agent/src/main/ipc.ts
import { ipcMain } from "electron";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, fetchLayout } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";

export function registerIpcHandlers(): void {
  ipcMain.handle("agent:activate", async (_event, token: string) => {
    const result = await fetchDevices(token);
    if (result.ok) {
      const blob = await loadCredentials();
      await saveCredentials({ ...blob, agentToken: token });
    }
    return result;
  });

  ipcMain.handle("agent:scan-lan", async () => {
    const [bambuResult, moonraker] = await Promise.all([scanBambu(), scanMoonraker()]);
    return { bambu: bambuResult, moonraker };
  });

  ipcMain.handle("agent:pair-device", async (_event, shortCode: string, secret: DeviceSecret) => {
    const blob = await loadCredentials();
    blob.devices[shortCode] = secret;
    await saveCredentials(blob);
  });

  ipcMain.handle("agent:sync", async () => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false, kind: "invalid_token" as const };
    return fetchDevices(blob.agentToken);
  });
}
```

- [ ] **Step 9: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: PASS (3/3).

- [ ] **Step 10: Isi `preload/index.ts` — expose lewat `contextBridge` (aman, bukan Node API mentah)**

```typescript
// apps/agent/src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import type { DeviceSecret } from "../main/credential-store";

const agentApi = {
  activate: (token: string) => ipcRenderer.invoke("agent:activate", token),
  scanLan: () => ipcRenderer.invoke("agent:scan-lan"),
  pairDevice: (shortCode: string, secret: DeviceSecret) => ipcRenderer.invoke("agent:pair-device", shortCode, secret),
  sync: () => ipcRenderer.invoke("agent:sync"),
};

export type AgentApi = typeof agentApi;

contextBridge.exposeInMainWorld("agentApi", agentApi);
```

- [ ] **Step 11: Buat `app-state.ts` — state startup dibaca-tulis lintas modul tanpa circular import**

```typescript
// apps/agent/src/main/app-state.ts
import os from "node:os";
import type { Engine } from "@3pb/printer-monitor-core";

let engine: Engine | null = null;
let brokerPort: number | null = null;

export function setEngine(e: Engine | null): void { engine = e; }
export function getEngine(): Engine | null { return engine; }
export function setBrokerPort(port: number | null): void { brokerPort = port; }
export function getBrokerPort(): number | null { return brokerPort; }

export function getLocalIp(): string {
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "127.0.0.1";
}
```

- [ ] **Step 12: Rangkai urutan startup lengkap di `index.ts`**

Baca `apps/agent/src/main/index.ts` (state dari Task 7 — sudah ada `app.requestSingleInstanceLock()` + blok `else`). Tambahkan di dalam `app.whenReady().then(...)`, urutan PERSIS begini (broker duluan karena engine butuh broker buat konek; `registerIpcHandlers` sebelum `createWindow()` karena renderer bisa langsung panggil IPC begitu window muncul):

```typescript
// tambahan di apps/agent/src/main/index.ts, di dalam app.whenReady().then(async () => { ... })
import { startBroker } from "./broker";
import { buildPairedDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import { loadCredentials } from "./credential-store";
import { registerIpcHandlers } from "./ipc";
import { setEngine, setBrokerPort } from "./app-state";

async function bootstrap(): Promise<void> {
  const brokerResult = await startBroker();
  if (!brokerResult.ok) {
    console.error("[agent] broker gagal start (port 1883 dipakai proses lain) — monitoring lokal tak akan jalan");
    registerIpcHandlers(); // tetap daftarkan IPC biar renderer bisa tampilkan pesan error, bukan macet total
    return;
  }
  setBrokerPort(brokerResult.port);

  const paired = await buildPairedDevices();
  if (paired.length > 0) {
    setEngine(await startEngine(paired, brokerResult.port));
  }

  const blob = await loadCredentials();
  if (blob.agentToken) {
    await publishLayout(blob.agentToken, brokerResult.port);
  }

  registerIpcHandlers();
}

// panggil `await bootstrap()` di dalam app.whenReady().then(...) SEBELUM createWindow().
```

- [ ] **Step 13: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/main/ipc.test.ts apps/agent/src/preload/index.ts apps/agent/src/main/index.ts apps/agent/src/main/app-state.ts
git commit -m "feat(agent): IPC bridge + preload contextBridge + app-state, rangkai bootstrap startup lengkap"
```

---

### Task 11: Renderer — layar Aktivasi (token)

**Files:**
- Create: `apps/agent/src/renderer/screens/ActivationScreen.tsx`
- Create: `apps/agent/src/renderer/screens/ActivationScreen.test.tsx`
- Modify: `apps/agent/src/renderer/App.tsx` (render `ActivationScreen` kalau belum aktivasi)

**Interfaces:**
- Consumes: `window.agentApi.activate(token)` (Task 10).
- Produces: komponen yang, setelah aktivasi sukses, panggil `onActivated()` prop (dipakai `App.tsx` buat pindah ke `PairingScreen`, Task 12).

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/renderer/screens/ActivationScreen.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActivationScreen } from "./ActivationScreen";

beforeEach(() => {
  (globalThis as any).window.agentApi = { activate: vi.fn() };
});

describe("ActivationScreen", () => {
  it("submit token sukses -> panggil onActivated", async () => {
    (window as any).agentApi.activate.mockResolvedValue({ ok: true, data: [] });
    const onActivated = vi.fn();
    render(<ActivationScreen onActivated={onActivated} />);
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: "slz_abc" } });
    fireEvent.click(screen.getByRole("button", { name: /aktifkan/i }));
    await waitFor(() => expect(onActivated).toHaveBeenCalled());
  });

  it("401 -> pesan 'token gak valid', BUKAN pesan generik", async () => {
    (window as any).agentApi.activate.mockResolvedValue({ ok: false, kind: "invalid_token" });
    render(<ActivationScreen onActivated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: "slz_bad" } });
    fireEvent.click(screen.getByRole("button", { name: /aktifkan/i }));
    await waitFor(() => expect(screen.getByText(/token.*tidak valid/i)).toBeTruthy());
  });

  it("403 -> pesan langganan berakhir, BEDA dari pesan 401", async () => {
    (window as any).agentApi.activate.mockResolvedValue({ ok: false, kind: "entitlement_expired" });
    render(<ActivationScreen onActivated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: "slz_x" } });
    fireEvent.click(screen.getByRole("button", { name: /aktifkan/i }));
    await waitFor(() => expect(screen.getByText(/akses pro.*berakhir/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/renderer/screens/ActivationScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```tsx
// apps/agent/src/renderer/screens/ActivationScreen.tsx
import { useState } from "react";

declare global {
  interface Window {
    agentApi: {
      activate: (token: string) => Promise<{ ok: boolean; kind?: string }>;
    };
  }
}

export function ActivationScreen({ onActivated }: { onActivated: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const result = await window.agentApi.activate(token);
    if (!result.ok) {
      if (result.kind === "invalid_token") setError("Token tidak valid — generate ulang dari Settings web.");
      else if (result.kind === "entitlement_expired") setError("Akses Pro kamu sudah berakhir — perbarui buat lanjut monitoring.");
      else setError("Gagal konek ke server, coba lagi.");
      return;
    }
    onActivated();
  }

  return (
    <div style={{ padding: 24 }}>
      <label htmlFor="token-input">Token Agent</label>
      <input id="token-input" value={token} onChange={(e) => setToken(e.target.value)} />
      <button onClick={handleSubmit}>Aktifkan</button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/renderer/screens/ActivationScreen.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Rangkai di `App.tsx`**

```tsx
// apps/agent/src/renderer/App.tsx
import { useState } from "react";
import { ActivationScreen } from "./screens/ActivationScreen";

export default function App() {
  const [activated, setActivated] = useState(false);
  if (!activated) return <ActivationScreen onActivated={() => setActivated(true)} />;
  return <div style={{ padding: 24 }}>Aktivasi sukses — lanjut pairing (Task 12)</div>;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/renderer/screens/ActivationScreen.tsx apps/agent/src/renderer/screens/ActivationScreen.test.tsx apps/agent/src/renderer/App.tsx
git commit -m "feat(agent): layar Aktivasi — bedakan pesan 401 vs 403"
```

---

### Task 12: Renderer — layar Pairing (2-kolom + manual fallback)

**Files:**
- Create: `apps/agent/src/renderer/screens/PairingScreen.tsx`
- Create: `apps/agent/src/renderer/screens/PairingScreen.test.tsx`
- Modify: `apps/agent/src/preload/index.ts` (`scanLan`, `pairDevice` sudah ada dari Task 10 — pastikan tipe cocok)
- Modify: `apps/agent/src/renderer/App.tsx`

**Interfaces:**
- Consumes: `window.agentApi.scanLan()`, `window.agentApi.pairDevice(shortCode, secret)` (Task 10), `SaasDevice[]` (dioper sebagai prop dari `App.tsx`, hasil `agent:activate`/`agent:sync`).
- Produces: komponen yang panggil `onAllPaired()` prop pas semua device (atau device yang user pilih) sudah dipasangkan.

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/renderer/screens/PairingScreen.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PairingScreen } from "./PairingScreen";

const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" }];

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    scanLan: vi.fn().mockResolvedValue({ bambu: [{ ip: "192.168.1.5", serial: "SER1", model: "C12", name: "Neptune" }], moonraker: [] }),
    pairDevice: vi.fn().mockResolvedValue(undefined),
  };
});

describe("PairingScreen", () => {
  it("tampilkan device terdaftar (kiri) dan hasil scan (kanan) setelah klik Scan", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.getByText(/192\.168\.1\.5/)).toBeTruthy();
  });

  it("pasangkan device+hasil-scan -> minta access code -> panggil pairDevice dengan IP+serial dari scan", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    fireEvent.click(screen.getByRole("button", { name: /pasangkan/i }));
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("abc1234567", { ip: "192.168.1.5", serial: "SER1", accessCode: "1234" }));
  });

  it("opsi 'Isi manual' -> tak butuh hasil scan, langsung minta IP+serial+access code", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));
    await waitFor(() => expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("abc1234567", { ip: "10.0.0.9", serial: "MANUAL1", accessCode: "9999" }));
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/renderer/screens/PairingScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

```tsx
// apps/agent/src/renderer/screens/PairingScreen.tsx
import { useState } from "react";
import type { SaasDevice } from "../../main/saas-client";
import type { DiscoveredBambuPrinter } from "../../main/discovery/bambu-ssdp";
import type { DiscoveredMoonrakerPrinter } from "../../main/discovery/moonraker-mdns";

declare global {
  interface Window {
    agentApi: Window["agentApi"] & {
      scanLan: () => Promise<{ bambu: DiscoveredBambuPrinter[]; moonraker: DiscoveredMoonrakerPrinter[] }>;
      pairDevice: (shortCode: string, secret: { ip: string; serial: string; accessCode: string }) => Promise<void>;
    };
  }
}

export function PairingScreen({ devices, onAllPaired }: { devices: SaasDevice[]; onAllPaired: () => void }) {
  const [bambu, setBambu] = useState<DiscoveredBambuPrinter[]>([]);
  const [pairing, setPairing] = useState<{ shortCode: string; ip: string; serial: string } | null>(null);
  const [accessCode, setAccessCode] = useState("");

  async function handleScan() {
    const result = await window.agentApi.scanLan();
    setBambu(result.bambu);
  }

  function startPairing(shortCode: string, ip: string, serial: string) {
    setPairing({ shortCode, ip, serial });
    setAccessCode("");
  }

  function startManualPairing(shortCode: string) {
    setPairing({ shortCode, ip: "", serial: "" });
    setAccessCode("");
  }

  async function savePairing() {
    if (!pairing) return;
    await window.agentApi.pairDevice(pairing.shortCode, { ip: pairing.ip, serial: pairing.serial, accessCode });
    setPairing(null);
    onAllPaired();
  }

  return (
    <div style={{ display: "flex", gap: 24, padding: 24 }}>
      <div>
        <h3>Device Terdaftar</h3>
        {devices.map((d) => (
          <div key={d.shortCode}>
            <span>{d.label}</span>
            <button onClick={() => startManualPairing(d.shortCode)}>Isi manual</button>
          </div>
        ))}
        <button onClick={handleScan}>Scan LAN</button>
      </div>
      <div>
        <h3>Hasil Scan</h3>
        {bambu.map((p) => (
          <div key={p.serial}>
            <span>{p.ip} ({p.name})</span>
            {devices.map((d) => (
              <button key={d.shortCode} onClick={() => startPairing(d.shortCode, p.ip, p.serial)}>
                Pasangkan ke {d.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      {pairing && (
        <div>
          {!pairing.ip && (
            <>
              <label htmlFor="manual-ip">IP</label>
              <input id="manual-ip" onChange={(e) => setPairing({ ...pairing, ip: e.target.value })} />
              <label htmlFor="manual-serial">Serial</label>
              <input id="manual-serial" onChange={(e) => setPairing({ ...pairing, serial: e.target.value })} />
            </>
          )}
          <label htmlFor="access-code">Access Code</label>
          <input id="access-code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
          <button onClick={savePairing}>Simpan Pairing</button>
        </div>
      )}
    </div>
  );
}
```

Catatan implementer: tombol `Pasangkan` di test dicari lewat `getByRole("button", { name: /pasangkan/i })` — pastikan teks tombol match regex itu (di atas: `"Pasangkan ke {d.label}"`, cocok).

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/renderer/screens/PairingScreen.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/renderer/screens/PairingScreen.tsx apps/agent/src/renderer/screens/PairingScreen.test.tsx
git commit -m "feat(agent): layar Pairing — 2-kolom device/hasil-scan + fallback isi manual"
```

---

### Task 13: Renderer — Dashboard live status + IP broker + Sync

**Files:**
- Create: `apps/agent/src/renderer/screens/DashboardScreen.tsx`
- Create: `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`
- Modify: `apps/agent/src/main/ipc.ts` (tambah handler `agent:get-snapshot`, `agent:get-broker-info`)
- Modify: `apps/agent/src/preload/index.ts` (expose 2 handler baru)
- Modify: `apps/agent/src/renderer/App.tsx` (rangkai 3 layar jadi alur penuh)

**Interfaces:**
- Consumes: `window.agentApi.getSnapshot()` → `PrintersPayload` (dari `Engine.snapshot()`, Task 8), `window.agentApi.getBrokerInfo()` → `{ip: string; port: number}`, `window.agentApi.sync()` (Task 10).

- [ ] **Step 1: Tulis failing test**

```typescript
// apps/agent/src/renderer/screens/DashboardScreen.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DashboardScreen } from "./DashboardScreen";

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    getSnapshot: vi.fn().mockResolvedValue({ payload: [{ id: "abc1234567", name: "Printer A", type: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", last_seen: "2026-07-29T10:00:00Z" }] }),
    getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883 }),
    sync: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  };
});

describe("DashboardScreen", () => {
  it("tampilkan status printer dari snapshot", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.getByText(/45/)).toBeTruthy();
  });

  it("tampilkan IP broker saat ini (buat diketik ke captive portal CYD)", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/192\.168\.1\.100/)).toBeTruthy());
  });

  it("tombol Sync panggil window.agentApi.sync()", async () => {
    render(<DashboardScreen />);
    await waitFor(() => screen.getByRole("button", { name: /sync/i }));
    fireEvent.click(screen.getByRole("button", { name: /sync/i }));
    await waitFor(() => expect((window as any).agentApi.sync).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Tambah 2 handler IPC baru (extend Task 10)**

Tambahkan import `import { getEngine, getBrokerPort, getLocalIp } from "./app-state";` di awal `apps/agent/src/main/ipc.ts` (modul `app-state.ts` sudah dibuat Task 10 Step 11), lalu tambahkan 2 handler ini ke dalam `registerIpcHandlers` (sejajar handler yang sudah ada):

```typescript
  ipcMain.handle("agent:get-snapshot", async () => {
    return getEngine()?.snapshot() ?? { payload: [] };
  });

  ipcMain.handle("agent:get-broker-info", async () => {
    return { ip: getLocalIp(), port: getBrokerPort() };
  });
```

Baca nilai TERKINI tiap kali dipanggil (bukan snapshot beku saat `registerIpcHandlers` dijalankan) — persis karena `getEngine()`/`getBrokerPort()` baca dari `app-state.ts`, bukan closure variabel lokal.

Tambahkan ke `apps/agent/src/preload/index.ts`:
```typescript
  getSnapshot: () => ipcRenderer.invoke("agent:get-snapshot"),
  getBrokerInfo: () => ipcRenderer.invoke("agent:get-broker-info"),
```

- [ ] **Step 4: Implementasi `DashboardScreen.tsx`**

```tsx
// apps/agent/src/renderer/screens/DashboardScreen.tsx
import { useEffect, useState } from "react";
import type { PrintersPayload } from "@3pb/printer-monitor-core";

export function DashboardScreen() {
  const [snapshot, setSnapshot] = useState<PrintersPayload>({ payload: [] });
  const [brokerInfo, setBrokerInfo] = useState<{ ip: string; port: number } | null>(null);

  useEffect(() => {
    const load = () => {
      window.agentApi.getSnapshot().then(setSnapshot);
    };
    load();
    const timer = setInterval(load, 5000);
    window.agentApi.getBrokerInfo().then(setBrokerInfo);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <div>
        <button onClick={() => window.agentApi.sync()}>Sync</button>
      </div>
      {brokerInfo && (
        <p>Alamat broker (ketik ini di setup WiFi CYD): {brokerInfo.ip}:{brokerInfo.port}</p>
      )}
      <ul>
        {snapshot.payload.map((p) => (
          <li key={p.id}>
            {p.name} — {p.state} — {p.progress}%
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 6: Rangkai 3 layar penuh di `App.tsx`**

```tsx
// apps/agent/src/renderer/App.tsx
import { useState } from "react";
import { ActivationScreen } from "./screens/ActivationScreen";
import { PairingScreen } from "./screens/PairingScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import type { SaasDevice } from "../main/saas-client";

type Step = "activation" | "pairing" | "dashboard";

export default function App() {
  const [step, setStep] = useState<Step>("activation");
  const [devices, setDevices] = useState<SaasDevice[]>([]);

  if (step === "activation") {
    return (
      <ActivationScreen
        onActivated={() => setStep("pairing")}
      />
    );
  }
  if (step === "pairing") {
    return <PairingScreen devices={devices} onAllPaired={() => setStep("dashboard")} />;
  }
  return <DashboardScreen />;
}
```

(Catatan: `devices` di atas masih `[]` — implementer perlu oper hasil `agent:activate`/`agent:sync` [`SaasDevice[]`] dari `ActivationScreen` naik ke `App.tsx` state, mis. ubah `onActivated` jadi `onActivated: (devices: SaasDevice[]) => void`. Sesuaikan `ActivationScreen.tsx` Task 11 secukupnya — perubahan kecil, gak perlu task terpisah.)

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/renderer/screens/DashboardScreen.tsx apps/agent/src/renderer/screens/DashboardScreen.test.tsx apps/agent/src/main/ipc.ts apps/agent/src/preload/index.ts apps/agent/src/renderer/App.tsx apps/agent/src/renderer/screens/ActivationScreen.tsx
git commit -m "feat(agent): Dashboard live status + IP broker (buat setup CYD) + tombol Sync, rangkai 3 layar"
```

---

### Task 14: Packaging Windows + verifikasi akhir

**Files:**
- Create: `apps/agent/electron-builder.yml`
- Modify: `apps/agent/package.json` (script `build:win`)

**Interfaces:**
- Tidak ada — task ini murni packaging + verifikasi, tanpa API baru buat task lain (task terakhir di plan).

- [ ] **Step 1: Konfigurasi `electron-builder`**

```yaml
# apps/agent/electron-builder.yml
appId: com.slizebiz.agent
productName: Slizebiz Agent
directories:
  output: release
win:
  target: nsis
  artifactName: ${productName}-Setup-${version}.${ext}
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
files:
  - out/**/*
  - package.json
```

- [ ] **Step 2: Tambah script build di `package.json`**

```json
"scripts": {
  "build:win": "electron-vite build && electron-builder --win"
}
```

Tambah `electron-builder` ke `devDependencies` kalau belum ada dari scaffold Task 1.

- [ ] **Step 3: Full test suite**

Run: `cd apps/agent && npx vitest run`
Expected: semua test dari Task 2-13 PASS (total test count = jumlahkan semua task di atas).

- [ ] **Step 4: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: exit 0 keduanya (kalau scaffold `electron-vite` bikin 2 tsconfig terpisah main/renderer — sesuaikan perintah kalau strukturnya beda).

- [ ] **Step 5: Build production (tanpa full packaging installer dulu, cukup bundle)**

Run: `cd apps/agent && npx electron-vite build`
Expected: exit 0, `out/` terisi main+preload+renderer ter-bundle bersih.

- [ ] **Step 6: Full monorepo regression — pastikan `apps/agent` gak merusak apa pun di luar dirinya**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis && pnpm turbo test`
Expected: semua package (termasuk `apps/agent` yang baru) PASS, TANPA regresi di `apps/saas`/`apps/dashboard`/`packages/*`.

- [ ] **Step 7: Checklist verifikasi manual (WAJIB dilakukan user, Claude tak punya akses LAN printer/CYD fisik)**

Tulis checklist ini ke laporan, JANGAN diklaim "selesai" tanpa user konfirmasi:
- [ ] Install hasil `build:win`, buka app, tempel token asli dari SaaS.
- [ ] Klik Scan LAN, konfirmasi printer Bambu asli kedeteksi (bandingkan sama hasil POC awal).
- [ ] Pasangkan device, isi access code asli printer, konfirmasi status muncul di Dashboard.
- [ ] Cek IP broker yang ditampilkan cocok dipakai buat setup captive portal CYD, konfirmasi CYD beneran nerima layout+status.
- [ ] Coba buka app 2x — instance kedua harus fokus ke window pertama (single-instance lock).
- [ ] Coba tutup token yang salah — pastikan pesan beda buat 401 vs 403 (kalau ada akun test buat masing-masing kasus).
- [ ] **Windows Firewall** (dari spec, belum ada penanganan kode — murni pengecekan manual): pas broker pertama kali listen, harusnya muncul prompt izin Firewall. Konfirmasi kalau user klik "Allow", CYD beneran bisa connect; kalau user klik "Block" (skenario nyata yang bisa kejadian), dokumentasikan apa gejalanya ke user (CYD gak pernah connect walau IP+broker kelihatan benar) — ini jadi bahan panduan support/FAQ, bukan sesuatu yang bisa dideteksi otomatis dari kode Agent.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/electron-builder.yml apps/agent/package.json
git commit -m "feat(agent): packaging Windows (electron-builder) + verifikasi akhir sub-proyek 2"
```
