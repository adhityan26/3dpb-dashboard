// Splits ACTIVE combined marketplace WPs into one WP per unit (see
// docs/superpowers/plans/2026-10-13-wp-per-item-stage3.md). Thin CLI: all decisions live in
// lib/working-projects/order-split-runner.ts, this file only wires the real dependencies.
//
//   (no flags)                  dry-run: report only, nothing is written
//   --apply                     create unit WPs/threads, then convert the legacy WP (default --limit 10)
//   --limit <n>                 at most n orders per apply run
//   --only <sourceOrderNo>      a single order
//   --snapshot-dir <dir>        default ./.split-snapshots (contains PII: never commit it)
//   --rollback <file>...        undo (dry-run unless --apply); --force-edited overrides edit protection
//
// Run INSIDE the production container, outside the poller window (about 22:30-02:00 WIB).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/db'
import { getOrderDetail } from '@/lib/shopee/orders'
import { getOrderById, listOrders, type TokopediaTab } from '@/lib/tokopedia/orders'
import { TokopediaError } from '@/lib/tokopedia/types'
import { parseOrder } from '@/lib/tokopedia/parse'
import {
  createWorkingProject, resyncWorkingProject, deleteWorkingProject, getGLRingProductIds, getCategoryProductIds,
} from '@/lib/working-projects/service'
import { detectProductCategory, forumChannelIdForCategory } from '@/lib/working-projects/category'
import { SPLITTABLE_STATUSES } from '@/lib/working-projects/order-split'
import { orderLinesFromShopee, orderLinesFromTokopedia } from '@/lib/working-projects/order-units'
import {
  runSplit, runRollback, type SplitDeps, type CandidateWp, type FetchedOrder, type SplitSnapshot,
} from '@/lib/working-projects/order-split-runner'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const SHOPEE_BATCH = 50
const SHOPEE_GAP_MS = 1500
const TOKOPEDIA_GAP_MS = 600
const TOKOPEDIA_PAGE_SIZE = 50
const TOKOPEDIA_MAX_PAGES = 15
const TOKOPEDIA_TABS: TokopediaTab[] = ['perlu-dikirim', 'menunggu-pengambilan', 'dikirim']
const TOKOPEDIA_FATAL_CODES = new Set(['VERIFICATION_REQUIRED', 'SESSION_INVALID', 'SESSION_MISSING', 'SESSION_EXPIRED'])

interface Args { apply: boolean; limit?: number; only?: string; snapshotDir: string; rollback: string[]; forceEdited: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, snapshotDir: './.split-snapshots', rollback: [], forceEdited: false }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--apply') a.apply = true
    else if (v === '--force-edited') a.forceEdited = true
    else if (v === '--limit') a.limit = Number(argv[++i])
    else if (v === '--only') a.only = argv[++i]
    else if (v === '--snapshot-dir') a.snapshotDir = argv[++i]
    else if (v === '--rollback') { while (argv[i + 1] && !argv[i + 1].startsWith('--')) a.rollback.push(argv[++i]) }
    else throw new Error(`unknown flag: ${v}`)
  }
  if (a.limit !== undefined && (!Number.isInteger(a.limit) || a.limit < 0)) throw new Error('--limit must be a non-negative integer')
  return a
}

// Prisma row -> JSON-safe CandidateWp (dates become ISO strings; every column is kept for the snapshot).
const toCandidate = (row: unknown): CandidateWp => JSON.parse(JSON.stringify(row)) as CandidateWp

async function fetchShopee(sns: string[], out: Map<string, FetchedOrder>) {
  for (let i = 0; i < sns.length; i += SHOPEE_BATCH) {
    if (i > 0) await sleep(SHOPEE_GAP_MS)
    const details = await getOrderDetail(sns.slice(i, i + SHOPEE_BATCH))
    for (const d of details) {
      const lines = orderLinesFromShopee(d.item_list.map((it) => ({
        lineItemId: it.line_item_id ?? null, itemId: it.item_id, modelId: it.model_id ?? null,
        productName: it.item_name, variantName: it.model_name ?? null, qty: it.model_quantity_purchased,
        cancelledQty: it.cancelled_qty ?? 0, unitPrice: it.model_discounted_price,
      })))
      out.set(`shopee:${d.order_sn}`, { lines })
    }
  }
}

async function fetchTokopedia(ids: string[], out: Map<string, FetchedOrder>) {
  const wanted = new Set(ids)
  const found = new Map<string, FetchedOrder>()
  const add = (raw: unknown) => {
    const s = parseOrder(raw as Parameters<typeof parseOrder>[0])
    if (s?.orderId && wanted.has(s.orderId)) found.set(s.orderId, { lines: orderLinesFromTokopedia(s.products), subTotal: s.subTotal })
  }
  try {
    for (const tab of TOKOPEDIA_TABS) {
      let offset = 0
      for (let page = 0; page < TOKOPEDIA_MAX_PAGES; page++) {
        const raw = await listOrders(tab, { count: TOKOPEDIA_PAGE_SIZE, offset })
        const orders = raw?.main_orders ?? []
        orders.forEach(add)
        if (orders.length < TOKOPEDIA_PAGE_SIZE) break
        offset += TOKOPEDIA_PAGE_SIZE
        await sleep(TOKOPEDIA_GAP_MS)
      }
      await sleep(TOKOPEDIA_GAP_MS)
    }
    // Orders missing from the tabs (e.g. cancelled): one lookup each, paced.
    for (const id of ids.filter((x) => !found.has(x))) {
      const raw = await getOrderById(id)
      if (raw) add(raw)
      await sleep(TOKOPEDIA_GAP_MS)
    }
  } catch (err) {
    if (err instanceof TokopediaError && TOKOPEDIA_FATAL_CODES.has(err.code)) {
      throw new Error(`Tokopedia aborted (${err.code}): solve the verification / log in again, then re-run. ${err.message}`)
    }
    throw err
  }
  for (const [id, v] of found) out.set(`tokopedia:${id}`, v)
}

async function buildDeps(snapshotDir: string): Promise<SplitDeps> {
  const [cincin, topeng, clicker] = await Promise.all([getGLRingProductIds(), getCategoryProductIds('topeng'), getCategoryProductIds('clicker')])
  const configuredProductIds = { cincin, topeng, clicker }
  let snapshotPath: string | null = null

  return {
    async loadCandidates() {
      const rows = await prisma.workingProject.findMany({
        where: { source: { in: ['shopee', 'tokopedia'] }, status: { in: [...SPLITTABLE_STATUSES] }, sourceItemKey: null, sourceOrderNo: { not: null } },
        orderBy: { createdAt: 'asc' },
      })
      const keyed = await prisma.workingProject.findMany({
        where: { source: { in: ['shopee', 'tokopedia'] }, sourceItemKey: { not: null }, sourceOrderNo: { not: null } },
        select: { source: true, sourceOrderNo: true, sourceItemKey: true },
      })
      const keyedByOrder = new Map<string, string[]>()
      for (const k of keyed) {
        const key = `${k.source}:${k.sourceOrderNo}`
        keyedByOrder.set(key, [...(keyedByOrder.get(key) ?? []), k.sourceItemKey as string])
      }
      return { legacy: rows.map(toCandidate), keyedByOrder }
    },
    async fetchLines(orders) {
      const out = new Map<string, FetchedOrder>()
      await fetchShopee(orders.filter((o) => o.source === 'shopee').map((o) => o.sourceOrderNo), out)
      const toko = orders.filter((o) => o.source === 'tokopedia').map((o) => o.sourceOrderNo)
      if (toko.length) await fetchTokopedia(toko, out)
      return out
    },
    forumForUnit: (u) => forumChannelIdForCategory(detectProductCategory({ product: u.productName, sourceProductId: u.productId ?? undefined, configuredProductIds })),
    async loadWp(id) {
      const row = await prisma.workingProject.findUnique({ where: { id } })
      return row ? toCandidate(row) : null
    },
    async createUnit(input) {
      const r = await createWorkingProject(input)
      const row = await prisma.workingProject.findUnique({ where: { id: r.id }, select: { discordThreadId: true, syncState: true } })
      return { id: r.id, threadId: row?.discordThreadId ?? null, syncState: row?.syncState ?? r.syncState, skipped: r.skipped }
    },
    async convertLegacy({ id, expectedStatus, expectedUpdatedAt, data }) {
      const r = await prisma.workingProject.updateMany({
        where: { id, sourceItemKey: null, status: expectedStatus, updatedAt: new Date(expectedUpdatedAt) },
        data: { ...data, checklist: data.checklist as unknown as object },
      })
      return r.count
    },
    resync: (id) => resyncWorkingProject(id),
    async writeSnapshot(snapshot) {
      if (!snapshotPath) {
        await mkdir(snapshotDir, { recursive: true })
        snapshotPath = path.join(snapshotDir, `split-${snapshot.createdAt.replace(/[:.]/g, '-')}.json`)
      }
      await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2))
      return snapshotPath
    },
    async deleteUnit(id, threadId) {
      if (threadId) await deleteWorkingProject(threadId)
      else await prisma.workingProject.delete({ where: { id } })
    },
    async restoreLegacy(wp) {
      await prisma.workingProject.update({
        where: { id: wp.id },
        data: {
          product: wp.product, variant: wp.variant, title: wp.title, notes: wp.notes,
          checklist: wp.checklist as unknown as object, forumChannelId: wp.forumChannelId,
          sourceItemKey: null, itemPrice: null, sourceProductId: wp.sourceProductId,
        },
      })
    },
    now: () => new Date(),
    sleep,
    log: (line) => console.log(line),
  }
}

function printReport(report: Awaited<ReturnType<typeof runSplit>>['report']) {
  console.log(`Orders scanned: ${report.scanned}`)
  console.log(`Orders to split: ${report.plannable.length}  (new threads: ${report.totalNewThreads})`)
  for (const p of report.plannable) console.log(`  ${p.key}: ${p.units} units, ${p.newThreads} new thread(s)`)
  for (const [reason, s] of Object.entries(report.skips)) {
    console.log(`SKIP ${reason}: ${s.count}`)
    for (const e of s.examples) {
      console.log(`    order ${e.order}${e.detail ? ` | detail: ${e.detail}` : ''}${e.notes ? ` | notes: ${e.notes}` : ''}`)
      if (e.checklist?.length) console.log(`      checklist: ${e.checklist.join('; ')}`)
    }
  }
  for (const w of report.warnings) console.log(`WARNING ${w}`)
  console.log(`Request budget: Shopee detail batches ${report.budget.shopeeBatches}; Tokopedia list ${report.budget.tokopediaListRequests}; lookups up to ${report.budget.tokopediaLookups}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const deps = await buildDeps(args.snapshotDir)

  if (args.rollback.length) {
    const snaps = await Promise.all(args.rollback.map(async (f) => JSON.parse(await readFile(f, 'utf8')) as SplitSnapshot))
    const r = await runRollback(deps, snaps, { apply: args.apply, forceEdited: args.forceEdited })
    console.log(`${args.apply ? 'Rolled back' : 'Would roll back'}: ${r.restored.length}`)
    r.restored.forEach((k) => console.log(`  ${k}`))
    r.refused.forEach((x) => console.log(`REFUSED ${x.key}: ${x.reason}${x.reason.startsWith('edited') ? ' (use --force-edited to override)' : ''}`))
    console.log('Cannot be restored:')
    r.notes.forEach((n) => console.log(`  - ${n}`))
    if (!args.apply) console.log('DRY-RUN: nothing was written')
    return
  }

  const limit = args.limit ?? (args.apply ? 10 : undefined)
  const { report, applied } = await runSplit(deps, { apply: args.apply, limit, only: args.only })
  printReport(report)
  if (!applied) { console.log('DRY-RUN: nothing was written'); return }
  console.log(`Snapshot: ${applied.snapshotPath}`)
  console.log(`Converted: ${applied.converted.length}  incomplete: ${applied.incomplete.length}  changed-since-snapshot: ${applied.changedSinceSnapshot.length}`)
  applied.incomplete.forEach((x) => console.log(`  INCOMPLETE ${x.key}: ${x.reason}`))
  applied.changedSinceSnapshot.forEach((k) => console.log(`  CHANGED-SINCE-SNAPSHOT ${k}`))
  applied.needsResync.forEach((k) => console.log(`  NEEDS-RESYNC ${k}`))
  if (applied.aborted) console.log('ABORTED after 3 consecutive Discord failures; fix the relay and re-run (the run completes what is missing).')
}

main().catch((err) => { console.error(err); process.exitCode = 1 }).finally(() => prisma.$disconnect())
