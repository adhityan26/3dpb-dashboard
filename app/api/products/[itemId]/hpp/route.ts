import { auth } from "@/lib/auth"
import { setProductHpp } from "@/lib/products/service"
import { NextRequest, NextResponse } from "next/server"

interface RouteContext {
  params: Promise<{ itemId: string }>
}

interface VariantOverride {
  variantId: string
  hpp: number | null
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // HPP is financial data — only OWNER can edit
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { itemId } = await ctx.params

  let body: {
    productHpp?: unknown
    variants?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const productHpp =
    body.productHpp === null
      ? null
      : typeof body.productHpp === "number"
        ? body.productHpp
        : undefined

  if (productHpp === undefined) {
    return NextResponse.json(
      { error: "productHpp must be number or null" },
      { status: 400 },
    )
  }

  const variantsRaw = body.variants
  if (!Array.isArray(variantsRaw)) {
    return NextResponse.json(
      { error: "variants must be array" },
      { status: 400 },
    )
  }

  const variants: VariantOverride[] = []
  for (const v of variantsRaw) {
    if (typeof v !== "object" || v === null) continue
    const vo = v as { variantId?: unknown; hpp?: unknown }
    if (typeof vo.variantId !== "string") continue
    if (vo.hpp !== null && typeof vo.hpp !== "number") continue
    variants.push({ variantId: vo.variantId, hpp: vo.hpp ?? null })
  }

  try {
    await setProductHpp(itemId, productHpp, variants)
    return NextResponse.json({ ok: true, productId: itemId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error(`PUT /api/products/${itemId}/hpp failed:`, err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
