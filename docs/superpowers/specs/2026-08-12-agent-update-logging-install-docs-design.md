# Agent Update Check, Local Logging + Send-to-Support, Install Docs

## Goal

Close go-public-readiness audit items #7 (`apps/agent` has no update mechanism), #8 (no persistent logging/crash reporting), and #12 (no end-user install documentation covering firewall/SSDP prompts).

## Scope

In scope: a lightweight in-app "update available" banner (check + notify, no auto-download/auto-install); file-based local logging via `electron-log` plus a user-triggered "send log to support" button; an install-docs section in the SaaS Settings page next to the existing download button.

Out of scope: full auto-update via `electron-updater` (would need a configured `publish` provider and works best with signed builds — code-signing was explicitly deprioritized earlier this session); any third-party crash-reporting service (Sentry etc. — conflicts with this app's established "stays local unless the user explicitly acts" philosophy, see `credential-store.ts`'s design and the go-public audit's own "accepted risk" note on this).

## A — Update check + notify

### New SaaS endpoint: `GET /api/agent/version`

**File:** `apps/saas/app/api/agent/version/route.ts` (new)

Same auth pattern as every other `/api/agent/*` route (`requireAgentToken`, first line of the handler). Query param `platform` (`win` | `mac`) tells the server which R2 key to check — the server has no way to know the caller's OS otherwise.

```typescript
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

Reuses `headBinary()` (already exists, `apps/saas/lib/storage/r2.ts`) — no new R2 code needed. `commitHash: null` means no build has ever been uploaded for that platform (agent should treat this as "nothing to compare, skip the check silently" — never show a false "update available").

### New `saas-client.ts` function

**File:** `apps/agent/src/main/saas-client.ts` (modify)

Add alongside `fetchDevices`/`fetchLayout`, same shape — **the commit-hash comparison happens here, in main, once**, so nothing downstream (IPC, preload, renderer) needs to know about commit hashes at all:

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

`AGENT_BUILD_ID` and `AGENT_COMMIT_HASH` are already module-level constants in this exact file (`apps/agent/src/main/saas-client.ts`, from the existing commit-hash-in-binary feature) — `fetchLatestVersion` reads `AGENT_COMMIT_HASH` directly as a same-file local, no export needed. Platform is `process.platform === "darwin" ? "mac" : "win"` (matches `DownloadAgentSection.tsx`'s own OS-detection convention, just server-side-safe via Node's `process.platform` instead of `navigator.userAgent`).

**Accepted risk:** a rollback to an older build, or a locally-built dev binary, will show `updateAvailable: true` too (any hash mismatch counts, not just "older than"). This is a low-stakes UX nudge (a dismissible link, not a forced update), so treating "different" as "newer" is fine for this iteration — not worth a version-ordering scheme yet.

### Main-process wiring

**File:** `apps/agent/src/main/app-state.ts` (modify) — add `setUpdateAvailable(available: boolean): void` / `getUpdateAvailable(): boolean` (default `false`), same pattern as every other piece of cross-module state in this file.

**File:** `apps/agent/src/main/index.ts` (modify) — add a new function, independent of `bootstrap()`:

```typescript
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

Call it as `void startUpdateChecks().catch((err) => console.error('[agent] update check gagal', err))` inside `app.on('ready', ...)`'s `try` block, right after `await bootstrap()` (currently `index.ts:104`) — **not** inside `bootstrap()` itself. `bootstrap()` returns early at `index.ts:63` when the broker fails to start, so nesting the update check inside it means it silently never runs on exactly the failure case where the user most needs to know a fix might be available. Placing it after `await bootstrap()` in the `ready` handler means it always fires once window/tray creation is reached, regardless of broker/engine/layout outcome. It's fire-and-forget (not awaited by the caller) so it never delays `createWindow()`.

Needs two new imports in `index.ts`: `fetchLatestVersion` from `./saas-client` (add to the existing `saasBaseUrl` import), and `setUpdateAvailable` from `./app-state` (add to the existing import list).

**File:** `apps/agent/src/main/ipc.ts` (modify) — new handler:

```typescript
ipcMain.handle("agent:get-update-status", async () => {
  return { updateAvailable: getUpdateAvailable() };
});
```

**File:** `apps/agent/src/preload/index.ts` (modify) — new `agentApi` methods:

```typescript
  getUpdateStatus: (): Promise<{ updateAvailable: boolean }> =>
    ipcRenderer.invoke("agent:get-update-status"),
  openDownloadPage: (): Promise<void> =>
    ipcRenderer.invoke("agent:open-download-page"),
```

### Renderer: banner in `DashboardScreen`

**Not** `AgentShell` — `AgentShell` wraps every screen (`App.tsx`, `ActivationScreen.tsx`, `PairingScreen.tsx`, `DashboardScreen.tsx`), including the two pre-token screens, and each has its own partial `window.agentApi` mock in its test file with no `getUpdateStatus`. Putting the poll there would need `window.agentApi` mock updates across four unrelated test files just to keep them from throwing, for a check that's meaningless before a token even exists. `DashboardScreen` is the only place a token is guaranteed (you can't reach it without one) and is already where `sendLogs` lives (see Section B) — same screen, same lifecycle, one `window.agentApi` mock to extend instead of four.

**File:** `apps/agent/src/renderer/screens/DashboardScreen.tsx` (modify) — a second `useEffect` alongside the existing 5s status-poll one, polling `getUpdateStatus()` every 60s (much lighter than the 5s device-status poll — this changes at most every 6 hours):

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
```

Place it in the header row, near the existing "Pengaturan" button. `openDownloadPage()`'s IPC handler (in `ipc.ts`, alongside `agent:get-update-status`):

```typescript
ipcMain.handle("agent:open-download-page", async () => {
  const base = saasBaseUrl()
  if (!base) return // dev-config error already logged loudly at startup (index.ts) -- silent no-op here, not a second error path
  await shell.openExternal(`${base}/settings`)
})
```

Needs `shell` added to `ipc.ts`'s existing `import { ipcMain } from "electron"` → `import { ipcMain, shell } from "electron"`. Never let the renderer call `shell.openExternal` directly — matches this codebase's existing `contextIsolation`/narrow-preload-surface convention.

## B — Local logging + send-to-support

### Dependency

**File:** `apps/agent/package.json` (modify) — add `"electron-log": "^5"` to `dependencies`.

### Main-process wiring

**File:** `apps/agent/src/main/index.ts` (modify) — as the very first lines of `bootstrap()`, before the existing diagnostic logging:

```typescript
import log from "electron-log/main";
log.initialize();
log.errorHandler.startCatching(); // uncaught exceptions + unhandled rejections -> log file automatically
```

`electron-log/main`'s default transport already writes to a rotating file at the OS-appropriate location (`app.getPath("userData")/logs/main.log` equivalent — this is the library's own default, no custom path config needed). Replace the existing `console.error(...)` calls in `bootstrap()`'s catch block, `broker.ts`'s error paths, `engine-manager.ts`'s per-device construction failures, and `ipc.ts`'s `agent:sync` error paths with `log.error(...)` — same call sites, same messages, just swapping the function so these already-thoughtfully-placed error logs actually persist across restarts instead of vanishing with the console.

**No secrets in the log, ever.** `credential-store.ts` already never logs the PIN or the raw agent token in plaintext anywhere in its existing code — that discipline must hold after the `console.error` → `log.error` swap. None of the call sites being converted currently log a full credentials/blob object (they log specific reasons/IDs), and this must stay true: never pass a whole `blob`/`DeviceSecret` object to `log.error`, only specific non-secret fields (device id, error reason, etc.) exactly as the existing calls already do.

### New SaaS endpoint: `POST /api/agent/logs`

**File:** `apps/saas/app/api/agent/logs/route.ts` (new)

```typescript
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { putLog } from "@/lib/storage/r2";

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;

  // Check declared size BEFORE buffering -- our own client (ipc.ts) always sends a Buffer
  // body, so Node's fetch sets Content-Length automatically; reject oversized requests
  // without ever pulling the body into server memory. A missing/lying Content-Length still
  // gets caught by the byteLength check below (defense in depth), just after buffering.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LOG_BYTES) {
    return NextResponse.json({ error: "log_too_large" }, { status: 413 });
  }

  const body = await req.arrayBuffer();
  // Reject anything larger rather than silently truncating -- a truncated log is worse
  // than no log, since the missing tail is exactly where a crash's final lines usually are.
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

**File:** `apps/saas/lib/storage/r2.ts` (modify) — add `putLog`, a thin wrapper matching `putProof`'s exact shape (plain text, no custom metadata needed — the R2 key itself already encodes user + timestamp):

```typescript
export async function putLog(key: string, body: ArrayBuffer): Promise<void> {
  const { client, url } = clientAndUrl(key);
  const res = await client.fetch(url, { method: "PUT", body, headers: { "Content-Type": "text/plain" } });
  if (!res.ok) throw new Error(`r2_put_failed_${res.status}`);
}
```

### Retrieval & retention

There is no listing endpoint, admin UI, or auto-expiry in this iteration — matches the "no committed script, one-off local tool" pattern already established for `putBinary` uploads (see `r2.ts`'s own comment on `putBinary`). To actually read an uploaded log: a short local script using `aws4fetch`'s `AwsClient` (same shape as the existing binary-upload one-off script), `GET`-ing `agent-logs/<userId>/<timestamp>.log` directly from R2 with the same `.env.deploy` credentials. No retention/lifecycle rule for now — at current usage volume (single-digit users) manual cleanup is fine; revisit with an R2 lifecycle rule if this bucket prefix grows unmanageable. This is documentation, not a code task — no file changes, just the operational note above for whoever needs to pull a log later.

### Main-process: read + send

**File:** `apps/agent/src/main/ipc.ts` (modify) — this file's current import list (verified directly, not from memory) is:

```typescript
import { ipcMain } from "electron";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, patchDeviceModel, type SaasDevice } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";
import { getEngine, setEngine, getBrokerPort, getBrokerPin, getLocalIp, getReporters, setReporters } from "./app-state";
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";
```

`saasBaseUrl` is NOT currently imported here — add it to line 3's existing `./saas-client` import: `import { fetchDevices, patchDeviceModel, saasBaseUrl, type SaasDevice } from "./saas-client";`. Also add `getUpdateAvailable` to line 6's existing `./app-state` import list. Also add `shell` to line 1's `electron` import (see Section A). Also add two brand-new imports: `import { readFile, stat } from "node:fs/promises";` and `import log from "electron-log/main";` (the same `electron-log/main` instance Section A's `index.ts` change initializes — importing it again here just gets the already-initialized singleton, `electron-log` is designed to be imported per-module this way). Then three new handlers — the two from Section A (`agent:get-update-status`, `agent:open-download-page`), and:

```typescript
const MAX_LOG_BYTES = 5 * 1024 * 1024;

ipcMain.handle("agent:send-logs", async (): Promise<{ ok: boolean; reason?: string }> => {
  const blob = await loadCredentials();
  if (!blob.agentToken) return { ok: false, reason: "no_token" };

  const logPath = log.transports.file.getFile().path; // electron-log's own API for its current log file location
  let stats;
  try {
    stats = await stat(logPath);
  } catch {
    return { ok: false, reason: "read_failed" };
  }
  // Check client-side before even reading the file, so an oversized log fails fast with a
  // distinct message instead of a generic upload failure -- the server enforces the same
  // cap independently (Section B's route), this is purely a faster/clearer UX path.
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

**Test mocking note:** `ipc.test.ts`'s current `vi.mock("electron", ...)` only provides `{ ipcMain: {...} }`. `electron-log/main` touches Electron's `app` module at import/initialize time, so importing it (even just to get the already-initialized singleton) will break under that mock unless a `vi.mock("electron-log/main", () => ({ default: { transports: { file: { getFile: () => ({ path: "/tmp/mock.log" }) } }, error: vi.fn() } }))` is added alongside it. Same applies to any future test that imports `index.ts` directly.

**File:** `apps/agent/src/preload/index.ts` (modify) — `sendLogs: (): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke("agent:send-logs")`.

### Renderer: the button

**File:** `apps/agent/src/renderer/screens/DashboardScreen.tsx` (modify) — small "Kirim log ke tim support" button (ghost-style, low visual weight, this is a support tool not a primary action) near the existing "Pengaturan" button in the header row, next to the update banner from Section A. On click: call `sendLogs()`, show a one-line message for a few seconds (`g-success`/`g-error` text, same convention as the existing sync-status messages) — success text, or a `reason`-specific failure message (`too_large` → "Log terlalu besar", `upload_failed`/`read_failed`/`no_token` → generic "Gagal mengirim log"). No modal/dialog needed — this is a fire-and-forget support action, not something requiring confirmation.

**Disclosure:** since this uploads a file the user hasn't inspected, the button needs a one-line caption under it (small, muted text, no dialog): "Log berisi info koneksi (IP lokal, ID printer) untuk membantu diagnosa — tidak berisi PIN atau kredensial." This keeps the app's existing "stays local unless the user explicitly acts" posture honest: the action is still one click, no confirmation dialog, but the user can see what leaves the machine before clicking, matching `credential-store.ts`'s own care about never surfacing the PIN.

## C — Install docs

**File:** `apps/saas/components/settings/DownloadAgentSection.tsx` (modify) — new paragraph block, placed after the existing unsigned-installer disclaimer (same `border-top` divider pattern), collapsible-free (short enough to just always show — matches the disclaimer's own always-visible treatment):

```tsx
<p className="text-[11px] g-t4 mt-3 pt-3" style={{ borderTop: "1px solid var(--g-row-border)" }}>
  Saat pertama dibuka, Windows mungkin menampilkan prompt "Windows Defender Firewall has
  blocked some features" -- klik "Allow access" (centang jaringan privat/kerja kalau
  ditanya). Ini diperlukan supaya Agent bisa terhubung ke printer &amp; layar Mini Display di
  jaringan lokal yang sama. Di macOS, sistem mungkin minta izin "Local Network" -- pilih
  "Allow" saat muncul.
</p>
```

No separate docs route — matches the earlier decision to keep this next to the download button where an installing user actually looks.

## Testing

- `apps/saas/app/api/agent/version/route.test.ts` (new): 401 without valid token; 400 for missing/invalid `platform` param; 200 with `commitHash` from a mocked `headBinary`; 200 with `commitHash: null` when `headBinary` returns `null`; 503 when `headBinary` throws.
- `apps/agent/src/main/saas-client.test.ts` (modify, existing file — confirm exact name before writing the plan): `fetchLatestVersion` unit tests mirroring `fetchDevices`'s existing 401/403/network-error/success cases, plus the `updateAvailable` boolean derivation itself: `commitHash` equal to `AGENT_COMMIT_HASH` → `false`; different → `true`; `null` → `false`.
- `apps/agent/src/main/app-state.test.ts` (modify): `setUpdateAvailable`/`getUpdateAvailable` round-trip (boolean, default `false`), same shape as the existing `setBrokerPin`/`getBrokerPin` test.
- `apps/agent/src/main/ipc.test.ts` (modify — remember the `electron-log/main` mock note above, or these will fail at import time): `agent:get-update-status` returns current state; `agent:open-download-page` calls `shell.openExternal` with `${saasBaseUrl}/settings` when a base URL is configured, no-ops when it's empty; `agent:send-logs` returns `{ok:false, reason:"no_token"}` when no token, `{ok:false, reason:"too_large"}` when the mocked file stat exceeds 5MB, `{ok:true}`/`{ok:false, reason:"upload_failed"}` based on mocked fetch response.
- `apps/saas/app/api/agent/logs/route.test.ts` (new): 401 without valid token; 413 via an oversized `Content-Length` header (rejected before buffering); 413 via an oversized actual body with a missing/understated `Content-Length` (the post-buffer check); 200 + `putLog` called with the right key shape on success; 503 when `putLog` throws.
- `apps/saas/lib/storage/r2.test.ts` (modify, existing file): `putLog` unit test mirroring `putProof`'s existing test.
- `apps/agent/src/renderer/screens/DashboardScreen.test.tsx` (modify — this file already has a `window.agentApi` mock; extend it with `getUpdateStatus`, `openDownloadPage`, `sendLogs`): update banner renders when `getUpdateStatus()` returns `{updateAvailable: true}`, absent when `false`, clicking it calls `openDownloadPage()`; "Kirim log" button calls `sendLogs()` and shows success text or a `reason`-specific failure message (`too_large` vs. the generic fallback) based on the mocked result.
- `AgentShell.tsx` is untouched by this spec — `AgentShell.test.tsx`'s existing 3 tests need no changes.
- `apps/saas/components/settings/DownloadAgentSection.test.tsx` (already exists, no changes needed) — the new disclaimer paragraph is static copy with no interactive behavior, doesn't need new test coverage.
