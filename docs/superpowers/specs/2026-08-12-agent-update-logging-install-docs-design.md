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

Add alongside `fetchDevices`/`fetchLayout`, same shape:

```typescript
export type FetchVersionResult =
  | { ok: true; data: { commitHash: string | null } }
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
    return { ok: true, data: (await res.json()) as { commitHash: string | null } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}
```

`AGENT_BUILD_ID` and `AGENT_COMMIT_HASH` are already module-level constants in this file (from the existing commit-hash-in-binary feature) — the update check compares `AGENT_COMMIT_HASH` (this build's own hash) against the fetched `commitHash` (latest hosted hash). Platform is `process.platform === "darwin" ? "mac" : "win"` (matches `DownloadAgentSection.tsx`'s own OS-detection convention, just server-side-safe via Node's `process.platform` instead of `navigator.userAgent`).

### Main-process wiring

**File:** `apps/agent/src/main/app-state.ts` (modify) — add `setUpdateAvailable(commitHash: string | null): void` / `getUpdateAvailable(): string | null`, same pattern as every other piece of cross-module state in this file.

**File:** `apps/agent/src/main/index.ts` (modify) — after `bootstrap()`'s existing flow, if `blob.agentToken` is set, call `fetchLatestVersion` once at startup; on success, if `commitHash !== null && commitHash !== AGENT_COMMIT_HASH`, call `setUpdateAvailable(commitHash)`. Also start a `setInterval` (6 hours — `6 * 60 * 60 * 1000`) that re-checks and updates the same state, using `.unref()` on the timer so it never blocks app shutdown (matching `broker.ts`'s existing timer-unref convention). Only start the interval if `blob.agentToken` was set (no token, no check — matches how sync/layout are already gated).

**File:** `apps/agent/src/main/ipc.ts` (modify) — new handler:

```typescript
ipcMain.handle("agent:get-update-status", async () => {
  return { latestCommitHash: getUpdateAvailable() };
});
```

**File:** `apps/agent/src/preload/index.ts` (modify) — new `agentApi` method:

```typescript
  getUpdateStatus: (): Promise<{ latestCommitHash: string | null }> =>
    ipcRenderer.invoke("agent:get-update-status"),
```

### Renderer: banner in `AgentShell`

**File:** `apps/agent/src/renderer/lib/build-info.ts` (modify) — this file already computes a bare `AGENT_COMMIT_HASH` local constant (used to build `AGENT_BUILD_ID`) but doesn't export it. Add `export` to that existing `const AGENT_COMMIT_HASH = ...` line (no other change) so the banner logic below can compare against it directly instead of parsing it back out of `AGENT_BUILD_ID`'s combined string.

**File:** `apps/agent/src/renderer/AgentShell.tsx` (modify) — poll `getUpdateStatus()` every 60s (much lighter than the 5s device-status polls, this changes at most every 6 hours). When `latestCommitHash` is non-null AND differs from `AGENT_COMMIT_HASH` (now exported from `build-info.ts`), render a small banner above the existing version footer:

```tsx
{updateAvailable && (
  <button
    type="button"
    onClick={() => window.agentApi.openDownloadPage()}
    className="mt-3 text-[11px] px-3 py-1.5 rounded-md g-btn-ghost"
  >
    Versi baru tersedia — klik untuk unduh
  </button>
)}
```

`openDownloadPage()` is a new preload/IPC pair that calls Electron's `shell.openExternal(`${saasBaseUrl}/settings`)` in the main process (never let the renderer call `shell.openExternal` directly — matches this codebase's existing `contextIsolation`/narrow-preload-surface convention). `saasBaseUrl()` is already available in main (`saas-client.ts`).

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

### New SaaS endpoint: `POST /api/agent/logs`

**File:** `apps/saas/app/api/agent/logs/route.ts` (new)

```typescript
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { putLog } from "@/lib/storage/r2";

export async function POST(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;

  const body = await req.arrayBuffer();
  // 5 MB cap -- a rotated electron-log file is well under this; reject anything larger
  // rather than silently truncating (a truncated log is worse than no log -- the missing
  // tail is exactly where a crash's final lines usually are).
  if (body.byteLength > 5 * 1024 * 1024) {
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

`saasBaseUrl` is NOT currently imported here — add it to line 3's existing `./saas-client` import: `import { fetchDevices, patchDeviceModel, saasBaseUrl, type SaasDevice } from "./saas-client";`. Also add `getUpdateAvailable` to line 6's existing `./app-state` import list. Also add two brand-new imports: `import { readFileSync } from "node:fs";` and `import log from "electron-log/main";` (the same `electron-log/main` instance section A's `index.ts` change initializes — importing it again here just gets the already-initialized singleton, `electron-log` is designed to be imported per-module this way). Then two new handlers — first, the update-status one from section A above (`agent:get-update-status`, using `getUpdateAvailable`), and then:

```typescript
ipcMain.handle("agent:send-logs", async (): Promise<{ ok: boolean }> => {
  const blob = await loadCredentials();
  if (!blob.agentToken) return { ok: false };
  const logPath = log.transports.file.getFile().path; // electron-log's own API for its current log file location
  let content: Buffer;
  try {
    content = readFileSync(logPath);
  } catch {
    return { ok: false };
  }
  const res = await fetch(`${saasBaseUrl()}/api/agent/logs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${blob.agentToken}`, "Content-Type": "text/plain" },
    body: content,
  }).catch(() => null);
  return { ok: res?.ok === true };
});
```

`saasBaseUrl` is already imported in `ipc.ts` from `./saas-client` per its existing import list — no new import needed for that one.

**File:** `apps/agent/src/preload/index.ts` (modify) — `sendLogs: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("agent:send-logs")`.

### Renderer: the button

**File:** `apps/agent/src/renderer/screens/DashboardScreen.tsx` (modify) — small "Kirim log ke tim support" button (ghost-style, low visual weight, this is a support tool not a primary action) near the existing "Pengaturan" button in the header row. On click: call `sendLogs()`, show a one-line success/failure message (`g-success`/`g-error` text, same convention as the existing sync-status messages) for a few seconds, no modal/dialog needed — this is a fire-and-forget support action, not something requiring confirmation.

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
- `apps/agent/src/main/saas-client.test.ts` (modify, existing file — confirm exact name before writing the plan): `fetchLatestVersion` unit tests mirroring `fetchDevices`'s existing 401/403/network-error/success cases.
- `apps/agent/src/main/app-state.test.ts` (modify): `setUpdateAvailable`/`getUpdateAvailable` round-trip, same shape as the existing `setBrokerPin`/`getBrokerPin` test.
- `apps/agent/src/main/ipc.test.ts` (modify): `agent:get-update-status` returns current state; `agent:send-logs` returns `{ok:false}` when no token, `{ok:true}`/`{ok:false}` based on mocked fetch response.
- `apps/saas/app/api/agent/logs/route.test.ts` (new): 401 without valid token; 413 for an oversized body; 200 + `putLog` called with the right key shape on success; 503 when `putLog` throws.
- `apps/saas/lib/storage/r2.test.ts` (modify, existing file): `putLog` unit test mirroring `putProof`'s existing test.
- `apps/agent/src/renderer/AgentShell.test.tsx` (modify — this file already exists with 3 tests covering children/logo/build-id-footer rendering; the new tests below are added alongside them, and `window.agentApi` needs a `getUpdateStatus` mock added to whatever setup the existing 3 tests already share): banner renders when `getUpdateStatus()` returns a commit hash different from the build's own; banner absent when they match or when `latestCommitHash` is `null`.
- `apps/agent/src/renderer/screens/DashboardScreen.test.tsx` (modify): "Kirim log" button calls `sendLogs()` and shows success/failure text based on the mocked result.
