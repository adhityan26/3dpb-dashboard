import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/db'
import { updateWorkingProject } from '@/lib/working-projects/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { threadId } = await params
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(wp)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { threadId } = await params
  const body = await req.json()
  try {
    return NextResponse.json(await updateWorkingProject(threadId, body))
  } catch (err) {
    if (err instanceof Error && err.message.includes('unknown patch field')) {
      return NextResponse.json({ error: 'unknown_patch_field', message: err.message }, { status: 400 })
    }
    throw err
  }
}
