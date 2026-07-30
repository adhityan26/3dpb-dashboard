import { loadCredentials } from "./credential-store";
import { loadDeviceCache, saveDeviceCache, type CachedDevice } from "./device-cache";
import { fetchDevices, type FetchResult, type SaasDevice } from "./saas-client";
import type { PairedDevice } from "./engine-manager";

export interface ReconcileResult {
  fetchResult: FetchResult<SaasDevice[]>;
  // Device yang DIKETAHUI terdaftar (fresh dari SaaS kalau fetchResult.ok, atau dipetakan
  // dari device-cache lokal kalau fallback) — dipakai PairingScreen buat tahu device APA
  // SAJA yang perlu dipasangkan, terlepas dari sudah/belum ada secret-nya. Saat fallback
  // cache, field non-esensial (id/userId/createdAt/updatedAt) diisi default kosong karena
  // device-cache.ts sengaja cuma nyimpan shortCode/label/printerType (Task 3 — non-rahasia).
  devices: SaasDevice[];
  paired: PairedDevice[];
}

/**
 * Gabung kredensial lokal (Task 2) + metadata device (fresh dari SaaS kalau reachable,
 * fallback ke cache lokal Task 3 kalau unreachable) jadi PairedDevice[] siap dipakai
 * startEngine (Task 8). Device yang belum pernah di-pairing (gak ada di credential blob)
 * di-skip, bukan bikin seluruh startup gagal.
 *
 * Dipakai bareng oleh bootstrap() startup (lewat buildPairedDevices di bawah) DAN
 * agent:sync (Task 13 review Finding 1) — Sync harus lakukan rekonsiliasi yang SAMA
 * persis dengan startup, bukan cuma fetch tanpa efek.
 */
export async function reconcileDevices(token: string): Promise<ReconcileResult> {
  let metadata: CachedDevice[];
  const fetchResult = await fetchDevices(token);
  if (fetchResult.ok) {
    metadata = fetchResult.data.map((d) => ({ shortCode: d.shortCode, label: d.label, printerType: d.printerType, model: d.model }));
    await saveDeviceCache(metadata); // refresh cache tiap kali fresh-fetch sukses
  } else {
    metadata = await loadDeviceCache(); // SaaS unreachable (401/403/network_error semua) -> andalkan cache lokal
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

  const blob = await loadCredentials();
  const paired: PairedDevice[] = [];
  for (const m of metadata) {
    const secret = blob.devices[m.shortCode];
    if (!secret) continue; // device terdaftar tapi belum di-pairing (belum diisi IP/serial/accessCode)
    paired.push({ shortCode: m.shortCode, label: m.label, printerType: m.printerType, model: m.model, secret });
  }
  return { fetchResult, devices, paired };
}

export async function buildPairedDevices(): Promise<PairedDevice[]> {
  const blob = await loadCredentials();
  if (!blob.agentToken) return [];
  const { paired } = await reconcileDevices(blob.agentToken);
  return paired;
}
