import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCategoryProductIds, setCategoryProductIds, type AutoRoutedCategory } from "@/lib/working-projects/service"

const VALID_CATEGORIES: readonly AutoRoutedCategory[] = ["topeng", "clicker"]

function parseCategory(raw: string): AutoRoutedCategory | null {
  return (VALID_CATEGORIES as readonly string[]).includes(raw) ? (raw as AutoRoutedCategory) : null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ category: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const category = parseCategory((await params).category)
  if (!category) return NextResponse.json({ error: "unknown_category" }, { status: 404 })

  const productIds = await getCategoryProductIds(category)
  return NextResponse.json({ productIds })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ category: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const category = parseCategory((await params).category)
  if (!category) return NextResponse.json({ error: "unknown_category" }, { status: 404 })

  const body = await req.json()
  if (!Array.isArray(body.productIds) || !body.productIds.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json({ error: "productIds must be an array of strings" }, { status: 400 })
  }

  await setCategoryProductIds(category, body.productIds)
  return NextResponse.json({ ok: true })
}
