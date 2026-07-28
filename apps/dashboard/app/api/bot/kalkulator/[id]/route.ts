import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getKalkulasiForBot } from "@/lib/kalkulator/bot-view"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await ctx.params
  const detail = await getKalkulasiForBot(id)
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(detail)
}
