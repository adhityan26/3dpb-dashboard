import type { LayoutConfigOut } from "@3pb/cyd-layout-schema";

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

export async function fetchLayout(token: string): Promise<FetchResult<LayoutConfigOut | null>> {
  try {
    const res = await fetch(`${baseUrl()}/api/agent/layout`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return { ok: false, kind: "network_error" };
    return { ok: true, data: (await res.json()) as LayoutConfigOut };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}
