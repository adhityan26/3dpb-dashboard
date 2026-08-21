import type { FlexRange, DateRangePreset } from "@/lib/dateRange"

const KNOWN_PRESETS: DateRangePreset[] = ["7d", "30d", "this_week", "this_month"]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_CUSTOM_RANGE_DAYS = 366

export function parseRangeFromSearchParams(searchParams: URLSearchParams): FlexRange {
  const raw = searchParams.get("range")
  if (raw === "custom") {
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (!from || !to) return "7d"
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return "7d"
    if (from > to) return "7d"
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000))
    if (spanDays > MAX_CUSTOM_RANGE_DAYS) return "7d"
    return { from, to }
  }
  if (raw && (KNOWN_PRESETS as string[]).includes(raw)) {
    return raw as DateRangePreset
  }
  return "7d"
}
