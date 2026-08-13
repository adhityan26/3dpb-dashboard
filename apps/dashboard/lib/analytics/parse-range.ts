import type { FlexRange, DateRangePreset } from "@/lib/dateRange"

const KNOWN_PRESETS: DateRangePreset[] = ["7d", "30d", "this_week", "this_month", "custom"]

export function parseRangeFromSearchParams(searchParams: URLSearchParams): FlexRange {
  const raw = searchParams.get("range")
  if (raw === "custom") {
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (from && to) return { from, to }
    return "7d"
  }
  if (raw && (KNOWN_PRESETS as string[]).includes(raw) && raw !== "custom") {
    return raw as DateRangePreset
  }
  return "7d"
}
