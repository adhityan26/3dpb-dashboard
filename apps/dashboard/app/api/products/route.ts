import { auth } from "@/lib/auth"
import { getProducts } from "@/lib/products/service"
import { NextResponse } from "next/server"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "TEST_USER"]

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await getProducts()

    // Redact HPP + margin for non-owner roles (financial data)
    if (session.user.role !== "OWNER") {
      const redacted = {
        ...result,
        products: result.products.map((p) => ({
          ...p,
          hpp: null,
          grossMargin30d: null,
          variants: p.variants.map((v) => ({ ...v, hpp: null })),
        })),
      }
      return NextResponse.json(redacted)
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("GET /api/products failed:", err)
    const notConnected =
      msg.includes("not authorized") || msg.includes("shop_id not found")
    return NextResponse.json(
      { error: msg, notConnected },
      { status: notConnected ? 503 : 500 },
    )
  }
}
