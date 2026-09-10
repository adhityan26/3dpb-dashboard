import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { getDueReminders } from '@/lib/working-projects/service'

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const due = await getDueReminders()
  return NextResponse.json(due)
}
