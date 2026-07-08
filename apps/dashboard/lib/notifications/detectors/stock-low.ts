import { getProducts } from "@/lib/products/service"
import { getAlertThresholds } from "@/lib/settings/service"
import type { AlertEvent } from "../types"

export async function detectStockLow(): Promise<AlertEvent[]> {
  const thresholds = await getAlertThresholds()
  const result = await getProducts()

  const events: AlertEvent[] = []

  for (const product of result.products) {
    if (product.status !== "NORMAL") continue

    if (product.hasVariants) {
      for (const variant of product.variants) {
        if (variant.stock < thresholds.stockMin) {
          events.push({
            kind: "stock_low",
            severity: "warning",
            alertKey: `stock_low:${product.productId}:${variant.variantId}`,
            title: "Stok Hampir Habis",
            body: `${product.name} — varian "${variant.variantName}" tinggal ${variant.stock} pcs (threshold: ${thresholds.stockMin})`,
          })
        }
      }
    } else {
      if (product.stockTotal < thresholds.stockMin) {
        events.push({
          kind: "stock_low",
          severity: "warning",
          alertKey: `stock_low:${product.productId}`,
          title: "Stok Hampir Habis",
          body: `${product.name} tinggal ${product.stockTotal} pcs (threshold: ${thresholds.stockMin})`,
        })
      }
    }
  }

  return events
}
