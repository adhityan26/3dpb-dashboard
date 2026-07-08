import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getTrackingNumber } from "@/lib/shopee/tracking"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sn: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { sn } = await params
  const trackingNumber = await getTrackingNumber(sn)
  return NextResponse.json({ trackingNumber })
}
