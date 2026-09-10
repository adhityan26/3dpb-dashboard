import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q') ?? ''
  const projects = await prisma.workingProject.findMany({
    where: { status: { not: 'Canceled' }, title: { contains: q, mode: 'insensitive' } },
    select: { discordThreadId: true, title: true, checklist: true },
    take: 20,
  })
  return NextResponse.json(projects)
}
