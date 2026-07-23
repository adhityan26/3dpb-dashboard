import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"

/** printer_model_id (dari slice_info.config) → model token pendek yang dicari
 *  sebagai substring di nama printer profile milik user.
 *  Hanya berisi ID yang SUDAH terverifikasi dari sample file nyata — jangan
 *  tebak ID lain, tambahkan di sini kalau sudah ketemu dari file sample baru. */
const PRINTER_MODEL_ID_TOKEN: Record<string, string> = {
  C12: "P1S",
}

/** Cari PrinterProfileData yang nama-nya mengandung model token hasil mapping
 *  printer_model_id. Substring match case-insensitive (nama profile bisa custom,
 *  bukan nama resmi Bambu). Tidak ketemu mapping atau tidak ketemu profile → undefined. */
export function matchPrinterProfile(
  printerModelId: string | null,
  profiles: PrinterProfileData[],
): PrinterProfileData | undefined {
  if (!printerModelId) return undefined
  const token = PRINTER_MODEL_ID_TOKEN[printerModelId]
  if (!token) return undefined
  const needle = token.toLowerCase()
  return profiles.find(p => p.nama.toLowerCase().includes(needle))
}
