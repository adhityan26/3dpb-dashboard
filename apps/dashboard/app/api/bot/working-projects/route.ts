import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { createWorkingProject } from '@/lib/working-projects/service'

export async function POST(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.source || !body.forumChannelId || !body.customer || !body.product) {
    return NextResponse.json({ error: 'source, forumChannelId, customer, product are required' }, { status: 400 })
  }

  const result = await createWorkingProject(body)
  return NextResponse.json(result, { status: 201 })
}
