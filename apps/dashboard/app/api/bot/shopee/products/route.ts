import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getAllItems, getItemBaseInfoBatch, getModelList } from "@/lib/shopee/products"
import { getShopCategoryItems } from "@/lib/shopee/shop-category"
import type { ShopeeItemBaseInfo, ShopeeModel } from "@/lib/shopee/types"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 100

function parseLimit(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), MAX_LIMIT)
}

function parseOffset(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

function modelStock(model: ShopeeModel): number {
  const summary = model.stock_info_v2?.summary_info?.total_available_stock
  if (summary !== undefined) return summary
  const sellerStock = model.stock_info_v2?.seller_stock
  if (sellerStock) return sellerStock.reduce((sum, s) => sum + (s.stock ?? 0), 0)
  return 0
}

async function buildProduct(item: ShopeeItemBaseInfo) {
  if (item.has_model) {
    const { model } = await getModelList(item.item_id)
    const variants = model.map((m) => ({
      name: m.model_name ?? `Model ${m.model_id}`,
      price: m.price_info?.[0]?.current_price ?? 0,
      stock: modelStock(m),
    }))
    const prices = variants.map((v) => v.price)
    const priceMin = prices.length ? Math.min(...prices) : 0
    const priceMax = prices.length ? Math.max(...prices) : 0
    const stock = variants.reduce((sum, v) => sum + v.stock, 0)
    return {
      itemId: item.item_id,
      name: item.item_name,
      price: priceMin,
      priceMin,
      priceMax,
      stock,
      status: item.item_status,
      variants,
    }
  }

  const price = item.price_info?.[0]?.current_price ?? 0
  return {
    itemId: item.item_id,
    name: item.item_name,
    price,
    priceMin: price,
    priceMax: price,
    stock: item.stock_info_v2?.summary_info?.total_available_stock ?? 0,
    status: item.item_status,
    variants: [] as Array<{ name: string; price: number; stock: number }>,
  }
}

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const etalase = url.searchParams.get("etalase")
  const q = url.searchParams.get("q")?.trim() || null
  const limit = parseLimit(url.searchParams.get("limit"))
  const offset = parseOffset(url.searchParams.get("offset"))

  try {
    let itemIds: number[]
    if (etalase) {
      const { itemIds: ids } = await getShopCategoryItems(Number(etalase))
      itemIds = ids
    } else {
      const items = await getAllItems(["NORMAL", "UNLIST"])
      itemIds = items.map((i) => i.item_id)
    }

    const baseInfos = await getItemBaseInfoBatch(itemIds)
    const filtered = q
      ? baseInfos.filter((i) => i.item_name.toLowerCase().includes(q.toLowerCase()))
      : baseInfos

    const total = filtered.length
    const page = filtered.slice(offset, offset + limit)

    const products = []
    // Sequential to stay under Shopee rate limits.
    for (const item of page) {
      products.push(await buildProduct(item))
    }

    return NextResponse.json({
      products,
      total,
      hasMore: offset + limit < total,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shopee API error" },
      { status: 502 },
    )
  }
}
