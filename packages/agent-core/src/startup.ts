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
