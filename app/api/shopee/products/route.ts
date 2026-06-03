import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeAddItem } from "@/lib/shopee/create-product"
import { addShopeeLink } from "@/lib/katalog/service"
import type { ShopeeAddItemPayload } from "@/lib/shopee/types"

export interface ShopeeCreateProductInput {
  katalogId: string
  itemName: string
  description: string
  categoryId: number
  condition: "NEW" | "USED"
  imageIds: string[]
  weight: number
  packageLength?: number
  packageWidth?: number
  packageHeight?: number
  logistics: Array<{ logistic_id: number; enabled: boolean; is_free: boolean }>
  attributes: Array<{
    attribute_id: number
    value_id?: number
    value_text?: string
  }>
  // No variant
  price?: number
  stock?: number
  // With variant
  tierVariation?: { name: string; options: string[] }
  models?: Array<{ optionIndex: number; price: number; stock: number }>
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: ShopeeCreateProductInput = await req.json()

  // Validate required fields
  if (!body.katalogId?.trim()) return NextResponse.json({ error: "katalogId required" }, { status: 400 })
  if (!body.itemName?.trim()) return NextResponse.json({ error: "itemName required" }, { status: 400 })
  if (!body.categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 })
  if (!body.imageIds?.length) return NextResponse.json({ error: "at least 1 image required" }, { status: 400 })
  if (!body.weight || body.weight <= 0) return NextResponse.json({ error: "weight required" }, { status: 400 })
  if (!body.logistics?.length) return NextResponse.json({ error: "at least 1 logistic required" }, { status: 400 })

  const hasVariants = !!(body.tierVariation?.options?.length && body.models?.length)
  if (!hasVariants && (!body.price || body.price <= 0)) {
    return NextResponse.json({ error: "price required when no variants" }, { status: 400 })
  }
  if (!hasVariants && (!body.stock || body.stock <= 0)) {
    return NextResponse.json({ error: "stock required when no variants" }, { status: 400 })
  }

  // Build attribute_list
  const attribute_list = (body.attributes ?? [])
    .filter(a => a.value_id != null || a.value_text?.trim())
    .map(a => ({
      attribute_id: a.attribute_id,
      attribute_value_list: a.value_id != null
        ? [{ value_id: a.value_id }]
        : [{ original_value_name: a.value_text! }],
    }))

  // Build payload
  const payload: ShopeeAddItemPayload = {
    item_name: body.itemName.trim(),
    description: body.description?.trim() ?? "",
    category_id: body.categoryId,
    condition: body.condition,
    item_status: "UNLIST",
    image: { image_id_list: body.imageIds },
    weight: body.weight,
    logistic_info: body.logistics,
    ...(body.packageLength && body.packageWidth && body.packageHeight ? {
      package_length: body.packageLength,
      package_width: body.packageWidth,
      package_height: body.packageHeight,
    } : {}),
    ...(attribute_list.length ? { attribute_list } : {}),
    ...(!hasVariants ? {
      original_price: body.price,
      stock_info_v2: { seller_stock: [{ stock: body.stock! }] as [{ stock: number }] },
    } : {
      tier_variation: [{
        name: body.tierVariation!.name,
        option_list: body.tierVariation!.options.map(o => ({ option: o })),
      }],
      model: body.models!.map(m => ({
        tier_index: [m.optionIndex],
        original_price: m.price,
        stock_info_v2: { seller_stock: [{ stock: m.stock }] as [{ stock: number }] },
      })),
    }),
  }

  const result = await shopeeAddItem(payload)

  // Save to katalog shopeeLinks
  await addShopeeLink(body.katalogId, String(result.item_id), null)

  return NextResponse.json({
    item_id: result.item_id,
    shopeeEditUrl: `https://seller.shopee.co.id/portal/product/edit/${result.item_id}`,
  })
}
