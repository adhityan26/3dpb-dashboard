import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { setStatus } from '@/lib/working-projects/service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { threadId } = await params
  const body = await req.json()
  if (!body.status) return NextResponse.json({ error: 'status is required' }, { status: 400 })
  const result = await setStatus(threadId, body.status, body.starterMessageContent)
  return NextResponse.json(result)
}
