// One-off backfill (2026-09-30): WP.shipping was only ever captured once,
// at auto-create time — Shopee/Tokopedia usually hadn't assigned a courier
// yet that early, so many WPs stayed permanently blank even after the real
// order got one. The daily status-sync job now backfills this going
// forward, but only for Open/Siap Kirim WPs; this script does a one-time
// catch-up for EVERY WP regardless of status (including Done/Canceled,
// which status-sync never revisits).
import { prisma } from "@/lib/db"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getOrderById } from "@/lib/tokopedia/orders"
import { parseOrder } from "@/lib/tokopedia/parse"
import { updateWorkingProject } from "@/lib/working-projects/service"

async function main() {
  const rows = await prisma.workingProject.findMany({
    where: { OR: [{ shipping: null }, { shipping: "" }], discordThreadId: { not: null } },
    select: { source: true, sourceOrderNo: true, discordThreadId: true },
  })

  const shopeeRows = rows.filter((r) => r.source === "shopee" && r.sourceOrderNo)
  const tokopediaRows = rows.filter((r) => r.source === "tokopedia" && r.sourceOrderNo)

  console.log(`total to backfill: ${rows.length} (shopee: ${shopeeRows.length}, tokopedia: ${tokopediaRows.length})`)

  let updated = 0
  let skippedNoData = 0
  let failed = 0

  const shopeeCarrierBySn = new Map<string, string>()
  const sns = shopeeRows.map((r) => r.sourceOrderNo!)
  for (let i = 0; i < sns.length; i += 50) {
    const batch = sns.slice(i, i + 50)
    try {
      const details = await getOrderDetail(batch)
      for (const d of details) if (d.shipping_carrier) shopeeCarrierBySn.set(d.order_sn, d.shipping_carrier)
    } catch (err) {
      console.error(`shopee batch ${i}: ${(err as Error).message}`)
    }
  }

  for (const r of shopeeRows) {
    const carrier = shopeeCarrierBySn.get(r.sourceOrderNo!)
    if (!carrier) { skippedNoData++; continue }
    try {
      await updateWorkingProject(r.discordThreadId!, { shipping: carrier })
      updated++
    } catch (err) {
      failed++
      console.error(`shopee:${r.sourceOrderNo}: ${(err as Error).message}`)
    }
  }

  for (const r of tokopediaRows) {
    let carrier: string | null = null
    try {
      const raw = await getOrderById(r.sourceOrderNo!)
      carrier = raw ? (parseOrder(raw).courier ?? null) : null
    } catch (err) {
      console.error(`tokopedia:${r.sourceOrderNo}: gagal ambil order — ${(err as Error).message}`)
    }
    if (!carrier) { skippedNoData++; continue }
    try {
      await updateWorkingProject(r.discordThreadId!, { shipping: carrier })
      updated++
    } catch (err) {
      failed++
      console.error(`tokopedia:${r.sourceOrderNo}: ${(err as Error).message}`)
    }
  }

  console.log(`updated: ${updated}  skippedNoData: ${skippedNoData}  failed: ${failed}`)
}

main().finally(() => prisma.$disconnect())
