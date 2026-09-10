import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { runChecklistOp } from '@/lib/working-projects/service'
import { prisma } from '@/lib/db'

const VALID_TYPES = ['add', 'check', 'uncheck', 'edit', 'remove', 'copy', 'setByLabel']

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { threadId } = await params
  const body = await req.json()
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  if (body.type === 'copy') {
    const source = await prisma.workingProject.findUnique({ where: { discordThreadId: body.fromThreadId }, select: { id: true } })
    if (!source) return NextResponse.json({ error: 'fromThreadId project not found' }, { status: 400 })
  }

  return NextResponse.json(await runChecklistOp(threadId, body))
}
