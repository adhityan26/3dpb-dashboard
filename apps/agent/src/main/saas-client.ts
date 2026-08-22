import type { LayoutConfigOut } from "@3pb/cyd-layout-schema";
import log from "electron-log/main";

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

// Bentuk KHUSUS buat patchDeviceModel -- BUKAN memperluas FetchResult<T> yang dipakai
// fetchDevices/fetchLayout, karena kode yang exhaustive-switch atas union `kind` FetchResult
// itu (mis. renderer lama) tidak siap sama sekali dengan member "invalid_model" yang cuma
// relevan buat PATCH model (Task final-review Fix 2b).
export type PatchDeviceModelResult =
  | { ok: true; data: { model: string | null } }
  | { ok: false; kind: SaasFailKind | "invalid_model" };

// Di-inject `define` electron.vite.config.ts saat build. Dideklarasikan (bukan di-import)
// karena identifier ini DIGANTI literal string oleh Vite; di luar build (vitest, tsx)
// identifier-nya memang tak ada — makanya dibaca lewat `typeof` yang aman untuk identifier
// yang tak terdeklarasi sama sekali.
declare const __SAAS_BASE_URL__: string | undefined;
declare const __AGENT_VERSION__: string | undefined;
declare const __AGENT_COMMIT_HASH__: string | undefined;

const BUILD_TIME_BASE_URL = typeof __SAAS_BASE_URL__ === "string" ? __SAAS_BASE_URL__ : "";
// "0.0.0" di luar build (vitest/tsx) -- sama alasannya dengan BUILD_TIME_BASE_URL, identifier
// __AGENT_VERSION__ diganti Vite `define` cuma saat build sungguhan.
const AGENT_VERSION = typeof __AGENT_VERSION__ === "string" ? __AGENT_VERSION__ : "0.0.0";
// "nogit" = fallback yang sama alasannya (di luar build sungguhan, atau git tak tersedia
// saat build -- lihat electron.vite.config.ts).
const AGENT_COMMIT_HASH = typeof __AGENT_COMMIT_HASH__ === "string" ? __AGENT_COMMIT_HASH__ : "nogit";

// Gaya semver build-metadata ("+hash"). Dikirim lewat header X-Agent-Version YANG SUDAH ADA
// (bukan header baru) -- backend (AgentToken.agentVersion) otomatis simpan versi+commit tanpa
// migrasi schema. Selama fase staging versi package.json tak pernah naik tiap rebuild (butuh
// konfirmasi eksplisit user), jadi commit hash-lah yang bedain "build yang saya test barusan"
// dari build sebelumnya.
const AGENT_BUILD_ID = `${AGENT_VERSION}+${AGENT_COMMIT_HASH}`;

/**
 * Env var runtime menang (buat test + debugging/self-host), fallback ke nilai build-time.
 * Kalau dua-duanya kosong, SEMUA panggilan SaaS pasti gagal — `bootstrap()` (main/index.ts)
 * mengecek ini di startup dan menulis warning eksplisit, supaya salah konfigurasi build
 * tidak menyamar jadi "network_error" generik tanpa jejak.
 */
export function saasBaseUrl(): string {
  return process.env.SAAS_BASE_URL || BUILD_TIME_BASE_URL;
}

// Bare `fetch` bisa hang di level TCP connect (~75s OS default) pada captive portal /
// DNS blackhole / VPN setengah-jalan — kondisi jaringan yang justru paling relevan buat
// fitur rekonstruksi-offline (Task 10). Timeout pendek pastikan startup tetap responsif;
// AbortSignal's error ketangkep `catch` di bawah dan dipetakan ke "network_error" seperti biasa.
const FETCH_TIMEOUT_MS = 5_000;

// A 2xx whose body is not JSON means the base URL points at something other than the app
// (placeholder page, captive portal, reverse proxy default vhost). Decided from the
// content-type header BEFORE res.json() so the failure is classified, not swallowed by the
// generic catch. Test doubles may omit `headers` entirely -- only a header that is present
// AND non-JSON counts as wrong_server; absence is treated as JSON (no behaviour change for
// callers/tests that never set it).
function isNonJsonResponse(res: Response): boolean {
  const contentType = res.headers?.get?.("content-type");
  if (contentType == null) return false;
  return !contentType.toLowerCase().includes("json");
}

function wrongServer(path: string, res: Response): { ok: false; kind: "wrong_server" } {
  log.error(
    `[saas-client] ${saasBaseUrl()}${path} answered ${res.status} with content-type "${res.headers?.get?.("content-type")}" -- this is NOT the Slizebiz app. The SAAS_BASE_URL baked into this build is wrong (e.g. the app.slizebiz.com placeholder); rebuild with SAAS_BASE_URL=<app url>.`,
  );
  return { ok: false, kind: "wrong_server" };
}

export async function fetchDevices(token: string): Promise<FetchResult<SaasDevice[]>> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/devices`, {
      headers: { Authorization: `Bearer ${token}`, "X-Agent-Version": AGENT_BUILD_ID },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return wrongServer("/api/agent/devices", res);
    return { ok: true, data: (await res.json()) as SaasDevice[] };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export async function fetchLayout(token: string): Promise<FetchResult<LayoutConfigOut | null>> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/layout`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return wrongServer("/api/agent/layout", res);
    return { ok: true, data: (await res.json()) as LayoutConfigOut };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export async function patchDeviceModel(token: string, shortCode: string, model: string): Promise<PatchDeviceModelResult> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/devices/${shortCode}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    // 400 SPESIFIK dicek body-nya -- `PATCH /api/agent/devices/[shortCode]` balas
    // `{ error: "invalid_device_model" }` kalau model > LAYOUT_LIMITS.maxPrinterModelLength.
    // Ini beda kelas dari kegagalan jaringan/koneksi: user perlu tahu MODEL-nya yang salah
    // (dan akan tetap ditolak kalau diulang lewat web), bukan disuruh "coba lagi lewat web".
    if (res.status === 400) {
      const body = await res.json().catch(() => null);
      if (body && (body as { error?: string }).error === "invalid_device_model") {
        return { ok: false, kind: "invalid_model" };
      }
      return { ok: false, kind: "network_error" };
    }
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return wrongServer(`/api/agent/devices/${shortCode}`, res);
    return { ok: true, data: (await res.json()) as { model: string | null } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export type FetchVersionResult =
  | { ok: true; data: { updateAvailable: boolean } }
  | { ok: false; kind: SaasFailKind };

export async function fetchLatestVersion(token: string, platform: "win" | "mac"): Promise<FetchVersionResult> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/version?platform=${platform}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Agent-Version": AGENT_BUILD_ID },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    if (isNonJsonResponse(res)) return wrongServer(`/api/agent/version?platform=${platform}`, res);
    const { commitHash } = (await res.json()) as { commitHash: string | null };
    return { ok: true, data: { updateAvailable: commitHash !== null && commitHash !== AGENT_COMMIT_HASH } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}
