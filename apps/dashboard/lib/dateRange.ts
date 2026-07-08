/**
 * Shared date range types and utilities for Iklan and Analisa.
 */

export type DateRangePreset =
  | "7d"         // last 7 days
  | "30d"        // last 30 days
  | "this_week"  // Mon → today
  | "this_month" // 1st → today
  | "custom"     // custom date range

export interface CustomDateRange {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

export type FlexRange = DateRangePreset | CustomDateRange

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  "7d":         "7 Hari",
  "30d":        "30 Hari",
  "this_week":  "Minggu Ini",
  "this_month": "Bulan Ini",
  "custom":     "Custom",
}

export function isCustomRange(r: FlexRange): r is CustomDateRange {
  return typeof r === "object"
}

export function isPreset(r: FlexRange, preset: DateRangePreset): boolean {
  return r === preset
}

/** Format Date → YYYY-MM-DD */
export function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Format Date → DD-MM-YYYY (Shopee API format) */
export function toShopeeDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}-${month}-${d.getFullYear()}`
}

/** Parse YYYY-MM-DD → DD-MM-YYYY */
export function ymdToShopee(ymd: string): string {
  const [y, m, d] = ymd.split("-")
  return `${d}-${m}-${y}`
}

/** Resolve a FlexRange to { startDate, endDate } in DD-MM-YYYY format for Shopee */
export function resolveRange(range: FlexRange): { startDate: string; endDate: string; label: string } {
  const now = new Date()
  const today = toShopeeDate(now)

  if (isCustomRange(range)) {
    return {
      startDate: ymdToShopee(range.from),
      endDate: ymdToShopee(range.to),
      label: `${range.from} – ${range.to}`,
    }
  }

  switch (range) {
    case "7d": {
      const start = new Date(now.getTime() - 6 * 86400000)
      return { startDate: toShopeeDate(start), endDate: today, label: "7 hari terakhir" }
    }
    case "30d": {
      const start = new Date(now.getTime() - 29 * 86400000)
      return { startDate: toShopeeDate(start), endDate: today, label: "30 hari terakhir" }
    }
    case "this_week": {
      const day = now.getDay() // 0=Sun
      const monday = new Date(now.getTime() - ((day === 0 ? 6 : day - 1)) * 86400000)
      return { startDate: toShopeeDate(monday), endDate: today, label: "Minggu ini" }
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { startDate: toShopeeDate(first), endDate: today, label: "Bulan ini" }
    }
    default:
      return { startDate: today, endDate: today, label: "" }
  }
}

/** Formatted display range for UI "09-05-2026 – 15-05-2026" */
export function displayRange(startDate: string, endDate: string): string {
  // Convert DD-MM-YYYY to readable
  const fmt = (s: string) => {
    const [d, m, y] = s.split("-")
    return `${y}-${m}-${d}`
  }
  return `${fmt(startDate)} – ${fmt(endDate)}`
}
