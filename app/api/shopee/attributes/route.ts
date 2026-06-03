import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeGetAttributes } from "@/lib/shopee/create-product"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const categoryId = Number(req.nextUrl.searchParams.get("category_id"))
  if (!categoryId || isNaN(categoryId)) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 })
  }

  const attributes = await shopeeGetAttributes(categoryId)
  return NextResponse.json(attributes)
}
