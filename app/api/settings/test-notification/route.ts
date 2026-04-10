import { auth } from "@/lib/auth"
import { sendTestTelegram, sendTestPushover } from "@/lib/settings/service"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    channel?: unknown
    telegramBotToken?: unknown
    telegramChatId?: unknown
    pushoverUserKey?: unknown
    pushoverAppToken?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (body.channel === "telegram") {
    if (
      typeof body.telegramBotToken !== "string" ||
      typeof body.telegramChatId !== "string"
    ) {
      return NextResponse.json(
        { error: "telegramBotToken and telegramChatId are required" },
        { status: 400 },
      )
    }
    const result = await sendTestTelegram(
      body.telegramBotToken,
      body.telegramChatId,
    )
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  if (body.channel === "pushover") {
    if (
      typeof body.pushoverUserKey !== "string" ||
      typeof body.pushoverAppToken !== "string"
    ) {
      return NextResponse.json(
        { error: "pushoverUserKey and pushoverAppToken are required" },
        { status: 400 },
      )
    }
    const result = await sendTestPushover(
      body.pushoverUserKey,
      body.pushoverAppToken,
    )
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  return NextResponse.json(
    { error: "channel must be 'telegram' or 'pushover'" },
    { status: 400 },
  )
}
