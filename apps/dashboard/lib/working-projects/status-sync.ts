import { prisma } from '@/lib/db'
import { getOrderDetail } from '@/lib/shopee/orders'
import { getOrderById } from '@/lib/tokopedia/orders'
import { parseOrder } from '@/lib/tokopedia/parse'
import { updateWorkingProject, getStatusSyncLastRunDate, setStatusSyncLastRunDate } from './service'

/**
 * Maps a Shopee order_status to the WP status it implies, for a WP that's
 * currently "Open" — i.e. what "Open" should have become once the
 * marketplace order moved past ready-to-ship. `null` means no change (the
 * order is still READY_TO_SHIP/PROCESSED, genuinely in sync with Open).
 *
 * Decided 2026-09-29 after checking: every "SHIPPED" order in production at
 * the time was already LOGISTICS_PICKUP_DONE (courier has it) — Shopee's
 * "SHIPPED" status only exists once pickup has happened, there is no
 * separate "label printed, not yet picked up" Shopee order_status (that
 * state is still READY_TO_SHIP/PROCESSED on the order_status field itself).
 *
 * TO_CONFIRM_RECEIVE (added 2026-09-29, found checking order
 * 260908G6NP742M) — package delivered, awaiting the buyer's receipt
 * confirmation before Shopee auto-completes it — is the same "ball is in
 * the customer's court" state as SHIPPED, so it maps the same way. A daily
 * job can plausibly see an order jump straight from PROCESSED to
 * TO_CONFIRM_RECEIVE within one day, skipping SHIPPED entirely, without
 * this the WP would stay stuck on "Open" until COMPLETED.
 *
 * RETRY_SHIP (pickup failed, rescheduled) and IN_CANCEL (cancellation
 * requested but not yet final) are deliberately left unmapped (null) —
 * neither has an obvious single WORKING_PROJECT_STATUSES equivalent, and
 * both are transient (they resolve to another status Shopee-side; the next
 * day's run picks up whatever they become).
 */
export function classifyShopeeStatus(orderStatus: string): string | null {
  if (orderStatus === 'SHIPPED' || orderStatus === 'TO_CONFIRM_RECEIVE') return 'Waiting Customer'
  if (orderStatus === 'COMPLETED') return 'Done'
  if (orderStatus === 'CANCELLED') return 'Canceled'
  return null
}

/**
 * Same idea for Tokopedia's sku_display_status.
 *
 * Codes verified 2026-10-04 against Seller Center exports + the live API
 * (264/264 orders in the "Selesai" tab are 130; 14/14 sampled cancelled
 * orders are 140 and appear in none of the four list tabs; 121 = in
 * transit, 122 = delivered, 120 = handed to courier). An earlier version of
 * this map had 130 and 140 swapped, which marked cancelled orders "Done"
 * and left completed orders stuck on "Waiting Customer".
 *
 * "Siap Kirim" is NOT a shipping-progress status at all — corrected
 * 2026-09-29 after checking order 260910KH47YVNB: it's a manual-only
 * production milestone ("barang sudah jadi, siap dikirim"), set by hand
 * once production finishes, unrelated to what the marketplace order status
 * says. It must never be set automatically here. 112 ("Paket sedang
 * disiapkan penjual dan akan diserahkan kepada ekspedisi" — label made, NOT
 * yet picked up) is deliberately left unmapped (null, stays "Open") for the
 * same reason "Siap Kirim" can't be inferred from it.
 */
export function classifyTokopediaStatus(skuDisplayStatus: number | null | undefined): string | null {
  if (skuDisplayStatus === 120 || skuDisplayStatus === 121 || skuDisplayStatus === 122) return 'Waiting Customer'
  if (skuDisplayStatus === 130) return 'Done'
  if (skuDisplayStatus === 140) return 'Canceled'
  return null
}

export interface StatusSyncResult {
  scanned: number
  updated: number
  skipped: number
  failed: number
  errors: string[]
}

// Statuses this job is allowed to read FROM. "Siap Kirim" included
// 2026-09-29: found in production that WPs the admin had manually marked
// "Siap Kirim" (production done) stayed stuck there even after the order
// actually shipped. "Waiting Customer" and "Proses" included 2026-10-04: 74
// Shopee WPs sat on "Waiting Customer" after their order was already
// COMPLETED, because a WP set to "Waiting Customer" (shipped) was never
// scanned again, so it could never advance to Done. "Siap Kirim" itself is
// still never a WRITE target (see classifyShopeeStatus/classifyTokopediaStatus
// above) — this only lets a WP move FORWARD once the marketplace confirms it.
// Done/Canceled are terminal and never scanned.
const SYNCABLE_STATUSES = ['Open', 'Proses', 'Siap Kirim', 'Waiting Customer'] as const

/**
 * Scans every WP not yet Done/Canceled (see SYNCABLE_STATUSES) and, where the actual
 * Shopee/Tokopedia order has moved on (shipped/completed/cancelled),
 * updates the WP status to match — via updateWorkingProject(), so the
 * Discord thread's starter post is edited in place (same path the bot's
 * own PATCH uses; does not archive the thread, matching setStatus()'s
 * existing behavior).
 */
export async function syncWorkingProjectStatusFromMarketplace(): Promise<StatusSyncResult> {
  const errors: string[] = []
  const rows = await prisma.workingProject.findMany({
    where: { status: { in: [...SYNCABLE_STATUSES] } },
    select: { source: true, sourceOrderNo: true, discordThreadId: true, shipping: true, status: true },
  })

  const result: StatusSyncResult = { scanned: rows.length, updated: 0, skipped: 0, failed: 0, errors }

  const shopeeRows = rows.filter((r) => r.source === 'shopee' && r.sourceOrderNo)
  const tokopediaRows = rows.filter((r) => r.source === 'tokopedia' && r.sourceOrderNo)

  // A WP's `shipping` field is only ever populated once, at auto-create
  // time — Shopee/Tokopedia frequently haven't assigned a courier yet that
  // early (it's typically set once the order is actually picked up), so
  // many WPs stayed permanently blank even after the real order later got
  // one. This job already re-fetches the order anyway for status, so it
  // backfills `shipping` too whenever the WP doesn't have one yet.
  const shopeeDetailBySn = new Map<string, { order_status: string; shipping_carrier?: string }>()
  const sns = shopeeRows.map((r) => r.sourceOrderNo!)
  for (let i = 0; i < sns.length; i += 50) {
    const batch = sns.slice(i, i + 50)
    try {
      const details = await getOrderDetail(batch)
      for (const d of details) shopeeDetailBySn.set(d.order_sn, { order_status: d.order_status, shipping_carrier: d.shipping_carrier })
    } catch (err) {
      errors.push(`shopee batch: gagal ambil order — ${(err as Error).message}`)
    }
  }

  for (const r of shopeeRows) {
    const detail = shopeeDetailBySn.get(r.sourceOrderNo!)
    const classified = detail ? classifyShopeeStatus(detail.order_status) : null
    // Already on the target status: no write (it would still re-edit the Discord post daily).
    const statusTarget = classified && classified !== r.status ? classified : null
    const shippingTarget = !r.shipping && detail?.shipping_carrier ? detail.shipping_carrier : null
    if (!statusTarget && !shippingTarget) { result.skipped++; continue }
    if (!r.discordThreadId) { result.skipped++; continue }
    try {
      await updateWorkingProject(r.discordThreadId, {
        ...(statusTarget ? { status: statusTarget } : {}),
        ...(shippingTarget ? { shipping: shippingTarget } : {}),
      })
      result.updated++
    } catch (err) {
      result.failed++
      errors.push(`shopee:${r.sourceOrderNo}: ${(err as Error).message}`)
    }
  }

  for (const r of tokopediaRows) {
    let statusTarget: string | null = null
    let shippingTarget: string | null = null
    try {
      const raw = await getOrderById(r.sourceOrderNo!)
      const code = (raw as { order_status_module?: { sku_display_status?: number }[] } | null)?.order_status_module?.[0]?.sku_display_status
      const classified = classifyTokopediaStatus(code)
      statusTarget = classified && classified !== r.status ? classified : null
      if (!r.shipping && raw) {
        const courier = parseOrder(raw)?.courier
        if (courier) shippingTarget = courier
      }
    } catch (err) {
      result.skipped++
      errors.push(`tokopedia:${r.sourceOrderNo}: gagal ambil order — ${(err as Error).message}`)
      continue
    }
    if (!statusTarget && !shippingTarget) { result.skipped++; continue }
    if (!r.discordThreadId) { result.skipped++; continue }
    try {
      await updateWorkingProject(r.discordThreadId, {
        ...(statusTarget ? { status: statusTarget } : {}),
        ...(shippingTarget ? { shipping: shippingTarget } : {}),
      })
      result.updated++
    } catch (err) {
      result.failed++
      errors.push(`tokopedia:${r.sourceOrderNo}: ${(err as Error).message}`)
    }
  }

  return result
}

// "YYYY-MM-DD" in Asia/Jakarta (WIB, UTC+7, no DST) for a given instant —
// same helper duplicated in auto-create.ts (kept local rather than shared
// to avoid a cross-file dependency for two one-line functions).
function wibDateString(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(instant)
}

function wibHour(instant: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(instant),
  )
}

/**
 * Runs the status-sync scan at most once per WIB calendar day, only once
 * the day has reached the 01:00 WIB cutoff — same "poller ticks often, this
 * decides if today's run is actually due" pattern as
 * runDailyAutoCreateIfDue in auto-create.ts. Returns `null` when not due.
 */
export async function runDailyStatusSyncIfDue(now: Date = new Date()): Promise<StatusSyncResult | null> {
  if (wibHour(now) < 1) return null

  const today = wibDateString(now)
  const lastRun = await getStatusSyncLastRunDate()
  if (lastRun === today) return null

  const result = await syncWorkingProjectStatusFromMarketplace()
  await setStatusSyncLastRunDate(today)
  return result
}
