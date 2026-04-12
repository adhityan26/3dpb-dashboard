import { detectOrderPileup } from "./detectors/order-pileup"
import { detectStockLow } from "./detectors/stock-low"
import { detectRoasDrop } from "./detectors/roas-drop"
import { detectProductDelist } from "./detectors/product-delist"
import { detectSpoolLow } from "./detectors/spool-low"
import { wasRecentlySent } from "./dedupe"
import { sendAlert } from "./senders"
import type { AlertEvent, RunnerResult } from "./types"

export async function runAllDetectors(): Promise<RunnerResult> {
  const ranAt = new Date().toISOString()

  // Run detectors in parallel — they're independent.
  // Wrap each in try/catch so one failing detector doesn't kill the run.
  const detectorResults = await Promise.allSettled([
    detectOrderPileup(),
    detectStockLow(),
    detectRoasDrop(),
    detectProductDelist(),
    detectSpoolLow(),
  ])

  const allEvents: AlertEvent[] = []
  for (const r of detectorResults) {
    if (r.status === "fulfilled") {
      allEvents.push(...r.value)
    } else {
      console.warn("Detector failed:", r.reason)
    }
  }

  let sent = 0
  let skipped = 0
  let failed = 0
  const events: RunnerResult["events"] = []

  for (const event of allEvents) {
    const alreadySent = await wasRecentlySent(
      event.alertKey,
      event.dedupHours ?? 24,
    )
    if (alreadySent) {
      skipped++
      events.push({
        alertKey: event.alertKey,
        kind: event.kind,
        sent: false,
        reason: "duplicate within dedup window",
      })
      continue
    }

    const result = await sendAlert(event)
    if (result.anySent) {
      sent++
      events.push({ alertKey: event.alertKey, kind: event.kind, sent: true })
    } else {
      failed++
      events.push({
        alertKey: event.alertKey,
        kind: event.kind,
        sent: false,
        reason: result.results.map((r) => r.error).join("; "),
      })
    }
  }

  return {
    detected: allEvents.length,
    sent,
    skipped,
    failed,
    events,
    ranAt,
  }
}
