import { describe, it, expect } from "vitest"
import { parseRangeFromSearchParams } from "@/lib/analytics/parse-range"

describe("parseRangeFromSearchParams", () => {
  it("parses known presets", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams("range=this_week"))).toBe("this_week")
    expect(parseRangeFromSearchParams(new URLSearchParams("range=this_month"))).toBe("this_month")
    expect(parseRangeFromSearchParams(new URLSearchParams("range=30d"))).toBe("30d")
  })

  it("parses a custom range when from/to are present", () => {
    const params = new URLSearchParams("range=custom&from=2026-08-01&to=2026-08-10")
    expect(parseRangeFromSearchParams(params)).toEqual({ from: "2026-08-01", to: "2026-08-10" })
  })

  it("falls back to 7d for missing or invalid range", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams(""))).toBe("7d")
    expect(parseRangeFromSearchParams(new URLSearchParams("range=bogus"))).toBe("7d")
  })

  it("falls back to 7d when custom is requested but from/to are missing", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams("range=custom"))).toBe("7d")
  })

  it("falls back to 7d for invalid custom date format", () => {
    const params = new URLSearchParams("range=custom&from=2026/08/01&to=2026-08-10")
    expect(parseRangeFromSearchParams(params)).toBe("7d")
  })

  it("falls back to 7d when custom from is after to", () => {
    const params = new URLSearchParams("range=custom&from=2026-08-10&to=2026-08-01")
    expect(parseRangeFromSearchParams(params)).toBe("7d")
  })

  it("falls back to 7d when custom span exceeds 366 days", () => {
    const params = new URLSearchParams("range=custom&from=2020-01-01&to=2026-08-10")
    expect(parseRangeFromSearchParams(params)).toBe("7d")
  })

  it("accepts a valid custom range within bounds", () => {
    const params = new URLSearchParams("range=custom&from=2026-01-01&to=2026-06-01")
    expect(parseRangeFromSearchParams(params)).toEqual({ from: "2026-01-01", to: "2026-06-01" })
  })
})
