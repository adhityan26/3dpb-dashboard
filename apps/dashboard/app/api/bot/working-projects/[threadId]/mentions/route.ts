import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { updateMentions } from '@/lib/working-projects/service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { threadId } = await params
  const body = await req.json()
  if (!Array.isArray(body.mentions)) return NextResponse.json({ error: 'mentions array is required' }, { status: 400 })
  return NextResponse.json(await updateMentions(threadId, body.mentions))
}
