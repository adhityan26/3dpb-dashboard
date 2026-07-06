import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { listOrders } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tabParam = new URL(req.url).searchParams.get("tab")
  const tab = tabParam === "dikirim" || tabParam === "selesai" ? tabParam : "perlu-dikirim"
  try {
    const data = await listOrders(tab)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    const error = err instanceof TokopediaError ? err.code : (err instanceof Error ? err.message : "error")
    return NextResponse.json({ ok: false, error })
  }
}
