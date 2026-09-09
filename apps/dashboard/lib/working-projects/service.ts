import { prisma } from '@/lib/prisma'
import { buildTitle, buildPostContent, parseDueDate, parseAmount } from './format'
import { createRelayThread } from './discord-sync'

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
