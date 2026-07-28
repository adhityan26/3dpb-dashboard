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
