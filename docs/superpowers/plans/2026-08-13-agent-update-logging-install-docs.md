# Agent Update Check, Local Logging + Send-to-Support, Install Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close go-public-readiness audit items #7 (`apps/agent` has no update mechanism), #8 (no persistent logging/crash reporting), and #12 (no end-user install documentation).

**Architecture:** A `GET /api/agent/version` SaaS endpoint exposes the currently-hosted installer's commit hash (via the existing `headBinary()` R2 helper); the Agent's main process compares it against its own build hash once at startup and every 6h, storing a boolean in `app-state.ts` that the renderer polls and shows as a dismissible link in `DashboardScreen`. `electron-log` replaces `console.error` for persistence across restarts; a new `POST /api/agent/logs` endpoint lets a user-triggered button upload the current log file to R2 for support. A static disclaimer paragraph is added next to the existing download button covering firewall/Local-Network prompts.

**Tech Stack:** Next.js 16 (apps/saas, App Router route handlers), Electron + electron-vite (apps/agent, main/preload/renderer), Vitest for both, `electron-log` (new dependency), Cloudflare R2 via `aws4fetch`.

## Global Constraints

- Every `/api/agent/*` SaaS route calls `requireAgentToken(req)` as its first statement (existing pattern, `lib/agent-auth.ts`).
- No secrets (PIN, raw agent token) ever passed to `log.error(...)` — only specific non-secret fields, matching how `console.error` calls already log today.
- No `electron-updater`/auto-download/auto-install — check + notify only, user clicks through to the Settings download page.
- No third-party crash-reporting service (Sentry etc.) — file-based local logging only, uploaded solely on explicit user action.
- Log upload capped at 5 MB, enforced on both the Agent (client-side, before reading the file) and the SaaS route (before AND after buffering the body).
- The update banner and its polling live in `DashboardScreen.tsx`, **not** `AgentShell.tsx` — `AgentShell` wraps pre-token screens too, and a token is guaranteed only once `DashboardScreen` is reached.
- The commit-hash comparison happens exactly once, in `apps/agent/src/main/saas-client.ts`'s `fetchLatestVersion` — no other file compares hashes.
- Any test that imports `apps/agent/src/main/ipc.ts` needs an `electron-log/main` mock (see Task 9) — `electron-log/main` touches Electron's `app` module at import time, which the existing bare `vi.mock("electron", () => ({ ipcMain: {...} }))` doesn't provide.
- Log retrieval/retention is a documentation note only (Task 8) — no listing endpoint, no admin UI, no auto-expiry in this iteration.

---

## Task 1: SaaS endpoint `GET /api/agent/version`

**Files:**
- Create: `apps/saas/app/api/agent/version/route.ts`
- Test: `apps/saas/app/api/agent/version/route.test.ts`

**Interfaces:**
- Consumes: `requireAgentToken(req: Request): Promise<{userId: string} | NextResponse>` from `@/lib/agent-auth` (existing); `headBinary(key: string): Promise<{version?: string; commitHash?: string} | null>` from `@/lib/storage/r2` (existing).
- Produces: `GET` handler returning `{commitHash: string | null}` on 200, consumed by Task 2's `fetchLatestVersion`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/saas/app/api/agent/version/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ headBinary: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { headBinary } from "@/lib/storage/r2";
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent/version", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await GET(new Request("http://x?platform=win"));
    expect(res.status).toBe(401);
    expect(headBinary).not.toHaveBeenCalled();
  });

  it("platform param hilang -> 400 invalid_platform", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_platform" });
  });

  it("platform param tak dikenal -> 400 invalid_platform", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await GET(new Request("http://x?platform=linux"));
    expect(res.status).toBe(400);
  });

  it("platform=win -> 200 dengan commitHash dari headBinary key agent/latest/win.exe", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockResolvedValue({ version: "0.0.1", commitHash: "a3f9c21" });
    const res = await GET(new Request("http://x?platform=win"));
    expect(headBinary).toHaveBeenCalledWith("agent/latest/win.exe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ commitHash: "a3f9c21" });
  });

  it("platform=mac -> pakai key agent/latest/mac.dmg", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockResolvedValue({ version: "0.0.1", commitHash: "a3f9c21" });
    await GET(new Request("http://x?platform=mac"));
    expect(headBinary).toHaveBeenCalledWith("agent/latest/mac.dmg");
  });

  it("headBinary balikin null (belum pernah upload) -> 200 commitHash:null", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockResolvedValue(null);
    const res = await GET(new Request("http://x?platform=win"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ commitHash: null });
  });

  it("headBinary throw (R2 down) -> 503 storage_unavailable", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockRejectedValue(new Error("r2 down"));
    const res = await GET(new Request("http://x?platform=win"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "storage_unavailable" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/saas && npx vitest run app/api/agent/version/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/saas/app/api/agent/version/route.ts
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { headBinary } from "@/lib/storage/r2";

const KEYS: Record<string, string> = {
  win: "agent/latest/win.exe",
  mac: "agent/latest/mac.dmg",
};

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;

  const platform = new URL(req.url).searchParams.get("platform");
  const key = platform ? KEYS[platform] : undefined;
  if (!key) return NextResponse.json({ error: "invalid_platform" }, { status: 400 });

  let meta;
  try {
    meta = await headBinary(key);
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ commitHash: meta?.commitHash ?? null });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/saas && npx vitest run app/api/agent/version/route.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/saas/app/api/agent/version/route.ts apps/saas/app/api/agent/version/route.test.ts
git commit -m "feat(saas): add GET /api/agent/version endpoint"
```

---

## Task 2: `fetchLatestVersion` in `saas-client.ts`

**Files:**
- Modify: `apps/agent/src/main/saas-client.ts`
- Test: `apps/agent/src/main/saas-client.test.ts`

**Interfaces:**
- Consumes: `saasBaseUrl()`, `AGENT_BUILD_ID`, `AGENT_COMMIT_HASH` (existing module-level locals in this same file); `GET /api/agent/version?platform=win|mac` from Task 1.
- Produces: `fetchLatestVersion(token: string, platform: "win" | "mac"): Promise<FetchVersionResult>` where `FetchVersionResult = {ok: true; data: {updateAvailable: boolean}} | {ok: false; kind: "invalid_token" | "entitlement_expired" | "network_error"}` — consumed by Task 4's `startUpdateChecks()`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent/src/main/saas-client.test.ts` (the file already imports `fetchDevices, fetchLayout, patchDeviceModel, saasBaseUrl` from `"./saas-client"` at the top — add `fetchLatestVersion` to that import list):

```typescript
// change the top import line to:
import { fetchDevices, fetchLayout, patchDeviceModel, fetchLatestVersion, saasBaseUrl } from "./saas-client";

// add this describe block at the end of the file:
describe("fetchLatestVersion", () => {
  it("commitHash beda dari AGENT_COMMIT_HASH build ini ('nogit' di test) -> updateAvailable:true", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: "a3f9c21" }) });
    const result = await fetchLatestVersion("slz_valid", "win");
    expect(result).toEqual({ ok: true, data: { updateAvailable: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/version?platform=win",
      expect.objectContaining({ headers: { Authorization: "Bearer slz_valid", "X-Agent-Version": "0.0.0+nogit" }, signal: expect.any(AbortSignal) })
    );
  });

  it("commitHash SAMA dengan AGENT_COMMIT_HASH build ini -> updateAvailable:false", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: "nogit" }) });
    const result = await fetchLatestVersion("slz_valid", "win");
    expect(result).toEqual({ ok: true, data: { updateAvailable: false } });
  });

  it("commitHash:null (belum pernah admin upload) -> updateAvailable:false, JANGAN pernah 'update available' palsu", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: null }) });
    const result = await fetchLatestVersion("slz_valid", "mac");
    expect(result).toEqual({ ok: true, data: { updateAvailable: false } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/version?platform=mac",
      expect.anything()
    );
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchLatestVersion("slz_bad", "win")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await fetchLatestVersion("slz_valid", "win")).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchLatestVersion("slz_valid", "win")).toEqual({ ok: false, kind: "network_error" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/main/saas-client.test.ts`
Expected: FAIL — `fetchLatestVersion` is not exported from `./saas-client`.

- [ ] **Step 3: Write the implementation**

Add to `apps/agent/src/main/saas-client.ts`, after the existing `patchDeviceModel` function:

```typescript
export type FetchVersionResult =
  | { ok: true; data: { updateAvailable: boolean } }
  | { ok: false; kind: "invalid_token" | "entitlement_expired" | "network_error" };

export async function fetchLatestVersion(token: string, platform: "win" | "mac"): Promise<FetchVersionResult> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/version?platform=${platform}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Agent-Version": AGENT_BUILD_ID },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    const { commitHash } = (await res.json()) as { commitHash: string | null };
    return { ok: true, data: { updateAvailable: commitHash !== null && commitHash !== AGENT_COMMIT_HASH } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/main/saas-client.test.ts`
Expected: PASS (all tests, including the 6 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/saas-client.ts apps/agent/src/main/saas-client.test.ts
git commit -m "feat(agent): add fetchLatestVersion, commit-hash comparison in main"
```

---

## Task 3: `setUpdateAvailable`/`getUpdateAvailable` in `app-state.ts`

**Files:**
- Modify: `apps/agent/src/main/app-state.ts`
- Test: `apps/agent/src/main/app-state.test.ts`

**Interfaces:**
- Produces: `setUpdateAvailable(available: boolean): void` / `getUpdateAvailable(): boolean` (default `false`) — consumed by Task 4 (`index.ts`) and Task 5 (`ipc.ts`'s `agent:get-update-status` handler).

- [ ] **Step 1: Write the failing test**

Append to `apps/agent/src/main/app-state.test.ts`:

```typescript
describe("getUpdateAvailable/setUpdateAvailable", () => {
  it("default false, tersimpan+terbaca kembali persis seperti setBrokerPin/getBrokerPin", async () => {
    const { setUpdateAvailable, getUpdateAvailable } = await import("./app-state");
    expect(getUpdateAvailable()).toBe(false);
    setUpdateAvailable(true);
    expect(getUpdateAvailable()).toBe(true);
    setUpdateAvailable(false);
    expect(getUpdateAvailable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/main/app-state.test.ts`
Expected: FAIL — `setUpdateAvailable` is not exported from `./app-state`.

- [ ] **Step 3: Write the implementation**

Add to `apps/agent/src/main/app-state.ts`, alongside the existing `brokerPin` state (after line 21's `getReporters` export):

```typescript
let updateAvailable = false;

export function setUpdateAvailable(available: boolean): void { updateAvailable = available; }
export function getUpdateAvailable(): boolean { return updateAvailable; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/main/app-state.test.ts`
Expected: PASS (all tests, including the 1 new one)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/app-state.ts apps/agent/src/main/app-state.test.ts
git commit -m "feat(agent): add setUpdateAvailable/getUpdateAvailable state"
```

---

## Task 4: `index.ts` — `startUpdateChecks()` wiring

**Files:**
- Modify: `apps/agent/src/main/index.ts`

**Interfaces:**
- Consumes: `fetchLatestVersion(token, platform)` (Task 2), `setUpdateAvailable(available)` (Task 3), existing `loadCredentials()` from `./credential-store`.
- Produces: nothing new consumed by later tasks — this wires the check into app startup only.

No dedicated test file exists for `index.ts` (matches the existing pattern — `bootstrap()`'s own wiring, e.g. `ensureBrokerPin()`, has no unit test either, since it's pure IO/lifecycle glue). Verify manually per Step 3 below.

- [ ] **Step 1: Add the two new imports**

`index.ts`'s current import block (lines 1-12) is:

```typescript
import { app, BrowserWindow } from 'electron'
import { createWindow, disableApplicationMenu } from './window'
import { createTray } from './tray'
import { attachHideOnClose } from './window-lifecycle'
import { startBroker } from './broker'
import { buildPairedDevices } from './startup'
import { startEngine } from './engine-manager'
import { publishLayout } from './layout-publisher'
import { loadCredentials, ensureBrokerPin } from './credential-store'
import { registerIpcHandlers } from './ipc'
import { saasBaseUrl } from './saas-client'
import { setEngine, setBrokerPort, setBrokerPin, setReporters, listLocalIpCandidates } from './app-state'
```

Change only the last two lines (`saasBaseUrl` and `app-state` imports) to add the two new names:

```typescript
import { saasBaseUrl, fetchLatestVersion } from './saas-client'
import { setEngine, setBrokerPort, setBrokerPin, setReporters, setUpdateAvailable, listLocalIpCandidates } from './app-state'
```

Every other import line stays exactly as-is.

- [ ] **Step 2: Add `startUpdateChecks()`**

Add this new function right after the closing `}` of `bootstrap()` (currently ending at line 83, before the `if (!gotLock) {` block):

```typescript
/**
 * Independen dari bootstrap() SENGAJA -- bootstrap() return early (index.ts, broker gagal
 * start) dan cek update tetap harus jalan justru di kasus itu (pengguna paling butuh tahu
 * ada fix). Dipanggil dari app.on('ready') SETELAH bootstrap(), bukan di dalamnya.
 */
async function startUpdateChecks(): Promise<void> {
  const blob = await loadCredentials()
  if (!blob.agentToken) return
  const platform = process.platform === 'darwin' ? 'mac' : 'win'
  const check = async () => {
    const result = await fetchLatestVersion(blob.agentToken!, platform)
    if (result.ok) setUpdateAvailable(result.data.updateAvailable)
  }
  await check()
  const timer = setInterval(check, 6 * 60 * 60 * 1000)
  timer.unref?.()
}
```

- [ ] **Step 3: Call it from `app.on('ready')`**

Find the `app.on('ready', async () => { try { await bootstrap() ...` block (currently lines 102-123). Add the call right after `await bootstrap()`:

```typescript
  app.on('ready', async () => {
    try {
      await bootstrap()
      void startUpdateChecks().catch((err) => console.error('[agent] update check gagal', err))
    } catch (err) {
```

(Only the line `void startUpdateChecks().catch(...)` is new — everything else in this block stays exactly as-is.)

- [ ] **Step 4: Verify manually**

Run: `cd apps/agent && npx tsc --noEmit` (or `pnpm --filter @3pb/agent build` if you want a full build check)
Expected: no type errors — confirms the new imports and function compile cleanly against `saas-client.ts` (Task 2) and `app-state.ts` (Task 3).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/index.ts
git commit -m "feat(agent): wire startUpdateChecks() into app startup"
```

---

## Task 5: `ipc.ts` + preload — `agent:get-update-status`, `agent:open-download-page`

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Test: `apps/agent/src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `getUpdateAvailable()` (Task 3); `saasBaseUrl()` from `./saas-client` (existing, not yet imported in `ipc.ts`).
- Produces: IPC channels `agent:get-update-status` → `{updateAvailable: boolean}`, `agent:open-download-page` → `void`; preload methods `getUpdateStatus()`, `openDownloadPage()` — both consumed by Task 6 (`DashboardScreen.tsx`).

- [ ] **Step 1: Write the failing tests**

In `apps/agent/src/main/ipc.test.ts`, update the top-of-file mocks and imports:

```typescript
// change line 6's app-state mock import list to include the new functions:
// (find the existing line:)
//   import { getEngine, setEngine, setBrokerPort, setBrokerPin, getReporters, setReporters } from "./app-state";
// change it to:
import { getEngine, setEngine, setBrokerPort, setBrokerPin, getReporters, setReporters, setUpdateAvailable } from "./app-state";

// add a mock for saas-client's saasBaseUrl (the existing saas-client mock at line 8 needs
// saasBaseUrl added):
// change:
//   vi.mock("./saas-client", () => ({ fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }), fetchLayout: vi.fn(), patchDeviceModel: vi.fn() }));
// to:
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }), fetchLayout: vi.fn(), patchDeviceModel: vi.fn(), saasBaseUrl: vi.fn().mockReturnValue("http://192.168.88.113:3300") }));

// electron mock needs `shell` added (existing mock at lines 4-6):
// change:
//   vi.mock("electron", () => ({
//     ipcMain: { handle: vi.fn((channel: string, fn: any) => { handlers[channel] = fn; }) },
//   }));
// to:
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, fn: any) => { handlers[channel] = fn; }) },
  shell: { openExternal: vi.fn() },
}));

// add this import alongside the existing "electron" import:
import { ipcMain, shell } from "electron";
import { saasBaseUrl } from "./saas-client";

// add this describe block anywhere at the top level (e.g. right after the existing
// "agent:printer-command" describe block at the end of the file):
describe("agent:get-update-status", () => {
  it("balikin updateAvailable TERKINI dari app-state, bukan snapshot beku", async () => {
    registerIpcHandlers();
    setUpdateAvailable(false);
    expect(await handlers["agent:get-update-status"]()).toEqual({ updateAvailable: false });
    setUpdateAvailable(true);
    expect(await handlers["agent:get-update-status"]()).toEqual({ updateAvailable: true });
    setUpdateAvailable(false);
  });
});

describe("agent:open-download-page", () => {
  it("panggil shell.openExternal dengan ${saasBaseUrl}/settings", async () => {
    registerIpcHandlers();
    await handlers["agent:open-download-page"]();
    expect(shell.openExternal).toHaveBeenCalledWith("http://192.168.88.113:3300/settings");
  });

  it("saasBaseUrl kosong (build salah konfigurasi) -> no-op, TIDAK panggil shell.openExternal dengan URL rusak", async () => {
    registerIpcHandlers();
    (saasBaseUrl as any).mockReturnValueOnce("");
    (shell.openExternal as any).mockClear();
    await handlers["agent:open-download-page"]();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: FAIL — `handlers["agent:get-update-status"]` / `handlers["agent:open-download-page"]` are undefined.

- [ ] **Step 3: Write the implementation**

In `apps/agent/src/main/ipc.ts`:

Change line 1 (`import { ipcMain } from "electron";`) to:
```typescript
import { ipcMain, shell } from "electron";
```

Change line 3 (`import { fetchDevices, patchDeviceModel, type SaasDevice } from "./saas-client";`) to:
```typescript
import { fetchDevices, patchDeviceModel, saasBaseUrl, type SaasDevice } from "./saas-client";
```

Change line 6 (`import { getEngine, setEngine, getBrokerPort, getBrokerPin, getLocalIp, getReporters, setReporters } from "./app-state";`) to:
```typescript
import { getEngine, setEngine, getBrokerPort, getBrokerPin, getLocalIp, getReporters, setReporters, getUpdateAvailable } from "./app-state";
```

Add these two new handlers inside `registerIpcHandlers()`, right after the existing `agent:printer-command` handler (currently the last one, ending at line 161):

```typescript
  ipcMain.handle("agent:get-update-status", async () => {
    return { updateAvailable: getUpdateAvailable() };
  });

  ipcMain.handle("agent:open-download-page", async () => {
    const base = saasBaseUrl();
    if (!base) return; // dev-config error sudah dicatat keras di startup (index.ts) -- no-op diam di sini, bukan jalur error kedua
    await shell.openExternal(`${base}/settings`);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: PASS (all existing tests plus the 3 new ones)

- [ ] **Step 5: Add the preload methods**

In `apps/agent/src/preload/index.ts`, add two new entries to the `agentApi` object (after the existing `sendPrinterCommand` entry, before the closing `};`):

```typescript
  getUpdateStatus: (): Promise<{ updateAvailable: boolean }> =>
    ipcRenderer.invoke("agent:get-update-status"),
  openDownloadPage: (): Promise<void> =>
    ipcRenderer.invoke("agent:open-download-page"),
```

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/main/ipc.test.ts apps/agent/src/preload/index.ts
git commit -m "feat(agent): add agent:get-update-status and agent:open-download-page IPC"
```

---

## Task 6: `DashboardScreen.tsx` — update banner

**Files:**
- Modify: `apps/agent/src/renderer/screens/DashboardScreen.tsx`
- Test: `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: `window.agentApi.getUpdateStatus(): Promise<{updateAvailable: boolean}>`, `window.agentApi.openDownloadPage(): Promise<void>` (Task 5).

- [ ] **Step 1: Write the failing tests**

In `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`, add `getUpdateStatus` and `openDownloadPage` to the `beforeEach` mock (currently lines 6-12):

```typescript
beforeEach(() => {
  (globalThis as any).window.agentApi = {
    getSnapshot: vi.fn().mockResolvedValue({ payload: [{ id: "abc1234567", name: "Printer A", type: "bambu", connector: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", last_seen: "2026-07-29T10:00:00Z", nozzle_temp: 219, bed_temp: 60 }] }),
    getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883, pin: "0042" }),
    sync: vi.fn().mockResolvedValue({ ok: true, deviceCount: 1 }),
    getUpdateStatus: vi.fn().mockResolvedValue({ updateAvailable: false }),
    openDownloadPage: vi.fn().mockResolvedValue(undefined),
  };
});
```

Add this new describe block at the end of the file, before the final closing (after the existing `"DashboardScreen polling"` describe block):

```typescript
describe("DashboardScreen update banner", () => {
  it("getUpdateStatus updateAvailable:true -> banner tampil", async () => {
    (window as any).agentApi.getUpdateStatus.mockResolvedValue({ updateAvailable: true });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/versi baru tersedia/i)).toBeTruthy());
  });

  it("getUpdateStatus updateAvailable:false -> banner TIDAK tampil", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^sync$/i })).toBeTruthy());
    expect(screen.queryByText(/versi baru tersedia/i)).toBeNull();
  });

  it("klik banner panggil openDownloadPage()", async () => {
    (window as any).agentApi.getUpdateStatus.mockResolvedValue({ updateAvailable: true });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/versi baru tersedia/i)).toBeTruthy());
    fireEvent.click(screen.getByText(/versi baru tersedia/i));
    expect((window as any).agentApi.openDownloadPage).toHaveBeenCalled();
  });
});

describe("DashboardScreen update banner polling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("getUpdateStatus() di-poll tiap 60 detik, bukan cuma sekali saat mount", async () => {
    await act(async () => {
      render(<DashboardScreen />);
    });
    expect((window as any).agentApi.getUpdateStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect((window as any).agentApi.getUpdateStatus).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: FAIL — "Versi baru tersedia" text never rendered.

- [ ] **Step 3: Write the implementation**

In `apps/agent/src/renderer/screens/DashboardScreen.tsx`:

Add a new state variable after the existing `syncStatus` state (line 82):

```typescript
  const [updateAvailable, setUpdateAvailable] = useState(false);
```

Add a new `useEffect` after the existing polling `useEffect` (currently lines 91-107):

```typescript
  useEffect(() => {
    const load = () => {
      window.agentApi
        .getUpdateStatus()
        .then((s) => setUpdateAvailable(s.updateAvailable))
        .catch((err) => console.error("[dashboard] gagal cek update", err));
    };
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
```

Add the banner button inside the header row `<div>` (currently lines 126-134), right after the existing "Pengaturan" `<GlassButton>`:

```tsx
      <div className="flex items-center justify-between mb-4">
        <h1 className="g-t1 text-lg font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          {updateAvailable && (
            <button
              type="button"
              onClick={() => window.agentApi.openDownloadPage()}
              className="text-[11px] px-3 py-1.5 rounded-md g-btn-ghost"
            >
              Versi baru tersedia — klik untuk unduh
            </button>
          )}
          <GlassButton onClick={onManageDevices} className="text-xs opacity-70">
            Pengaturan
          </GlassButton>
        </div>
      </div>
```

(This wraps the existing "Pengaturan" button and the new banner button in a shared flex container — the existing comment above the "Pengaturan" button stays unchanged, just now sits above the wrapping `<div>`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: PASS (all existing tests plus the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/renderer/screens/DashboardScreen.tsx apps/agent/src/renderer/screens/DashboardScreen.test.tsx
git commit -m "feat(agent): show update-available banner in DashboardScreen"
```

---

## Task 7: `electron-log` dependency + main-process logging wiring

**Files:**
- Modify: `apps/agent/package.json`
- Modify: `apps/agent/src/main/index.ts`
- Modify: `apps/agent/src/main/broker.ts`
- Modify: `apps/agent/src/main/engine-manager.ts`

**Interfaces:**
- Produces: `electron-log/main`'s initialized singleton, importable from any main-process file as `import log from "electron-log/main"` — consumed by Task 9's `ipc.ts` changes.

No dedicated test for this task — these are `console.error` → `log.error` call-site swaps in files with no existing coverage of their error-log call sites specifically (the surrounding logic they sit in is already tested; only the logging *function* changes). Verify manually per Step 5.

- [ ] **Step 1: Add the dependency**

In `apps/agent/package.json`, add to `dependencies` (alphabetically, after `"aedes"`):

```json
    "aedes": "^0.51.3",
    "electron-log": "^5",
```

Run: `cd apps/agent && pnpm install`

- [ ] **Step 2: Initialize logging in `bootstrap()`**

In `apps/agent/src/main/index.ts`, add as the very first lines inside `bootstrap()`'s `try` block (currently line 35, right after `try {`):

```typescript
async function bootstrap(): Promise<void> {
  try {
    log.initialize();
    log.errorHandler.startCatching(); // exception tak tertangkap + rejection tanpa handler -> otomatis masuk file log
    // Diagnostik startup: base URL SaaS di-inject saat BUILD (define di
```

Add the import at the top of the file, alongside the other imports (after line 12's `app-state` import):

```typescript
import log from 'electron-log/main'
```

- [ ] **Step 3: Convert `console.error` calls in `index.ts` to `log.error`**

Four call sites in `index.ts` (lines 44, 60, 79, 110 as of this plan) — change each `console.error` to `log.error`, keeping the exact same arguments:

```typescript
// line 44 area (unchanged message, just the function name):
      log.error(
        '[agent] SAAS_BASE_URL KOSONG — build ini tak tahu harus menghubungi server Slizebiz yang mana. ' +
          'Aktivasi/sync/layout PASTI gagal ("network_error"). Rebuild dengan SAAS_BASE_URL=<url> di environment build.',
      )
```

```typescript
// line 60 area:
      log.error(
        `[agent] broker MQTT lokal gagal start (${brokerResult.reason}) — monitoring lokal tak akan jalan`,
      )
```

```typescript
// line 79:
    log.error('[agent] bootstrap gagal di tengah jalan (broker/engine/layout) — IPC tetap didaftarkan biar renderer bisa recover', err)
```

```typescript
// line 110:
      log.error('[agent] bootstrap gagal total', err)
```

- [ ] **Step 4: Convert `console.error` calls in `broker.ts` and `engine-manager.ts`**

In `apps/agent/src/main/broker.ts`, add `import log from 'electron-log/main'` to the top imports, then change the two call sites (lines 162, 166):

```typescript
      log.error("[broker] gagal listen (bukan EADDRINUSE)", err);
```
```typescript
      log.error(`[broker] listen tak merespons dalam ${LISTEN_TIMEOUT_MS}ms — dianggap gagal`);
```

In `apps/agent/src/main/engine-manager.ts`, add `import log from 'electron-log/main'` to the top imports, then change the one call site (line 57):

```typescript
      log.error(`[engine-manager] gagal bikin connector utk ${p.shortCode} (${p.printerType}) -- device ini TIDAK termonitor, device lain tetap jalan`, err);
```

**No secrets, ever:** none of these four call sites currently log a full credentials/blob object — they log specific reasons, shortCodes, and error objects only. Keep it that way; never expand any of these to log `blob`/`DeviceSecret` wholesale.

- [ ] **Step 5: Verify manually**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: no type errors.

Run: `cd apps/agent && npx vitest run`
Expected: all existing tests still pass — `broker.test.ts` and `engine-manager.test.ts` assert on behavior, not on `console.error` being called, so swapping the logging function shouldn't break them. If any test does assert `console.error` was called for one of the 3 swapped sites in those two files, update that assertion to check `log.error` was called instead (via a `vi.mock("electron-log/main", ...)` — see Task 9's test-mock note, which applies here too if `broker.test.ts`/`engine-manager.test.ts` need it).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/package.json apps/agent/pnpm-lock.yaml apps/agent/src/main/index.ts apps/agent/src/main/broker.ts apps/agent/src/main/engine-manager.ts
git commit -m "feat(agent): initialize electron-log, persist error logs across restarts"
```

---

## Task 8: SaaS endpoint `POST /api/agent/logs` + `putLog` in `r2.ts`

**Files:**
- Create: `apps/saas/app/api/agent/logs/route.ts`
- Test: `apps/saas/app/api/agent/logs/route.test.ts`
- Modify: `apps/saas/lib/storage/r2.ts`
- Test: `apps/saas/lib/storage/r2.test.ts`

**Interfaces:**
- Consumes: `requireAgentToken(req)` (existing); `clientAndUrl(key)` (existing internal helper in `r2.ts`).
- Produces: `putLog(key: string, body: ArrayBuffer): Promise<void>` in `r2.ts`; `POST` handler at `/api/agent/logs` — both consumed by Task 9's `ipc.ts` `agent:send-logs` handler.

- [ ] **Step 1: Write the failing `putLog` test**

Append to `apps/saas/lib/storage/r2.test.ts` (add `putLog` to the existing import on line 8):

```typescript
// change line 8 from:
//   import { r2Config, putProof, getProof, putBinary, getBinary, headBinary, R2NotConfigured } from "./r2";
// to:
import { r2Config, putProof, getProof, putBinary, getBinary, headBinary, putLog, R2NotConfigured } from "./r2";

// add this describe block at the end of the file:
describe("putLog", () => {
  it("PUT ke key agent-logs/... dg Content-Type text/plain", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await putLog("agent-logs/u1/1700000000000.log", new ArrayBuffer(10));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://acc123.r2.cloudflarestorage.com/slizebiz-proofs/agent-logs/u1/1700000000000.log");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("text/plain");
  });

  it("throw bila respons tak ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(putLog("k", new ArrayBuffer(0))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/saas && npx vitest run lib/storage/r2.test.ts`
Expected: FAIL — `putLog` is not exported from `./r2`.

- [ ] **Step 3: Implement `putLog`**

Add to `apps/saas/lib/storage/r2.ts`, after the existing `headBinary` function (end of file):

```typescript
export async function putLog(key: string, body: ArrayBuffer): Promise<void> {
  const { client, url } = clientAndUrl(key);
  const res = await client.fetch(url, { method: "PUT", body, headers: { "Content-Type": "text/plain" } });
  if (!res.ok) throw new Error(`r2_put_failed_${res.status}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/saas && npx vitest run lib/storage/r2.test.ts`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 5: Write the failing route test**

```typescript
// apps/saas/app/api/agent/logs/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ putLog: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { putLog } from "@/lib/storage/r2";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

function makeRequest(body: string, contentLength?: number): Request {
  const bytes = new TextEncoder().encode(body);
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  return new Request("http://x", { method: "POST", body: bytes, headers });
}

describe("POST /api/agent/logs", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await POST(makeRequest("log content", 11));
    expect(res.status).toBe(401);
    expect(putLog).not.toHaveBeenCalled();
  });

  it("Content-Length header menyatakan > 5MB -> 413, DITOLAK SEBELUM baca body (putLog tak dipanggil)", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await POST(makeRequest("x", 6 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "log_too_large" });
    expect(putLog).not.toHaveBeenCalled();
  });

  it("body sungguhan > 5MB tapi Content-Length hilang/understated -> tetap 413 (post-buffer check)", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const bigBody = "x".repeat(6 * 1024 * 1024);
    const res = await POST(makeRequest(bigBody)); // no content-length header at all
    expect(res.status).toBe(413);
    expect(putLog).not.toHaveBeenCalled();
  });

  it("200 + putLog dipanggil dengan key agent-logs/<userId>/<timestamp>.log", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (putLog as any).mockResolvedValue(undefined);
    const res = await POST(makeRequest("log content", 11));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(putLog).toHaveBeenCalledTimes(1);
    const [key] = (putLog as any).mock.calls[0];
    expect(key).toMatch(/^agent-logs\/u1\/\d+\.log$/);
  });

  it("putLog throw (R2 down) -> 503 storage_unavailable", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (putLog as any).mockRejectedValue(new Error("r2 down"));
    const res = await POST(makeRequest("log content", 11));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/saas && npx vitest run app/api/agent/logs/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 7: Implement the route**

```typescript
// apps/saas/app/api/agent/logs/route.ts
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { putLog } from "@/lib/storage/r2";

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;

  // Cek ukuran yang DIKLAIM SEBELUM buffer -- client kita (ipc.ts) selalu kirim body Buffer,
  // jadi Node's fetch set Content-Length otomatis; tolak request kebesaran tanpa pernah
  // menarik body-nya ke memori server. Content-Length hilang/bohong tetap ketangkep di
  // pengecekan byteLength di bawah (defense in depth), cuma setelah buffer.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LOG_BYTES) {
    return NextResponse.json({ error: "log_too_large" }, { status: 413 });
  }

  const body = await req.arrayBuffer();
  // Tolak yang kebesaran, jangan diam-diam dipotong -- log yang terpotong lebih buruk
  // daripada tak ada log sama sekali, karena bagian yang hilang justru biasanya bagian akhir
  // (baris-baris terakhir sebelum crash).
  if (body.byteLength > MAX_LOG_BYTES) {
    return NextResponse.json({ error: "log_too_large" }, { status: 413 });
  }

  const key = `agent-logs/${result.userId}/${Date.now()}.log`;
  try {
    await putLog(key, body);
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/saas && npx vitest run app/api/agent/logs/route.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Add the retrieval/retention note**

This is documentation only — no file to create. Note for whoever needs to pull an uploaded log later: use a short local script with `aws4fetch`'s `AwsClient` (same shape as the existing one-off binary-upload script pattern), `GET`-ing `agent-logs/<userId>/<timestamp>.log` directly from R2 with the credentials in `apps/saas/.env.deploy`. No retention/lifecycle rule for now — at current usage volume, manual cleanup is fine.

- [ ] **Step 10: Commit**

```bash
git add apps/saas/lib/storage/r2.ts apps/saas/lib/storage/r2.test.ts apps/saas/app/api/agent/logs/route.ts apps/saas/app/api/agent/logs/route.test.ts
git commit -m "feat(saas): add POST /api/agent/logs endpoint + putLog"
```

---

## Task 9: `ipc.ts` — `agent:send-logs` handler

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Test: `apps/agent/src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `POST /api/agent/logs` (Task 8); `electron-log/main`'s initialized singleton (Task 7); `saasBaseUrl()` (already imported into `ipc.ts` by Task 5).
- Produces: IPC channel `agent:send-logs` → `{ok: boolean; reason?: string}`, preload method `sendLogs()` — consumed by Task 10 (`DashboardScreen.tsx`).

- [ ] **Step 1: Add the `electron-log/main` test mock**

In `apps/agent/src/main/ipc.test.ts`, add this mock alongside the other `vi.mock(...)` calls at the top of the file (this is required for the file to import successfully once `ipc.ts` imports `electron-log/main` in Step 3 below — without it, the whole test file fails at import time, not just the new tests):

```typescript
vi.mock("electron-log/main", () => ({
  default: {
    transports: { file: { getFile: () => ({ path: "/tmp/mock-agent.log" }) } },
    error: vi.fn(),
  },
}));
```

- [ ] **Step 2: Write the failing tests**

Add `import { readFile, stat } from "node:fs/promises";` mocking to the test file — mock the `node:fs/promises` module used by the implementation:

```typescript
vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
  readFile: vi.fn(),
}));

import { stat, readFile } from "node:fs/promises";
```

Add this describe block at the end of the file:

```typescript
describe("agent:send-logs", () => {
  it("belum ada token -> {ok:false, reason:'no_token'}, TANPA baca file", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "no_token" });
    expect(stat).not.toHaveBeenCalled();
  });

  it("stat() gagal (file log tak ada) -> {ok:false, reason:'read_failed'}", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockRejectedValueOnce(new Error("ENOENT"));

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "read_failed" });
  });

  it("file log > 5MB -> {ok:false, reason:'too_large'}, TANPA baca isi file / fetch", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 6 * 1024 * 1024 });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("readFile() gagal setelah stat() sukses -> {ok:false, reason:'read_failed'}", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockRejectedValueOnce(new Error("gagal baca"));

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "read_failed" });
  });

  it("sukses: POST ke /api/agent/logs dengan isi file, balikin {ok:true}", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockResolvedValueOnce(Buffer.from("log isi"));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/logs",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer slz_ok", "Content-Type": "text/plain" },
      })
    );
    globalThis.fetch = originalFetch;
  });

  it("upload gagal (fetch balikin !ok atau reject) -> {ok:false, reason:'upload_failed'}", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockResolvedValueOnce(Buffer.from("log isi"));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "upload_failed" });
    globalThis.fetch = originalFetch;
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: FAIL — `handlers["agent:send-logs"]` is undefined.

- [ ] **Step 4: Write the implementation**

In `apps/agent/src/main/ipc.ts`, add two new imports at the top:

```typescript
import { readFile, stat } from "node:fs/promises";
import log from "electron-log/main";
```

Add the handler inside `registerIpcHandlers()`, right after the `agent:open-download-page` handler added in Task 5:

```typescript
  const MAX_LOG_BYTES = 5 * 1024 * 1024;

  ipcMain.handle("agent:send-logs", async (): Promise<{ ok: boolean; reason?: string }> => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false, reason: "no_token" };

    const logPath = log.transports.file.getFile().path;
    let stats;
    try {
      stats = await stat(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }
    // Cek di sisi client SEBELUM baca file, biar log kebesaran gagal cepat dengan pesan
    // spesifik -- server independen menegakkan cap yang sama (Task 8), ini murni jalur UX
    // yang lebih cepat/jelas.
    if (stats.size > MAX_LOG_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    let content: Buffer;
    try {
      content = await readFile(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }

    const res = await fetch(`${saasBaseUrl()}/api/agent/logs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${blob.agentToken}`, "Content-Type": "text/plain" },
      body: content,
    }).catch(() => null);
    return res?.ok === true ? { ok: true } : { ok: false, reason: "upload_failed" };
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts`
Expected: PASS (all existing tests plus the 6 new ones)

- [ ] **Step 6: Add the preload method**

In `apps/agent/src/preload/index.ts`, add after `openDownloadPage` (added in Task 5):

```typescript
  sendLogs: (): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke("agent:send-logs"),
```

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/main/ipc.test.ts apps/agent/src/preload/index.ts
git commit -m "feat(agent): add agent:send-logs IPC handler"
```

---

## Task 10: `DashboardScreen.tsx` — "Kirim log" button + disclosure

**Files:**
- Modify: `apps/agent/src/renderer/screens/DashboardScreen.tsx`
- Test: `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: `window.agentApi.sendLogs(): Promise<{ok: boolean; reason?: string}>` (Task 9).

- [ ] **Step 1: Write the failing tests**

Add `sendLogs` to the `beforeEach` mock in `apps/agent/src/renderer/screens/DashboardScreen.test.tsx` (same block updated in Task 6):

```typescript
    sendLogs: vi.fn().mockResolvedValue({ ok: true }),
```

Add this describe block at the end of the file:

```typescript
describe("DashboardScreen kirim log", () => {
  it("klik 'Kirim log' panggil sendLogs(), tampilkan pesan sukses", async () => {
    render(<DashboardScreen />);
    await waitFor(() => screen.getByRole("button", { name: /kirim log/i }));
    fireEvent.click(screen.getByRole("button", { name: /kirim log/i }));
    await waitFor(() => expect((window as any).agentApi.sendLogs).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/log terkirim/i)).toBeTruthy());
  });

  it("sendLogs gagal reason:too_large -> pesan spesifik 'Log terlalu besar'", async () => {
    (window as any).agentApi.sendLogs.mockResolvedValue({ ok: false, reason: "too_large" });
    render(<DashboardScreen />);
    await waitFor(() => screen.getByRole("button", { name: /kirim log/i }));
    fireEvent.click(screen.getByRole("button", { name: /kirim log/i }));
    await waitFor(() => expect(screen.getByText(/log terlalu besar/i)).toBeTruthy());
  });

  it("sendLogs gagal reason lain (mis. upload_failed) -> pesan generik 'Gagal mengirim log'", async () => {
    (window as any).agentApi.sendLogs.mockResolvedValue({ ok: false, reason: "upload_failed" });
    render(<DashboardScreen />);
    await waitFor(() => screen.getByRole("button", { name: /kirim log/i }));
    fireEvent.click(screen.getByRole("button", { name: /kirim log/i }));
    await waitFor(() => expect(screen.getByText(/gagal mengirim log/i)).toBeTruthy());
  });

  it("caption disclosure tentang isi log selalu tampil di dekat tombol", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/tidak berisi pin atau kredensial/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: FAIL — no "Kirim log" button exists yet.

- [ ] **Step 3: Write the implementation**

In `apps/agent/src/renderer/screens/DashboardScreen.tsx`, add a new state type and state variable after the existing `updateAvailable` state (added in Task 6):

```typescript
  type LogSendStatus = { kind: "idle" } | { kind: "sending" } | { kind: "success" } | { kind: "error"; message: string };
  const [logSendStatus, setLogSendStatus] = useState<LogSendStatus>({ kind: "idle" });
```

Add a handler function alongside the existing `handleSync` function:

```typescript
  function logSendErrorMessage(reason: string | undefined): string {
    if (reason === "too_large") return "Log terlalu besar";
    return "Gagal mengirim log";
  }

  async function handleSendLogs() {
    setLogSendStatus({ kind: "sending" });
    const result = await window.agentApi.sendLogs();
    if (result.ok) {
      setLogSendStatus({ kind: "success" });
    } else {
      setLogSendStatus({ kind: "error", message: logSendErrorMessage(result.reason) });
    }
  }
```

Add the button + disclosure, placed near the existing "Pengaturan" button in the header row (inside the same wrapping `<div className="flex items-center gap-2">` added in Task 6, after the update-banner button and before "Pengaturan"):

```tsx
          {updateAvailable && (
            <button
              type="button"
              onClick={() => window.agentApi.openDownloadPage()}
              className="text-[11px] px-3 py-1.5 rounded-md g-btn-ghost"
            >
              Versi baru tersedia — klik untuk unduh
            </button>
          )}
          <button
            type="button"
            onClick={handleSendLogs}
            disabled={logSendStatus.kind === "sending"}
            className="text-[11px] px-3 py-1.5 rounded-md g-btn-ghost"
          >
            {logSendStatus.kind === "sending" ? "Mengirim..." : "Kirim log ke tim support"}
          </button>
          <GlassButton onClick={onManageDevices} className="text-xs opacity-70">
            Pengaturan
          </GlassButton>
```

Add the status message and disclosure caption below the header row (after the closing `</div>` of the header row, before the existing Sync button row):

```tsx
      {logSendStatus.kind === "success" && (
        <p className="g-success text-xs mb-2">Log terkirim ke tim support.</p>
      )}
      {logSendStatus.kind === "error" && (
        <p role="alert" className="g-error text-xs mb-2">{logSendStatus.message}</p>
      )}
      <p className="g-t4 text-[11px] mb-3">
        Log berisi info koneksi (IP lokal, ID printer) untuk membantu diagnosa — tidak berisi PIN atau kredensial.
      </p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: PASS (all existing tests plus the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/renderer/screens/DashboardScreen.tsx apps/agent/src/renderer/screens/DashboardScreen.test.tsx
git commit -m "feat(agent): add send-logs button + disclosure to DashboardScreen"
```

---

## Task 11: Install docs — `DownloadAgentSection.tsx`

**Files:**
- Modify: `apps/saas/components/settings/DownloadAgentSection.tsx`

No new test — this is a static copy addition next to the existing (already-tested) unsigned-installer disclaimer, matching that block's own always-visible, non-interactive treatment. `DownloadAgentSection.test.tsx` needs no changes.

- [ ] **Step 1: Add the paragraph**

In `apps/saas/components/settings/DownloadAgentSection.tsx`, add a new `<p>` right after the existing unsigned-installer disclaimer paragraph (currently lines 107-112, the one ending `"Open Anyway".`), before the closing `</div>` of the component:

```tsx
      <p className="text-[11px] g-t4 mt-3 pt-3" style={{ borderTop: "1px solid var(--g-row-border)" }}>
        Saat pertama dibuka, Windows mungkin menampilkan prompt "Windows Defender Firewall has
        blocked some features" -- klik "Allow access" (centang jaringan privat/kerja kalau
        ditanya). Ini diperlukan supaya Agent bisa terhubung ke printer &amp; layar Mini Display di
        jaringan lokal yang sama. Di macOS, sistem mungkin minta izin "Local Network" -- pilih
        "Allow" saat muncul.
      </p>
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/saas && npx vitest run components/settings/DownloadAgentSection.test.tsx`
Expected: PASS — existing tests are unaffected (they don't assert on the new paragraph's absence).

- [ ] **Step 3: Commit**

```bash
git add apps/saas/components/settings/DownloadAgentSection.tsx
git commit -m "docs(saas): add Windows Firewall / macOS Local Network install note"
```

---

## Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, both apps**

```bash
cd apps/agent && npx vitest run
cd apps/saas && npx vitest run
```
Expected: all tests pass, 0 failures, in both apps.

- [ ] **Step 2: Typecheck, both apps**

```bash
cd apps/agent && npx tsc --noEmit
cd apps/saas && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Build, both apps**

```bash
cd apps/agent && npx electron-vite build
cd apps/saas && npx next build
```
Expected: both builds succeed.

- [ ] **Step 4: Spot-check the Global Constraints**

- Grep for any `log.error(` call passing a full `blob`/credentials object: `grep -rn "log.error" apps/agent/src/main/*.ts` — confirm every call site logs specific fields/messages, never a whole secrets object.
- Confirm `AgentShell.tsx` was never modified by this plan: `git diff --stat <branch-start>..HEAD -- apps/agent/src/renderer/AgentShell.tsx` should show no output.
- Confirm the commit-hash comparison exists in exactly one place: `grep -rn "AGENT_COMMIT_HASH" apps/agent/src/main/saas-client.ts` should be the only file (outside `build-info.ts`'s unrelated renderer copy) doing a hash comparison.

- [ ] **Step 5: Update the design spec's status (optional but recommended)**

If the spec file (`docs/superpowers/specs/2026-08-12-agent-update-logging-install-docs-design.md`) or project memory tracks go-public-readiness items, mark #7, #8, #12 as done.

- [ ] **Step 6: Commit (if Step 5 produced changes)**

```bash
git add docs/superpowers/specs/2026-08-12-agent-update-logging-install-docs-design.md
git commit -m "docs: mark go-public-readiness #7/#8/#12 as implemented"
```
