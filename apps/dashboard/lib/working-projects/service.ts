import { prisma } from '@/lib/prisma'
import { buildTitle, buildPostContent, parseDueDate, parseAmount, appendNoteWithTimestamp } from './format'
import { createRelayThread, editRelayThread, archiveRelayThread } from './discord-sync'

export async function createWorkingProject(input: {
  source: 'shopee' | 'tokopedia' | 'manual'
  sourceOrderNo?: string
  orderNoLegacy?: string
  forumChannelId: string
  customer: string
  contact?: string
  platform?: string
  product: string
  variant?: string
  dueDateRaw?: string
  notes?: string
  invoiceAmountRaw?: string
  mentions?: string[]
}): Promise<{ id: string; threadUrl: string | null; syncState: string }> {
  const { dueDate, dueDateRaw } = input.dueDateRaw ? parseDueDate(input.dueDateRaw) : { dueDate: null, dueDateRaw: null }
  const title = buildTitle({ customer: input.customer, product: input.product, variant: input.variant })

  const wp = await prisma.workingProject.create({
    data: {
      source: input.source,
      sourceOrderNo: input.sourceOrderNo ?? null,
      orderNoLegacy: input.orderNoLegacy ?? null,
      syncState: 'pending',
      discordThreadId: null,
      forumChannelId: input.forumChannelId,
      customer: input.customer,
      contact: input.contact ?? null,
      platform: input.platform ?? null,
      product: input.product,
      variant: input.variant ?? null,
      title,
      dueDate,
      dueDateRaw,
      notes: input.notes ?? null,
      invoiceAmount: input.invoiceAmountRaw ? parseAmount(input.invoiceAmountRaw) : 0,
      mentions: input.mentions ?? [],
    },
  })

  const message = buildPostContent({
    customer: input.customer, contact: input.contact, product: input.product, variant: input.variant,
    platform: input.platform, sourceOrderNo: input.sourceOrderNo, orderNoLegacy: input.orderNoLegacy,
    dueDate, dueDateRaw, notes: input.notes,
  })

  try {
    const { threadId, threadUrl } = await createRelayThread({
      parentId: input.forumChannelId, name: title, message,
      mentions: input.mentions ?? [], idempotencyKey: wp.id,
    })
    await prisma.workingProject.update({ where: { id: wp.id }, data: { discordThreadId: threadId, syncState: 'ok' } })
    return { id: wp.id, threadUrl, syncState: 'ok' }
  } catch (err) {
    await prisma.workingProject.update({
      where: { id: wp.id }, data: { syncState: 'error', syncError: (err as Error).message },
    })
    return { id: wp.id, threadUrl: null, syncState: 'error' }
  }
}

async function syncEditOrError(id: string, threadId: string | null, patch: Parameters<typeof editRelayThread>[1]): Promise<boolean> {
  if (!threadId) return false
  try {
    await editRelayThread(threadId, patch)
    await prisma.workingProject.update({ where: { id }, data: { syncState: 'ok', syncError: null } })
    return true
  } catch (err) {
    await prisma.workingProject.update({ where: { id }, data: { syncState: 'error', syncError: (err as Error).message } })
    return false
  }
}

export async function setStatus(threadId: string, status: string, starterMessageContent?: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { status } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, starterMessageContent ? { starterContent: starterMessageContent } : {})
  return { ok: true, discordSynced }
}

export async function markDone(threadId: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { status: 'Done' } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, {})
  await archiveRelayThread(threadId).catch(() => {})
  return { ok: true, discordSynced }
}

export async function updateWorkingProject(threadId: string, patch: Partial<{
  dueDateRaw: string; paymentRaw: string; invoiceAmountRaw: string; paidAmountRaw: string
  notesAppend: string; variant: string; customer: string; product: string; shipping: string; trackingNo: string
}>): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  const data: Record<string, unknown> = {}
  if (patch.dueDateRaw !== undefined) Object.assign(data, parseDueDate(patch.dueDateRaw))
  if (patch.paymentRaw !== undefined) data.payment = patch.paymentRaw
  if (patch.invoiceAmountRaw !== undefined) data.invoiceAmount = parseAmount(patch.invoiceAmountRaw)
  if (patch.paidAmountRaw !== undefined) data.paidAmount = parseAmount(patch.paidAmountRaw)
  if (patch.notesAppend !== undefined) data.notes = appendNoteWithTimestamp(wp.notes, patch.notesAppend)
  if (patch.variant !== undefined) data.variant = patch.variant
  if (patch.customer !== undefined) data.customer = patch.customer
  if (patch.product !== undefined) data.product = patch.product
  if (patch.shipping !== undefined) data.shipping = patch.shipping
  if (patch.trackingNo !== undefined) data.trackingNo = patch.trackingNo

  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, {})
  return { ok: true, discordSynced }
}

export async function updateMentions(threadId: string, mentions: string[]): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { mentions } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, { mentions })
  return { ok: true, discordSynced }
}

export async function resyncWorkingProject(id: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  const discordSynced = await syncEditOrError(id, wp.discordThreadId, {
    name: wp.title, appliedTags: wp.appliedTags, mentions: wp.mentions,
  })
  return { ok: true, discordSynced }
}
