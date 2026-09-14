import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runChecklistOp } from '@/lib/working-projects/service'

const VALID_TYPES = ['add', 'check', 'uncheck', 'edit', 'remove', 'copy', 'setByLabel', 'reorder']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(body.type as string)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }
  if (body.type === 'setByLabel') {
    if (typeof body.label !== 'string' || typeof body.done !== 'boolean') {
      return NextResponse.json({ error: 'label must be a string and done must be a boolean' }, { status: 400 })
    }
  }
  if (body.type === 'reorder') {
    if (!Array.isArray(body.orderedIds) || !body.orderedIds.every((id: unknown) => typeof id === 'number')) {
      return NextResponse.json({ error: 'orderedIds must be an array of numbers' }, { status: 400 })
    }
  }

  const wp = await prisma.workingProject.findUnique({ where: { id } })
  if (!wp) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!wp.discordThreadId) {
    return NextResponse.json(
      { error: 'no_discord_thread', message: 'This project has not synced to a Discord thread yet' },
      { status: 409 },
    )
  }

  return NextResponse.json(
    await runChecklistOp(wp.discordThreadId, body as Parameters<typeof runChecklistOp>[1]),
  )
}
