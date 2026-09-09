import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { markReminderSent } from '@/lib/working-projects/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { threadId } = await params
  const body = await req.json()
  if (typeof body.daysLeft !== 'number') {
    return NextResponse.json({ error: 'daysLeft must be a number' }, { status: 400 })
  }
  try {
    const result = await markReminderSent(threadId, body.daysLeft)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
}
