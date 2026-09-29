import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getAllItems, getItemBaseInfoBatch } from "@/lib/shopee/products"

/**
 * GET /api/working-projects/settings/shopee-products
 *
 * Lightweight product list (just id + name, no variants/stock — unlike the
 * bot's /api/bot/shopee/products, which does one getModelList call per item
 * and is too slow for a live-typing autocomplete) for the category
 * product-ID pickers in Settings > Working Project, so Kak can search by
 * product name instead of copying Shopee item IDs out of a URL by hand.
 * The whole catalog is returned in one call; the client caches and filters
 * it locally rather than re-fetching per keystroke.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const items = await getAllItems(["NORMAL", "UNLIST"])
    const baseInfos = await getItemBaseInfoBatch(items.map((i) => i.item_id))
    const products = baseInfos.map((i) => ({ itemId: String(i.item_id), name: i.item_name }))
    return NextResponse.json({ products })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Shopee API error" }, { status: 502 })
  }
}
