import { auth } from "@/lib/auth"
import { getProductsPage } from "@/lib/products/service"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "TEST_USER"]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")))
  const q = searchParams.get("q") ?? ""
  const status = searchParams.get("status") ?? ""

  try {
    const result = await getProductsPage({ page, limit, q, status })

    // Redact HPP + margin for non-owner roles
    if (session.user.role !== "OWNER") {
      return NextResponse.json({
        ...result,
        products: result.products.map((p) => ({
          ...p,
          hpp: null,
          grossMargin30d: null,
          variants: p.variants.map((v) => ({ ...v, hpp: null })),
        })),
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("GET /api/products/page failed:", err)
    const notConnected =
      msg.includes("not authorized") || msg.includes("shop_id not found")
    return NextResponse.json(
      { error: msg, notConnected },
      { status: notConnected ? 503 : 500 },
    )
  }
}
