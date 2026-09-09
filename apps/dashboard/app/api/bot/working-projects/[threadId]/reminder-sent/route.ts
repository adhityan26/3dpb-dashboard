import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { markReminderSent } from '@/lib/working-projects/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { threadId } = await params
  const body = await req.json()
  const result = await markReminderSent(threadId, body.daysLeft)
  return NextResponse.json(result)
}
