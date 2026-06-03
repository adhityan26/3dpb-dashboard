import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeGetCategories } from "@/lib/shopee/create-product"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parentId = Number(req.nextUrl.searchParams.get("parent_category_id") ?? "0")
  if (isNaN(parentId)) return NextResponse.json({ error: "Invalid parent_category_id" }, { status: 400 })

  const categories = await shopeeGetCategories(parentId)
  return NextResponse.json(categories)
}
