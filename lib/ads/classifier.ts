import type { RoasCategory, AdRecommendation, AdStatus } from "./types"

export const DEFAULT_ROAS_GOOD = 5.0
export const DEFAULT_ROAS_BAD = 2.0

/**
 * Classify a ROAS value into good/medium/bad buckets.
 */
export function classifyRoas(
  roas: number,
  thresholds: { good?: number; bad?: number } = {},
): RoasCategory {
  const good = thresholds.good ?? DEFAULT_ROAS_GOOD
  const bad = thresholds.bad ?? DEFAULT_ROAS_BAD
  if (roas >= good) return "good"
  if (roas < bad) return "bad"
  return "medium"
}

interface RecommendationInput {
  status: AdStatus
  roas: number
  expense: number
  orders: number
  dailyRoas: number[]
}

/**
 * Compute a single recommendation for an ad based on its aggregated metrics
 * and daily ROAS history.
 */
export function computeRecommendation(
  input: RecommendationInput,
): AdRecommendation {
  const { status, roas, expense, orders, dailyRoas } = input

  if (status === "berjalan" && dailyRoas.length >= 3) {
    const last3 = dailyRoas.slice(-3)
    if (last3.every((r) => r < 1.0)) {
      return {
        kind: "pause",
        reason:
          "ROAS di bawah 1x selama 3 hari berturut-turut — pertimbangkan pause",
      }
    }
  }

  if (status === "berjalan" && expense > 0 && orders === 0) {
    return {
      kind: "review",
      reason: "Iklan menghabiskan budget tapi tidak ada order",
    }
  }

  if (status === "berjalan" && roas >= 7.0) {
    return {
      kind: "scale_up",
      reason: `ROAS ${roas.toFixed(1)}x — pertimbangkan naikkan budget`,
    }
  }

  if (status === "dijeda" && roas >= 5.0) {
    return {
      kind: "reactivate",
      reason: `ROAS historis ${roas.toFixed(1)}x — pertimbangkan aktifkan kembali`,
    }
  }

  return { kind: "none", reason: "" }
}
