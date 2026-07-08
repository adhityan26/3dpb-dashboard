import { auth } from "@/lib/auth"
import { getModelList } from "@/lib/shopee/products"
import { NextResponse } from "next/server"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { itemId } = await params

  try {
    const res = await getModelList(Number(itemId))
    const variants = (res.model ?? []).map((m) => ({
      modelId: String(m.model_id),
      name: m.model_name ?? `Model ${m.model_id}`,
      price: m.price_info?.[0]?.current_price ?? 0,
      stock: m.stock_info_v2?.summary_info?.total_available_stock ?? 0,
    }))
    return NextResponse.json({ variants })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
