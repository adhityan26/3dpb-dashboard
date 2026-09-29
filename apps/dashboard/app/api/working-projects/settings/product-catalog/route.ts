import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getAllItems, getItemBaseInfoBatch } from "@/lib/shopee/products"
import { getRecentTokopediaProductNames } from "@/lib/tokopedia/products"

export interface ProductCatalogEntry {
  name: string
  platform: "shopee" | "tokopedia"
}

/**
 * GET /api/working-projects/settings/product-catalog
 *
 * Combined Shopee + Tokopedia product-name list for the "Jadwal Kirim"
 * table-grouping picker (Settings > Working Project) — unlike
 * /shopee-products (which returns Shopee item IDs for the exact-product
 * category pickers), this only needs NAMES, since table groups match by
 * keyword substring against a product's name, not by ID.
 *
 * Tokopedia has no "list all products" API wired up in this codebase (only
 * order data) — its half of the list is derived from product names seen on
 * recent real orders instead (see lib/tokopedia/products.ts). Good enough
 * for picking known product names to group, not a full live catalog.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const products: ProductCatalogEntry[] = []

  try {
    const items = await getAllItems(["NORMAL", "UNLIST"])
    const baseInfos = await getItemBaseInfoBatch(items.map((i) => i.item_id))
    for (const i of baseInfos) products.push({ name: i.item_name, platform: "shopee" })
  } catch {
    // Shopee failure shouldn't hide the Tokopedia half of the catalog.
  }

  try {
    const names = await getRecentTokopediaProductNames()
    for (const name of names) products.push({ name, platform: "tokopedia" })
  } catch {
    // Same — Tokopedia failure shouldn't hide the Shopee half.
  }

  return NextResponse.json({ products })
}
