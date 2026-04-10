import { auth } from "@/lib/auth"
import {
  getAllSettings,
  updateNotificationConfig,
  updateAlertThresholds,
} from "@/lib/settings/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const settings = await getAllSettings()
    return NextResponse.json(settings)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { notification?: unknown; thresholds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    if (body.notification && typeof body.notification === "object") {
      const n = body.notification as Record<string, unknown>
      await updateNotificationConfig({
        telegramBotToken:
          typeof n.telegramBotToken === "string" || n.telegramBotToken === null
            ? (n.telegramBotToken as string | null)
            : undefined,
        telegramChatId:
          typeof n.telegramChatId === "string" || n.telegramChatId === null
            ? (n.telegramChatId as string | null)
            : undefined,
        pushoverUserKey:
          typeof n.pushoverUserKey === "string" || n.pushoverUserKey === null
            ? (n.pushoverUserKey as string | null)
            : undefined,
        pushoverAppToken:
          typeof n.pushoverAppToken === "string" ||
          n.pushoverAppToken === null
            ? (n.pushoverAppToken as string | null)
            : undefined,
      })
    }

    if (body.thresholds && typeof body.thresholds === "object") {
      const t = body.thresholds as Record<string, unknown>
      await updateAlertThresholds({
        stockMin: typeof t.stockMin === "number" ? t.stockMin : undefined,
        roasMin: typeof t.roasMin === "number" ? t.roasMin : undefined,
        orderPileupCount:
          typeof t.orderPileupCount === "number"
            ? t.orderPileupCount
            : undefined,
        orderPileupHours:
          typeof t.orderPileupHours === "number"
            ? t.orderPileupHours
            : undefined,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("PATCH /api/settings failed:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
