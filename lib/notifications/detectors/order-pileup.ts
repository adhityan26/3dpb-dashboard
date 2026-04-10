import { getReadyToShipOrders } from "@/lib/orders/service"
import { getAlertThresholds } from "@/lib/settings/service"
import type { AlertEvent } from "../types"

/**
 * Detect orders that have been READY_TO_SHIP without label print for too long.
 */
export async function detectOrderPileup(): Promise<AlertEvent[]> {
  const thresholds = await getAlertThresholds()
  const result = await getReadyToShipOrders()

  const cutoff =
    Math.floor(Date.now() / 1000) - thresholds.orderPileupHours * 3600
  const stale = result.orders.filter(
    (o) => !o.labelPrinted && o.createTime <= cutoff,
  )

  if (stale.length < thresholds.orderPileupCount) {
    return []
  }

  // Dedup per hour-of-day so alert fires at most once per hour
  const hourBucket = new Date()
  hourBucket.setMinutes(0, 0, 0)
  const alertKey = `order_pileup:${hourBucket.toISOString()}`

  return [
    {
      kind: "order_pileup",
      severity: "warning",
      alertKey,
      title: "Order Numpuk!",
      body: `${stale.length} order belum dicetak labelnya lebih dari ${thresholds.orderPileupHours} jam. Cek tab Order sekarang.`,
      dedupHours: 1,
    },
  ]
}
