import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getShopCategoryList, getShopCategoryItems } from "@/lib/shopee/shop-category"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const categories = await getShopCategoryList()
    const collections = []
    // Sequential to stay under Shopee rate limits.
    for (const category of categories) {
      const { total } = await getShopCategoryItems(category.shop_category_id)
      collections.push({
        collectionId: category.shop_category_id,
        name: category.name,
        itemCount: total,
      })
    }
    return NextResponse.json({ collections })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shopee API error" },
      { status: 502 },
    )
  }
}
