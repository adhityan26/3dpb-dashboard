import { prisma } from "@/lib/db"
import { getProducts } from "@/lib/products/service"
import type { AlertEvent } from "../types"

const DANGER_STATUSES = new Set(["BANNED", "DELETED"])

/**
 * Detect products whose status changed from NORMAL to BANNED/DELETED since
 * the last snapshot. Updates snapshot table in the same pass.
 */
export async function detectProductDelist(): Promise<AlertEvent[]> {
  const result = await getProducts()
  const snapshots = await prisma.productStatusSnapshot.findMany()
  const snapshotMap = new Map(snapshots.map((s) => [s.productId, s.status]))

  const events: AlertEvent[] = []
  const upserts: Array<Promise<unknown>> = []

  for (const product of result.products) {
    const prevStatus = snapshotMap.get(product.productId)
    const currStatus = product.status

    if (prevStatus === undefined) {
      // First seen — just snapshot, no alert
      upserts.push(
        prisma.productStatusSnapshot.create({
          data: { productId: product.productId, status: currStatus },
        }),
      )
      continue
    }

    if (prevStatus !== currStatus) {
      upserts.push(
        prisma.productStatusSnapshot.update({
          where: { productId: product.productId },
          data: { status: currStatus },
        }),
      )

      if (prevStatus === "NORMAL" && DANGER_STATUSES.has(currStatus)) {
        events.push({
          kind: "product_delist",
          severity: "critical",
          alertKey: `product_delist:${product.productId}:${currStatus}`,
          title: "Produk Ter-delist!",
          body: `${product.name} status berubah dari NORMAL → ${currStatus}. Cek di Shopee Seller Center.`,
        })
      }
    }
  }

  await Promise.all(upserts)
  return events
}
