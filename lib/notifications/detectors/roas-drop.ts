import { getAdsPerformance } from "@/lib/ads/service"
import { getAlertThresholds } from "@/lib/settings/service"
import type { AlertEvent } from "../types"

/**
 * Detect ads where 7-day ROAS was previously good but recent (1-day) has
 * dropped below the threshold.
 *
 * Logic:
 * - Historical: average ROAS of first 6 days in the 7-day window
 * - Recent: last day's ROAS
 * - Alert if historical ≥ 5x AND recent < threshold AND ratio ≥ 3x
 */
export async function detectRoasDrop(): Promise<AlertEvent[]> {
  const thresholds = await getAlertThresholds()
  const result = await getAdsPerformance("7d")

  const events: AlertEvent[] = []

  for (const ad of result.ads) {
    if (ad.status !== "berjalan") continue
    if (ad.daily.length < 4) continue

    const days = ad.daily
    const recentDay = days[days.length - 1]
    const historical = days.slice(0, -1)

    const histAvgRoas =
      historical.reduce((s, d) => s + d.roas, 0) / historical.length
    const recentRoas = recentDay.roas

    if (
      histAvgRoas >= 5 &&
      recentRoas < thresholds.roasMin &&
      histAvgRoas / Math.max(recentRoas, 0.01) >= 3
    ) {
      events.push({
        kind: "roas_drop",
        severity: "high",
        alertKey: `roas_drop:${ad.campaignId}`,
        title: "ROAS Iklan Turun Drastis",
        body: `${ad.adName} — ROAS turun dari ${histAvgRoas.toFixed(1)}x (rata-rata 6 hari) ke ${recentRoas.toFixed(1)}x kemarin. Threshold: ${thresholds.roasMin}x.`,
      })
    }
  }

  return events
}
