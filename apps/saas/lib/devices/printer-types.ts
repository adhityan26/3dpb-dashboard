/**
 * Sengaja dipisah dari lib/devices/service.ts (yang menarik `@/lib/db` → Prisma) supaya komponen
 * client seperti DeviceList bisa mengimpor daftar tipe printer tanpa menyeret kode server ke bundle
 * browser. service.ts me-re-export keduanya, jadi call-site lama (`@/lib/devices/service`) tetap
 * jalan dan daftarnya tetap SATU sumber kebenaran.
 */
export const PRINTER_TYPES = ["bambu", "moonraker"] as const;
export type PrinterType = (typeof PRINTER_TYPES)[number];

/**
 * Label tampilan untuk dropdown "Tipe printer" -- nilai yang dikirim ke API tetap string mentah
 * di PRINTER_TYPES. "moonraker" leading dengan nama MEREK yang dikenal user awam (bukan istilah
 * protokol/engine mentah), TAPI tetap disebut generik "printer Klipper" karena satu opsi ini
 * genuinely mencakup banyak merek + build custom/DIY -- bukan daftar tertutup, jadi tak boleh
 * jadi dropdown per-merek (nanti kesannya cuma merek yang disebut yang didukung).
 */
export const PRINTER_TYPE_LABELS: Record<PrinterType, string> = {
  bambu: "Bambu Lab",
  moonraker: "Klipper (Snapmaker, Voron, Creality K-series, dll.)",
};

/** Saran (bukan pembatas) untuk datalist input model di DeviceList -- ejaan kanonik sama
 * dengan services/printer-monitor/config.example.json (mis. "A1Mini", bukan "A1 mini"). */
export const PRINTER_MODEL_SUGGESTIONS: Record<PrinterType, readonly string[]> = {
  bambu: ["X1C", "X1E", "X1", "P1S", "P1P", "P2S", "X2D", "H2D", "H2C", "A1", "A1Mini", "A2L"],
  moonraker: ["U1", "Voron", "Ender3"],
};
