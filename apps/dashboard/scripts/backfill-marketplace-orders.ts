// Backfills MarketplaceOrder parents for legacy marketplace Working Projects,
// using WP data only (no marketplace or Discord calls). Idempotent.
// Dry-run by default; pass --apply to write.
import { prisma } from "@/lib/db"
import { planOrderBackfill } from "@/lib/working-projects/order-backfill"

const APPLY = process.argv.includes("--apply")
const BATCH = 200

async function main() {
  const wps = await prisma.workingProject.findMany({
    where: { source: { in: ["shopee", "tokopedia"] }, sourceOrderNo: { not: null } },
    select: { id: true, source: true, sourceOrderNo: true, orderId: true, quotationId: true },
  })
  const existing = await prisma.marketplaceOrder.findMany({
    select: { source: true, sourceOrderNo: true, quotationId: true },
  })
  const plan = planOrderBackfill(wps, existing)

  console.log(`New orders:        ${plan.newOrders.length}`)
  console.log(`WP links:          ${plan.links.length}`)
  console.log(`Quotation updates: ${plan.quotationUpdates.length}`)
  console.log(`Quotation conflicts: ${plan.quotationConflicts.length}`)
  for (const c of plan.quotationConflicts) {
    console.log(`  CONFLICT ${c.source} ${c.sourceOrderNo}: ${c.quotationIds.join(", ")}`)
  }
  console.log(`Skipped:           ${plan.skipped}`)

  if (!APPLY) {
    console.log("DRY-RUN — tidak ada yang ditulis")
    return
  }

  if (plan.newOrders.length) {
    await prisma.marketplaceOrder.createMany({ data: plan.newOrders, skipDuplicates: true })
  }

  // Resolve order ids, then link WPs grouped per order.
  const orders = await prisma.marketplaceOrder.findMany({ select: { id: true, source: true, sourceOrderNo: true } })
  const idByKey = new Map(orders.map((o) => [`${o.source}:${o.sourceOrderNo}`, o.id]))
  const wpsByOrder = new Map<string, string[]>()
  for (const l of plan.links) {
    const orderId = idByKey.get(`${l.source}:${l.sourceOrderNo}`)
    if (!orderId) continue
    const list = wpsByOrder.get(orderId) ?? []
    list.push(l.wpId)
    wpsByOrder.set(orderId, list)
  }
  let linked = 0
  const entries = [...wpsByOrder.entries()]
  for (let i = 0; i < entries.length; i += BATCH) {
    for (const [orderId, ids] of entries.slice(i, i + BATCH)) {
      const r = await prisma.workingProject.updateMany({ where: { id: { in: ids }, orderId: null }, data: { orderId } })
      linked += r.count
    }
  }

  let updated = 0
  for (const u of plan.quotationUpdates) {
    const orderId = idByKey.get(`${u.source}:${u.sourceOrderNo}`)
    if (!orderId) continue
    await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { quotationId: u.quotationId } })
    updated++
  }
  console.log(`Ditulis: ${plan.newOrders.length} order baru, ${linked} WP ditautkan, ${updated} quotation diperbarui`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
