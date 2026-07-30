/**
 * Sengaja dipisah dari lib/devices/service.ts (yang menarik `@/lib/db` → Prisma) supaya komponen
 * client seperti DeviceList bisa mengimpor daftar tipe printer tanpa menyeret kode server ke bundle
 * browser. service.ts me-re-export keduanya, jadi call-site lama (`@/lib/devices/service`) tetap
 * jalan dan daftarnya tetap SATU sumber kebenaran.
 */
export const PRINTER_TYPES = ["bambu", "moonraker"] as const;
export type PrinterType = (typeof PRINTER_TYPES)[number];

/** Label tampilan untuk dropdown — nilai yang dikirim ke API tetap string mentah di PRINTER_TYPES. */
export const PRINTER_TYPE_LABELS: Record<PrinterType, string> = {
  bambu: "Bambu Lab",
  moonraker: "Moonraker (Klipper)",
};

/** Saran (bukan pembatas) untuk datalist input model di DeviceList -- ejaan kanonik sama
 * dengan services/printer-monitor/config.example.json (mis. "A1Mini", bukan "A1 mini"). */
export const PRINTER_MODEL_SUGGESTIONS: Record<PrinterType, readonly string[]> = {
  bambu: ["X1C", "X1E", "X1", "P1S", "P1P", "A1", "A1Mini", "H2D"],
  moonraker: ["U1", "Voron", "Ender3"],
};
