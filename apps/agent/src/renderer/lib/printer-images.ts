/**
 * Sama persis kontennya (foto studio resmi Bambu Lab/Snapmaker, di-resize sekali jalan lewat
 * sharp) dengan apps/saas/lib/devices/printer-images.ts -- disalin, BUKAN diimpor, karena app
 * ini bundle sendiri (electron-vite, tak menarik apps/saas ke dalam paket Electron).
 *
 * Path RELATIF ("./printers/...") wajib, bukan "/printers/..." -- di app terpaket ini dimuat
 * lewat file://, path absolut resolve ke root filesystem (lihat komentar AgentShell.tsx logo.svg).
 */
const BAMBU_IMAGES: Record<string, string> = {
  X1: "./printers/bambu-x1.jpg",
  X1C: "./printers/bambu-x1.jpg",
  X1E: "./printers/bambu-x1.jpg",
  P1S: "./printers/bambu-p1s.jpg",
  P1P: "./printers/bambu-p1s.jpg",
  P2S: "./printers/bambu-p2s.jpg",
  X2D: "./printers/bambu-x2d.jpg",
  H2D: "./printers/bambu-h2d.jpg",
  H2C: "./printers/bambu-h2c.jpg",
  A1: "./printers/bambu-a1.jpg",
  A1MINI: "./printers/bambu-a1-mini.jpg",
  A2L: "./printers/bambu-a2l.jpg",
};

const OTHER_IMAGES: Record<string, string> = {
  U1: "./printers/snapmaker-u1.jpg",
};

function normalizeModel(model: string): string {
  return model.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * `PrinterRow.type` (packages/printer-monitor-core) cuma menyimpan MODEL (mis. "P1S"), bukan
 * connector kind -- jadi lookup-nya flat, tak perlu tahu bambu/moonraker. null kalau model
 * kosong/tak dikenal -- caller fallback ke icon generik.
 */
export function getPrinterImage(model: string | null | undefined): string | null {
  if (!model) return null;
  const key = normalizeModel(model);
  return BAMBU_IMAGES[key] ?? OTHER_IMAGES[key] ?? null;
}
