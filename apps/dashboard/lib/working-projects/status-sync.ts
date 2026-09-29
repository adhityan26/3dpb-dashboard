import { prisma } from '@/lib/db'
import { getOrderDetail } from '@/lib/shopee/orders'
import { getOrderById } from '@/lib/tokopedia/orders'
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
 */
export function classifyShopeeStatus(orderStatus: string): string | null {
  if (orderStatus === 'SHIPPED') return 'Waiting Customer'
  if (orderStatus === 'COMPLETED') return 'Done'
  if (orderStatus === 'CANCELLED') return 'Canceled'
  return null
}

/**
 * Same idea for Tokopedia's sku_display_status. 112 = "Paket sedang
 * disiapkan penjual dan akan diserahkan kepada ekspedisi" (label made,
 * NOT yet picked up) — decided 2026-09-29 this maps to "Siap Kirim", one
 * stage before "Waiting Customer" (120/121/130 = courier already has it).
 */
export function classifyTokopediaStatus(skuDisplayStatus: number | null | undefined): string | null {
  if (skuDisplayStatus === 112) return 'Siap Kirim'
  if (skuDisplayStatus === 120 || skuDisplayStatus === 121 || skuDisplayStatus === 130) return 'Waiting Customer'
  if (skuDisplayStatus === 140) return 'Done'
  return null
}

export interface StatusSyncResult {
  scanned: number
  updated: number
  skipped: number
  failed: number
  errors: string[]
}

/**
 * Scans every WP still marked "Open" and, where the actual Shopee/Tokopedia
 * order has moved on (shipped/completed/cancelled), updates the WP status
 * to match — via updateWorkingProject(), so the Discord thread's starter
 * post is edited in place (same path the bot's own PATCH uses; does not
 * archive the thread, matching setStatus()'s existing behavior).
 */
export async function syncWorkingProjectStatusFromMarketplace(): Promise<StatusSyncResult> {
  const errors: string[] = []
  const rows = await prisma.workingProject.findMany({
    where: { status: 'Open' },
    select: { source: true, sourceOrderNo: true, discordThreadId: true },
  })

  const result: StatusSyncResult = { scanned: rows.length, updated: 0, skipped: 0, failed: 0, errors }

  const shopeeRows = rows.filter((r) => r.source === 'shopee' && r.sourceOrderNo)
  const tokopediaRows = rows.filter((r) => r.source === 'tokopedia' && r.sourceOrderNo)

  const shopeeStatusBySn = new Map<string, string>()
  const sns = shopeeRows.map((r) => r.sourceOrderNo!)
  for (let i = 0; i < sns.length; i += 50) {
    const batch = sns.slice(i, i + 50)
    try {
      const details = await getOrderDetail(batch)
      for (const d of details) shopeeStatusBySn.set(d.order_sn, d.order_status)
    } catch (err) {
      errors.push(`shopee batch: gagal ambil order — ${(err as Error).message}`)
    }
  }

  for (const r of shopeeRows) {
    const actual = shopeeStatusBySn.get(r.sourceOrderNo!)
    const target = actual != null ? classifyShopeeStatus(actual) : null
    if (!target) { result.skipped++; continue }
    if (!r.discordThreadId) { result.skipped++; continue }
    try {
      await updateWorkingProject(r.discordThreadId, { status: target })
      result.updated++
    } catch (err) {
      result.failed++
      errors.push(`shopee:${r.sourceOrderNo}: ${(err as Error).message}`)
    }
  }

  for (const r of tokopediaRows) {
    let target: string | null = null
    try {
      const raw = (await getOrderById(r.sourceOrderNo!)) as { order_status_module?: { sku_display_status?: number }[] } | null
      const code = raw?.order_status_module?.[0]?.sku_display_status
      target = classifyTokopediaStatus(code)
    } catch (err) {
      result.skipped++
      errors.push(`tokopedia:${r.sourceOrderNo}: gagal ambil order — ${(err as Error).message}`)
      continue
    }
    if (!target) { result.skipped++; continue }
    if (!r.discordThreadId) { result.skipped++; continue }
    try {
      await updateWorkingProject(r.discordThreadId, { status: target })
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
