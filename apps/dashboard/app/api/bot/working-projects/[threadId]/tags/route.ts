import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/db'
import { buildTitle } from '@/lib/working-projects/format'
import { editRelayThread } from '@/lib/working-projects/discord-sync'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { threadId } = await params
  const body = await req.json()
  if (!Array.isArray(body.appliedTags)) return NextResponse.json({ error: 'appliedTags array is required' }, { status: 400 })

  let wp
  try {
    wp = await prisma.workingProject.update({
      where: { discordThreadId: threadId },
      data: { appliedTags: body.appliedTags, forumChannelId: body.parentId ?? undefined },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    throw err
  }
  const newTitle = body.currentName ? buildTitle({ customer: wp.customer, product: wp.product, variant: wp.variant }) : undefined
  try {
    await editRelayThread(threadId, { appliedTags: body.appliedTags, ...(newTitle && newTitle !== body.currentName ? { name: newTitle } : {}) })
    return NextResponse.json({ ok: true, discordSynced: true })
  } catch {
    return NextResponse.json({ ok: true, discordSynced: false })
  }
}
