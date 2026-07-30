import type { LayoutConfigOut } from "@3pb/cyd-layout-schema";

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

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "invalid_token" | "entitlement_expired" | "network_error" };

// Di-inject `define` electron.vite.config.ts saat build. Dideklarasikan (bukan di-import)
// karena identifier ini DIGANTI literal string oleh Vite; di luar build (vitest, tsx)
// identifier-nya memang tak ada — makanya dibaca lewat `typeof` yang aman untuk identifier
// yang tak terdeklarasi sama sekali.
declare const __SAAS_BASE_URL__: string | undefined;

const BUILD_TIME_BASE_URL = typeof __SAAS_BASE_URL__ === "string" ? __SAAS_BASE_URL__ : "";

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

export async function fetchDevices(token: string): Promise<FetchResult<SaasDevice[]>> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/devices`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
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
    return { ok: true, data: (await res.json()) as LayoutConfigOut };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}

export async function patchDeviceModel(token: string, shortCode: string, model: string): Promise<FetchResult<{ model: string | null }>> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/devices/${shortCode}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    return { ok: true, data: (await res.json()) as { model: string | null } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}
