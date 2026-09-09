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
