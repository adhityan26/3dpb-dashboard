import { prisma } from '@/lib/db'
import { getEscrowDetailBatch } from '@/lib/shopee/escrow'
import { listStatementOrders } from '@/lib/tokopedia/finance'
import { TokopediaError } from '@/lib/tokopedia/types'
import { INCOME_UNAVAILABLE, incomeFromShopeeEscrow, incomeFromTokopediaStatement, type IncomeFields } from './income'

// Fills salePrice/feesTotal/netIncome on the MarketplaceOrder of Done marketplace WPs from Shopee escrow and
// Tokopedia's settlement list. An order is picked up when it has no income yet, or its income
// is still an estimate and was last checked more than RECHECK_MS ago — so a freshly Done
// order is filled within one poller tick, a not-yet-released Tokopedia order is re-read twice
// a day until the money lands, and a settled one is never fetched again. The same query
// backfills the existing Done WPs; it is paced, not capped, because one request covers
// 50 Shopee orders / 100 Tokopedia orders. A Tokopedia order that is not in the settlement
// list at all is marked 'unavailable' and only looked for again after UNAVAILABLE_RECHECK_MS,
// so it can't make every tick walk the whole list.

const RECHECK_MS = 12 * 60 * 60 * 1000
const UNAVAILABLE_RECHECK_MS = 3 * 24 * 60 * 60 * 1000
const SHOPEE_BATCH = 50
const SHOPEE_GAP_MS = 1500
const TOKOPEDIA_PAGE_SIZE = 100
const TOKOPEDIA_PAGE_GAP_MS = 2000
const TOKOPEDIA_MAX_PAGES = 40
const FATAL_CODES = new Set(['VERIFICATION_REQUIRED', 'SESSION_INVALID', 'SESSION_MISSING', 'SESSION_EXPIRED'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface IncomeSyncResult {
  scanned: number
  updated: number
  notFound: number
  failed: number
  errors: string[]
  /** true when another run was already in progress, so nothing was done. */
  skipped?: boolean
}

export interface IncomeSyncOptions {
  now?: Date
  /** Pause between Tokopedia list pages; tests pass 0. */
  tokopediaPageGapMs?: number
}

let running = false

type Target = { id: string; source: string; sourceOrderNo: string | null }

async function save(id: string, fields: IncomeFields | null, now: Date, status?: string) {
  await prisma.marketplaceOrder.update({
    where: { id },
    data: { ...(fields ?? (status ? { incomeStatus: status } : {})), incomeSyncedAt: now },
  })
}

export async function syncWorkingProjectIncome(opts: IncomeSyncOptions = {}): Promise<IncomeSyncResult> {
  const now = opts.now ?? new Date()
  const result: IncomeSyncResult = { scanned: 0, updated: 0, notFound: 0, failed: 0, errors: [] }
  if (running) return { ...result, skipped: true }
  running = true
  try {
    const staleBefore = new Date(now.getTime() - RECHECK_MS)
    const unavailableStaleBefore = new Date(now.getTime() - UNAVAILABLE_RECHECK_MS)
    const targets: Target[] = await prisma.marketplaceOrder.findMany({
      where: {
        projects: { some: { status: 'Done' } },
        source: { in: ['shopee', 'tokopedia'] },
        sourceOrderNo: { not: null },
        OR: [
          { incomeStatus: null, OR: [{ incomeSyncedAt: null }, { incomeSyncedAt: { lt: staleBefore } }] },
          { incomeStatus: 'estimated', OR: [{ incomeSyncedAt: null }, { incomeSyncedAt: { lt: staleBefore } }] },
          { incomeStatus: INCOME_UNAVAILABLE, incomeSyncedAt: { lt: unavailableStaleBefore } },
        ],
      },
      select: { id: true, source: true, sourceOrderNo: true },
    })
    result.scanned = targets.length
    if (targets.length === 0) return result

    await syncShopee(targets.filter((t) => t.source === 'shopee'), now, result)
    await syncTokopedia(targets.filter((t) => t.source === 'tokopedia'), now, result, opts.tokopediaPageGapMs ?? TOKOPEDIA_PAGE_GAP_MS)
    return result
  } finally {
    running = false
  }
}

async function syncShopee(targets: Target[], now: Date, result: IncomeSyncResult) {
  for (let i = 0; i < targets.length; i += SHOPEE_BATCH) {
    if (i > 0) await sleep(SHOPEE_GAP_MS)
    const batch = targets.slice(i, i + SHOPEE_BATCH)
    let escrow: Awaited<ReturnType<typeof getEscrowDetailBatch>>
    try {
      escrow = await getEscrowDetailBatch(batch.map((t) => t.sourceOrderNo!))
    } catch (err) {
      result.failed += batch.length
      result.errors.push(`shopee batch: ${(err as Error).message}`)
      continue
    }
    for (const t of batch) {
      const fields = escrow.has(t.sourceOrderNo!) ? incomeFromShopeeEscrow(escrow.get(t.sourceOrderNo!)!) : null
      try {
        await save(t.id, fields, now)
        if (fields) result.updated++
        else result.notFound++
      } catch (err) {
        result.failed++
        result.errors.push(`shopee:${t.sourceOrderNo}: ${(err as Error).message}`)
      }
    }
  }
}

async function syncTokopedia(targets: Target[], now: Date, result: IncomeSyncResult, pageGapMs: number) {
  if (targets.length === 0) return
  // One MarketplaceOrder per order number, so no grouping is needed.
  const pending = new Map<string, Target>()
  for (const t of targets) pending.set(t.sourceOrderNo!, t)
  try {
    // Newest orders first; stop as soon as every target was seen.
    for (let page = 0; page < TOKOPEDIA_MAX_PAGES && pending.size > 0; page++) {
      if (page > 0 && pageGapMs > 0) await sleep(pageGapMs)
      const { orders, total } = await listStatementOrders({ from: page * TOKOPEDIA_PAGE_SIZE, size: TOKOPEDIA_PAGE_SIZE })
      for (const o of orders) {
        const t = pending.get(o.reference_id)
        if (!t) continue
        const fields = incomeFromTokopediaStatement(o)
        try {
          await save(t.id, fields, now, fields ? undefined : INCOME_UNAVAILABLE)
          if (fields) result.updated++
          else result.notFound++
        } catch (err) {
          result.failed++
          result.errors.push(`tokopedia:${o.reference_id}: ${(err as Error).message}`)
        }
        pending.delete(o.reference_id)
      }
      if (orders.length < TOKOPEDIA_PAGE_SIZE || (page + 1) * TOKOPEDIA_PAGE_SIZE >= total) break
    }
  } catch (err) {
    if (err instanceof TokopediaError && FATAL_CODES.has(err.code)) {
      result.errors.push(`tokopedia: dihentikan (${err.code}) — ${err.message}`)
      return // keep `pending` unmarked: retry on the next tick once the session is back
    }
    result.failed += pending.size
    result.errors.push(`tokopedia: ${(err as Error).message}`)
    return
  }
  // Not in the settlement list (cancelled / never settled, or deeper than the page cap):
  // remember we looked, and look again only after UNAVAILABLE_RECHECK_MS.
  for (const t of pending.values()) {
    try { await save(t.id, null, now, INCOME_UNAVAILABLE); result.notFound++ } catch { result.failed++ }
  }
}
