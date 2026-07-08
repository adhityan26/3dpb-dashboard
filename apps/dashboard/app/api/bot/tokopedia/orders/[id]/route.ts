import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getOrderById } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  try {
    const raw = await getOrderById(id)
    if (!raw) return NextResponse.json({ ok: false, error: "not_found" })
    return NextResponse.json({ ok: true, data: raw })
  } catch (err) {
    const error = err instanceof TokopediaError ? err.code : (err instanceof Error ? err.message : "error")
    return NextResponse.json({ ok: false, error })
  }
}
