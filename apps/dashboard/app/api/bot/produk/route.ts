import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getProductsPage } from "@/lib/products/service"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const q = new URL(req.url).searchParams.get("q") ?? ""
  const page = await getProductsPage({ page: 1, limit: 5, q, status: "all" })
  return NextResponse.json({
    total: page.total,
    products: page.products.map(p => ({
      name: p.name,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      hpp: p.hpp,
      margin: p.grossMargin30d,
      stock: p.stockTotal,
    })),
  })
}
