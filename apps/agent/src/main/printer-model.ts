import type { SaasDevice } from "./saas-client";

/** Dipakai engine-manager.ts kalau Device.model kosong -- "Bambu Lab"/"Klipper" dua-duanya
 * masuk batas 11 byte buffer firmware char type[12] (LAYOUT_LIMITS.maxPrinterModelLength). */
export const CYD_TYPE_FALLBACK: Record<"bambu" | "moonraker", string> = {
  bambu: "Bambu Lab",
  moonraker: "Klipper",
};

// Kode header `DevModel.bambu.com` dari broadcast SSDP LAN Bambu Lab -> model kanonik (ejaan
// sama dengan services/printer-monitor/config.example.json). Header ini didokumentasikan
// publik oleh integrasi open-source pihak ketiga (mis. Home Assistant Bambu Lab, bambulabs_api).
const SSDP_MODEL_CODES: Record<string, string> = {
  "3DPrinter-X1": "X1",
  "3DPrinter-X1-Carbon": "X1C",
  C11: "P1P",
  C12: "P1S",
  C13: "X1E",
  N1: "A1Mini",
  N2S: "A1",
  O1D: "H2D",
};

/** Kode tak dikenal -> null, BUKAN ditebak -- menormalkan string mentah asal-asalan bisa
 * mengirim nilai seperti "3DPrinter-X" ke layar customer, lebih buruk daripada tak menyarankan
 * apa-apa. Warning supaya tabel ini bisa ditumbuhkan dari data lapangan. */
export function suggestModelFromSsdp(devModel: string): string | null {
  const known = SSDP_MODEL_CODES[devModel];
  if (known) return known;
  // String kosong = header `DevModel.bambu.com` absen dari broadcast SSDP (bukan kode tak
  // dikenal) -- tak ada apa pun buat dicatat di sini, warning-nya cuma berguna buat menumbuhkan
  // SSDP_MODEL_CODES dari kode MENTAH yang nyata di lapangan.
  if (devModel === "") return null;
  console.warn(`[printer-model] kode DevModel Bambu tak dikenal, tak disarankan: ${devModel}`);
  return null;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Cari device SaaS yang label-nya paling mirip nama hasil scan -- REKOMENDASI untuk menandai
 * tombol "Pasangkan ke ..." di PairingScreen, bukan keputusan otomatis; user tetap pilih sendiri. */
export function matchDeviceByName(devName: string, devices: SaasDevice[]): string | null {
  const target = normalizeForMatch(devName);
  const match = devices.find((d) => normalizeForMatch(d.label) === target);
  return match?.shortCode ?? null;
}
