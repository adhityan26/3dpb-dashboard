import type { PrinterType } from "./printer-types";

/**
 * Peta model -> thumbnail statis (foto studio resmi Bambu Lab/Snapmaker, di-resize & di-bundle
 * di public/printers/ -- BUKAN fetch runtime). Kunci dinormalisasi (huruf besar, tanpa spasi)
 * supaya toleran variasi ejaan input user (mis. "a1 mini" == "A1Mini").
 *
 * X1/X1C/X1E berbagi 1 foto (Bambu sendiri pakai foto sama di wiki-nya utk seri X1). P1P
 * berbagi foto P1S -- Bambu tak lagi menampilkan foto studio P1P terpisah di marketing
 * terbarunya, P1S adalah SKU utama seri P1 sekarang.
 */
const BAMBU_IMAGES: Record<string, string> = {
  X1: "/printers/bambu-x1.jpg",
  X1C: "/printers/bambu-x1.jpg",
  X1E: "/printers/bambu-x1.jpg",
  P1S: "/printers/bambu-p1s.jpg",
  P1P: "/printers/bambu-p1s.jpg",
  A1: "/printers/bambu-a1.jpg",
  A1MINI: "/printers/bambu-a1-mini.jpg",
  H2D: "/printers/bambu-h2d.jpg",
};

// Moonraker/Klipper mencakup banyak merek generik (Voron, Ender3, dst) tanpa 1 foto yang
// representatif -- cuma Snapmaker U1 yang dapat thumbnail asli di sini.
const MOONRAKER_IMAGES: Record<string, string> = {
  U1: "/printers/snapmaker-u1.jpg",
};

function normalizeModel(model: string): string {
  return model.trim().toUpperCase().replace(/\s+/g, "");
}

/** null kalau printerType/model tak dikenal -- caller fallback ke icon generik. */
export function getPrinterImage(printerType: string | null | undefined, model: string | null | undefined): string | null {
  if (!model) return null;
  const key = normalizeModel(model);
  const table: Record<string, string> | undefined =
    printerType === ("bambu" satisfies PrinterType) ? BAMBU_IMAGES : printerType === ("moonraker" satisfies PrinterType) ? MOONRAKER_IMAGES : undefined;
  return table?.[key] ?? null;
}
