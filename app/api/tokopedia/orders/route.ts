import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listOrders } from "@/lib/tokopedia/orders"
import { parseOrder } from "@/lib/tokopedia/parse"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tab = new URL(req.url).searchParams.get("tab") === "semua" ? "semua" : "perlu-dikirim"
  try {
    const data = await listOrders(tab)
    return NextResponse.json({ totalCount: data.total_count, orders: data.main_orders.map(parseOrder) })
  } catch (err) {
    if (err instanceof TokopediaError) return NextResponse.json({ error: err.code }, { status: 409 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 })
  }
}
