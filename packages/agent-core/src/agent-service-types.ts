import type { SaasDevice, SaasFailKind } from "./saas-client";

export interface ActivationState {
  hasToken: boolean;
  devices: SaasDevice[];
  pairedShortCodes: string[];
}

export type UpdateDeviceModelResult = { ok: boolean; kind?: "invalid_model" };

export type SyncResult =
  | { ok: true; deviceCount: number }
  | { ok: false; kind: SaasFailKind | "engine_error" | "broker_unavailable" };
