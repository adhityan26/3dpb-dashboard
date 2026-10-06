import { getReadyToShipOrders } from '@/lib/orders/service'
import { listOrders } from '@/lib/tokopedia/orders'
import { parseOrder } from '@/lib/tokopedia/parse'
import {
  createWorkingProjectsForOrder,
  getGLRingProductIds,
  getCategoryProductIds,
  getAutoCreateLastRunDate,
  setAutoCreateLastRunDate,
} from './service'
import { detectProductCategory, forumChannelIdForCategory, type CategoryProductIds } from './category'
import { expandOrderUnits, orderLinesFromShopee, orderLinesFromTokopedia, type OrderUnit } from './order-units'

interface OrderCandidate {
  source: 'shopee' | 'tokopedia'
  sourceOrderNo: string
  customer: string
  units: OrderUnit[]
  shipping?: string
  orderDateRaw?: string
  dueDateRaw?: string
}

// Unix-seconds timestamp -> "YYYY-MM-DD" for createWorkingProject's
// orderDateRaw/dueDateRaw inputs (parseOrderDate/parseDueDate in format.ts).
// Returns undefined (rather than throwing) for a missing/invalid timestamp
// so one bad order's date doesn't abort the whole batch it's mapped in.
function isoDate(unixSec: number | null | undefined): string | undefined {
  if (unixSec == null || !Number.isFinite(unixSec)) return undefined
  const d = new Date(unixSec * 1000)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}

export interface AutoCreateResult {
  scanned: number
  created: number
  skipped: number
  failed: number
  errors: string[]
}

// Tokopedia tabs that count as "belum dikirim" — same definition used
// elsewhere for the belum-dikirim KPI ([[project_working_projects_cutover]]
// memory): order_status 1 (menunggu pengiriman) and 2 (menunggu pengambilan).
const TOKOPEDIA_NEW_ORDER_TABS = ['perlu-dikirim', 'menunggu-pengambilan'] as const
const TOKOPEDIA_PAGE_SIZE = 50
// Pause between pages: back-to-back server-side Tokopedia requests got the account
// challenged with a captcha (2026-10-04), which then fails every call until solved by hand.
const TOKOPEDIA_PAGE_GAP_MS = 500
const TOKOPEDIA_SAFETY_MAX_PAGES = 40 // 2000 orders/tab hard cap, matches other pagination safety caps in this codebase

async function collectShopeeCandidates(errors: string[]): Promise<OrderCandidate[]> {
  try {
    const { orders } = await getReadyToShipOrders()
    // Pre-order only (found 2026-09-28: ready-stock accessories — Crocs
    // charms, Lightning Charm decorations, sandal add-ons — were getting a
    // WP too; those ship as-is and need no production tracking). Shopee's
    // own isPreOrder (days_to_ship >= 7, see lib/orders/service.ts) is the
    // signal, same field the Order tab already surfaces.
    return orders.filter((o) => o.isPreOrder).map((o) => ({
      source: 'shopee' as const,
      sourceOrderNo: o.orderSn,
      customer: o.buyerUsername ?? o.orderSn,
      // One unit per ordered piece (qty net of cancelled), keyed by Shopee line_item_id.
      units: expandOrderUnits(orderLinesFromShopee(o.items)),
      shipping: o.shippingCarrier ?? undefined,
      orderDateRaw: isoDate(o.createTime),
      dueDateRaw: isoDate(o.shipByDate),
    }))
  } catch (err) {
    errors.push(`shopee: gagal ambil order — ${(err as Error).message}`)
    return []
  }
}

async function collectTokopediaCandidates(errors: string[]): Promise<OrderCandidate[]> {
  const candidates: OrderCandidate[] = []
  for (const tab of TOKOPEDIA_NEW_ORDER_TABS) {
    try {
      let offset = 0
      for (let page = 0; page < TOKOPEDIA_SAFETY_MAX_PAGES; page++) {
        const raw = await listOrders(tab, { count: TOKOPEDIA_PAGE_SIZE, offset })
        const pageOrders = raw.main_orders ?? [] // an empty tab returns no main_orders at all
        for (const r of pageOrders) {
          const summary = parseOrder(r)
          if (!summary.orderId || !summary.isPreOrder) continue
          candidates.push({
            source: 'tokopedia',
            sourceOrderNo: summary.orderId,
            customer: summary.buyerNickname ?? summary.orderId,
            units: expandOrderUnits(orderLinesFromTokopedia(summary.products)),
            shipping: summary.courier ?? undefined,
            orderDateRaw: isoDate(summary.orderDate),
            dueDateRaw: isoDate(summary.latestRtsTime),
          })
        }
        if (pageOrders.length < TOKOPEDIA_PAGE_SIZE) break
        offset += TOKOPEDIA_PAGE_SIZE
        await new Promise((r) => setTimeout(r, TOKOPEDIA_PAGE_GAP_MS))
      }
    } catch (err) {
      errors.push(`tokopedia (${tab}): gagal ambil order — ${(err as Error).message}`)
    }
  }
  return candidates
}

/**
 * Scans Shopee + Tokopedia for orders that don't have a Working Project yet
 * and creates one for each, routed to the right Discord forum by product
 * category. Relies on createWorkingProjectsForOrder()'s own per-unit
 * dedupe guard rather than pre-filtering — safe to call repeatedly.
 */
export async function autoCreateWorkingProjectsFromNewOrders(): Promise<AutoCreateResult> {
  const errors: string[] = []
  const [cincinIds, topengIds, clickerIds, shopeeCandidates, tokopediaCandidates] = await Promise.all([
    getGLRingProductIds(),
    getCategoryProductIds('topeng'),
    getCategoryProductIds('clicker'),
    collectShopeeCandidates(errors),
    collectTokopediaCandidates(errors),
  ])
  const configuredProductIds: CategoryProductIds = { cincin: cincinIds, topeng: topengIds, clicker: clickerIds }
  const candidates = [...shopeeCandidates, ...tokopediaCandidates]

  const result: AutoCreateResult = { scanned: candidates.length, created: 0, skipped: 0, failed: 0, errors }

  for (const candidate of candidates) {
    // Every unit cancelled: nothing to produce.
    if (candidate.units.length === 0) {
      result.skipped++
      continue
    }
    try {
      const batch = await createWorkingProjectsForOrder({
        source: candidate.source,
        sourceOrderNo: candidate.sourceOrderNo,
        units: candidate.units,
        base: {
          // Was never passed here, so every auto-created WP (355 by 2026-10-04) had a
          // blank Platform column; the manual "Buat WP" path always set it.
          platform: candidate.source === 'shopee' ? 'Shopee' : 'Tokopedia',
          customer: candidate.customer,
          shipping: candidate.shipping,
          orderDateRaw: candidate.orderDateRaw,
          dueDateRaw: candidate.dueDateRaw,
          forumChannelIdFor: (u) =>
            forumChannelIdForCategory(
              detectProductCategory({ product: u.productName, sourceProductId: u.productId ?? undefined, configuredProductIds }),
            ),
        },
      })
      result.created += batch.created
      result.skipped += batch.skipped
    } catch (err) {
      result.failed++
      errors.push(`${candidate.source}:${candidate.sourceOrderNo}: ${(err as Error).message}`)
    }
  }

  return result
}

// "YYYY-MM-DD" in Asia/Jakarta (WIB, UTC+7, no DST) for a given instant.
function wibDateString(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(instant)
}

function wibHour(instant: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(instant),
  )
}

/**
 * Runs the auto-create scan at most once per WIB calendar day, only once
 * the day has reached the 23:00 WIB cutoff — called from a periodic poller
 * (instrumentation.ts) that ticks far more often than once a day; this
 * decides on each tick whether today's run is actually due yet.
 * Returns `null` when not due (too early today, or already ran today).
 */
export async function runDailyAutoCreateIfDue(now: Date = new Date()): Promise<AutoCreateResult | null> {
  if (wibHour(now) < 23) return null

  const today = wibDateString(now)
  const lastRun = await getAutoCreateLastRunDate()
  if (lastRun === today) return null

  const result = await autoCreateWorkingProjectsFromNewOrders()
  await setAutoCreateLastRunDate(today)
  return result
}
