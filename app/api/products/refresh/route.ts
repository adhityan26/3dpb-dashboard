import { auth } from "@/lib/auth"
import { invalidateProductsCache, getProducts } from "@/lib/products/service"
import { NextResponse } from "next/server"

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  invalidateProductsCache()
  // Kick off fresh fetch in background, respond immediately
  getProducts().catch(() => {})

  return NextResponse.json({ ok: true })
}
