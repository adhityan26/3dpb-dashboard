import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { getReminderSettings, setReminderSettings } from '@/lib/working-projects/service'

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const settings = await getReminderSettings()
  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  await setReminderSettings(body)
  return NextResponse.json({ ok: true })
}
