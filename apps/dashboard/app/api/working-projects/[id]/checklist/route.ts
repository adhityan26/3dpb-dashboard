import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runChecklistOp } from '@/lib/working-projects/service'

const VALID_TYPES = ['add', 'check', 'uncheck', 'edit', 'remove', 'copy', 'setByLabel']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  const wp = await prisma.workingProject.findUnique({ where: { id } })
  if (!wp) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!wp.discordThreadId) {
    return NextResponse.json(
      { error: 'no_discord_thread', message: 'This project has not synced to a Discord thread yet' },
      { status: 409 },
    )
  }

  return NextResponse.json(await runChecklistOp(wp.discordThreadId, body))
}
