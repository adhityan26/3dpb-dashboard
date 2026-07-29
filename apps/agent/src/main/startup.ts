import { loadCredentials } from "./credential-store";
import { loadDeviceCache, saveDeviceCache, type CachedDevice } from "./device-cache";
import { fetchDevices } from "./saas-client";
import type { PairedDevice } from "./engine-manager";

/**
 * Gabung kredensial lokal (Task 2) + metadata device (fresh dari SaaS kalau reachable,
 * fallback ke cache lokal Task 3 kalau unreachable) jadi PairedDevice[] siap dipakai
 * startEngine (Task 8). Device yang belum pernah di-pairing (gak ada di credential blob)
 * di-skip, bukan bikin seluruh startup gagal.
 */
export async function buildPairedDevices(): Promise<PairedDevice[]> {
  const blob = await loadCredentials();
  if (!blob.agentToken) return [];

  let metadata: CachedDevice[];
  const result = await fetchDevices(blob.agentToken);
  if (result.ok) {
    metadata = result.data.map((d) => ({ shortCode: d.shortCode, label: d.label, printerType: d.printerType }));
    await saveDeviceCache(metadata); // refresh cache tiap kali fresh-fetch sukses
  } else {
    metadata = await loadDeviceCache(); // SaaS unreachable (401/403/network_error semua) -> andalkan cache lokal
  }

  const paired: PairedDevice[] = [];
  for (const m of metadata) {
    const secret = blob.devices[m.shortCode];
    if (!secret) continue; // device terdaftar tapi belum di-pairing (belum diisi IP/serial/accessCode)
    paired.push({ shortCode: m.shortCode, label: m.label, printerType: m.printerType, secret });
  }
  return paired;
}
