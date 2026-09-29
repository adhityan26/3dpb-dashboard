import { getReadyToShipOrders } from '@/lib/orders/service'
import { listOrders } from '@/lib/tokopedia/orders'
import { parseOrder } from '@/lib/tokopedia/parse'
import {
  createWorkingProject,
  getGLRingProductIds,
  getCategoryProductIds,
  getAutoCreateLastRunDate,
  setAutoCreateLastRunDate,
} from './service'
import { detectProductCategory, forumChannelIdForCategory, type CategoryProductIds } from './category'
import { buildMultiItemProduct } from './format'

interface OrderCandidate {
  source: 'shopee' | 'tokopedia'
  sourceOrderNo: string
  sourceProductId?: string
  customer: string
  product: string
  variant?: string
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
const TOKOPEDIA_SAFETY_MAX_PAGES = 40 // 2000 orders/tab hard cap, matches other pagination safety caps in this codebase

async function collectShopeeCandidates(errors: string[]): Promise<OrderCandidate[]> {
  try {
    const { orders } = await getReadyToShipOrders()
    // Pre-order only (found 2026-09-28: ready-stock accessories — Crocs
    // charms, Lightning Charm decorations, sandal add-ons — were getting a
    // WP too; those ship as-is and need no production tracking). Shopee's
    // own isPreOrder (days_to_ship >= 7, see lib/orders/service.ts) is the
    // signal, same field the Order tab already surfaces.
    return orders.filter((o) => o.isPreOrder).map((o) => {
      const first = o.items[0]
      // Every item on the order becomes part of `product` (see
      // buildMultiItemProduct) — a single-item order's product/variant
      // fields stay exactly as before; a multi-item order (including two
      // line items for the SAME product at different sizes) now keeps all
      // of them instead of silently dropping everything but items[0].
      return {
        source: 'shopee' as const,
        sourceOrderNo: o.orderSn,
        // Only the first item's id feeds the curated product-ID category
        // list — a secondary signal behind the product-name regex, which
        // runs against the full multi-item `product` string below and so
        // still finds a ring/topeng/clicker match anywhere in the order.
        sourceProductId: first?.itemId != null ? String(first.itemId) : undefined,
        customer: o.buyerUsername ?? o.orderSn,
        product: buildMultiItemProduct(o.items.map(it => ({ name: it.productName, variant: it.variantName }))),
        variant: o.items.length <= 1 ? (first?.variantName ?? undefined) : undefined,
        shipping: o.shippingCarrier ?? undefined,
        orderDateRaw: isoDate(o.createTime),
        dueDateRaw: isoDate(o.shipByDate),
      }
    })
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
        for (const r of raw.main_orders) {
          const summary = parseOrder(r)
          if (!summary.orderId || !summary.isPreOrder) continue
          const first = summary.products[0]
          candidates.push({
            source: 'tokopedia',
            sourceOrderNo: summary.orderId,
            customer: summary.buyerNickname ?? summary.orderId,
            product: buildMultiItemProduct(summary.products.map(p => ({ name: p.name, variant: p.variant }))),
            variant: summary.products.length <= 1 ? (first?.variant || undefined) : undefined,
            shipping: summary.courier ?? undefined,
            orderDateRaw: isoDate(summary.orderDate),
            dueDateRaw: isoDate(summary.latestRtsTime),
          })
        }
        if (raw.main_orders.length < TOKOPEDIA_PAGE_SIZE) break
        offset += TOKOPEDIA_PAGE_SIZE
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
 * category. Relies on createWorkingProject()'s own (source, sourceOrderNo)
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
    const category = detectProductCategory({
      product: candidate.product,
      sourceProductId: candidate.sourceProductId,
      configuredProductIds,
    })
    try {
      const created = await createWorkingProject({
        source: candidate.source,
        sourceOrderNo: candidate.sourceOrderNo,
        sourceProductId: candidate.sourceProductId,
        forumChannelId: forumChannelIdForCategory(category),
        customer: candidate.customer,
        product: candidate.product,
        variant: candidate.variant,
        shipping: candidate.shipping,
        orderDateRaw: candidate.orderDateRaw,
        dueDateRaw: candidate.dueDateRaw,
      })
      if (created.skipped) result.skipped++
      else result.created++
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
