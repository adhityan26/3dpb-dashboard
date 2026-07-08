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

  // productHpp is optional:
  //   missing from body → don't touch (undefined)
  //   null → delete
  //   number → upsert
  let productHpp: number | null | undefined
  if (!("productHpp" in body)) {
    productHpp = undefined
  } else if (body.productHpp === null) {
    productHpp = null
  } else if (typeof body.productHpp === "number") {
    productHpp = body.productHpp
  } else {
    return NextResponse.json(
      { error: "productHpp must be number, null, or omitted" },
      { status: 400 },
    )
  }

  // variants is optional (default empty)
  const variantsRaw = body.variants ?? []
  if (!Array.isArray(variantsRaw)) {
    return NextResponse.json(
      { error: "variants must be array if provided" },
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

  // At least one of productHpp or variants must be specified
  if (productHpp === undefined && variants.length === 0) {
    return NextResponse.json(
      { error: "Must provide productHpp or at least one variant override" },
      { status: 400 },
    )
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
