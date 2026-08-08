import type { PrinterType } from "./printer-types";

const BAMBU_BRAND = "Bambu Lab";

// printerType "moonraker" = protokol/engine (Klipper), BUKAN merek -- merek sesungguhnya
// ditentukan dari model. Model di luar peta ini (build DIY custom, dsb) tak punya 1 merek
// tunggal -- fallback ke "Klipper" (istilah yang lebih dikenal user awam daripada "moonraker",
// yang sebenarnya cuma nama API server-nya Klipper).
const MOONRAKER_BRANDS: Record<string, string> = {
  U1: "Snapmaker",
  VORON: "Voron",
  ENDER3: "Creality",
};
const MOONRAKER_GENERIC_BRAND = "Klipper";

function normalizeModel(model: string): string {
  return model.trim().toUpperCase().replace(/\s+/g, "");
}

/** Merek user-facing (bukan nama connector/engine internal) buat ditampilkan di daftar printer. */
export function getPrinterBrand(printerType: string | null | undefined, model: string | null | undefined): string {
  if (printerType === ("bambu" satisfies PrinterType)) return BAMBU_BRAND;
  if (printerType === ("moonraker" satisfies PrinterType)) {
    if (!model) return MOONRAKER_GENERIC_BRAND;
    return MOONRAKER_BRANDS[normalizeModel(model)] ?? MOONRAKER_GENERIC_BRAND;
  }
  return printerType ?? "—";
}
