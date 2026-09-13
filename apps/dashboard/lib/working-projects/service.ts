import { prisma } from '@/lib/db'
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
    dueDate, dueDateRaw, notes: input.notes, mentions: input.mentions,
  })

  try {
    const { threadId, threadUrl } = await createRelayThread({
      parentId: input.forumChannelId, name: title, message,
      mentions: input.mentions ?? [], idempotencyKey: wp.id,
    })
    await prisma.workingProject.update({ where: { id: wp.id }, data: { discordThreadId: threadId, discordThreadUrl: threadUrl, syncState: 'ok' } })
    return { id: wp.id, threadUrl, syncState: 'ok' }
  } catch (err) {
    await prisma.workingProject.update({
      where: { id: wp.id }, data: { syncState: 'error', syncError: (err as Error).message },
    })
    return { id: wp.id, threadUrl: null, syncState: 'error' }
  }
}

// Rebuilds the Discord starter post body from the CURRENT persisted row.
// Every mutation below calls this so the visible thread message never drifts
// from the DB — status/payment/checklist changes previously sent an empty
// relay patch (still marking discordSynced:true) while the actual Discord
// message kept showing stale data.
function rebuildStarterContent(wp: {
  customer: string; contact: string | null; product: string; variant: string | null
  platform: string | null; sourceOrderNo: string | null; orderNoLegacy: string | null
  orderDate: Date | null; dueDate: Date | null; dueDateRaw: string | null
  status: string; payment: string; invoiceAmount: number; paidAmount: number
  shipping: string | null; trackingNo: string | null; mentions: string[]
  notes: string | null; checklist: unknown
}): string {
  return buildPostContent({
    ...wp,
    checklist: wp.checklist as Parameters<typeof buildPostContent>[0]['checklist'],
  })
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
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
  const updated = await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { status } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, {
    starterContent: starterMessageContent ?? rebuildStarterContent(updated),
  })
  return { ok: true, discordSynced }
}

export async function markDone(threadId: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
  const updated = await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { status: 'Done' } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, { starterContent: rebuildStarterContent(updated) })
  await archiveRelayThread(threadId).catch(() => {})
  return { ok: true, discordSynced }
}

export async function updateWorkingProject(threadId: string, patch: Partial<{
  dueDateRaw: string; paymentRaw: string; invoiceAmountRaw: string; paidAmountRaw: string
  notesAppend: string; variant: string; customer: string; product: string; shipping: string; trackingNo: string
}>): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
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

  // If any title-affecting field changed, rebuild the title too — otherwise
  // editing a customer/product/variant leaves the thread name stale even
  // though the DB row is up to date.
  let newTitle: string | undefined
  if (patch.customer !== undefined || patch.product !== undefined || patch.variant !== undefined) {
    newTitle = buildTitle({
      customer: (data.customer as string) ?? wp.customer,
      product: (data.product as string) ?? wp.product,
      variant: (data.variant as string) ?? wp.variant,
    })
    data.title = newTitle
  }

  const updated = await prisma.workingProject.update({ where: { discordThreadId: threadId }, data })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, {
    ...(newTitle ? { name: newTitle } : {}),
    starterContent: rebuildStarterContent(updated),
  })
  return { ok: true, discordSynced }
}

export async function updateMentions(threadId: string, mentions: string[]): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { mentions } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, { mentions })
  return { ok: true, discordSynced }
}

export async function resyncWorkingProject(id: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  if (!wp) throw new Error(`WorkingProject not found for id=${id}`)
  const discordSynced = await syncEditOrError(id, wp.discordThreadId, {
    name: wp.title, appliedTags: wp.appliedTags, mentions: wp.mentions,
  })
  return { ok: true, discordSynced }
}

type ChecklistItem = { id: number; text: string; done: boolean; done_at: string | null; done_by: string | null; added_by: string | null; added_at: string; deleted: boolean }

function nextChecklistId(checklist: ChecklistItem[]): number {
  return checklist.length ? Math.max(...checklist.map(i => i.id)) + 1 : 1
}

export async function runChecklistOp(threadId: string, op:
  | { type: 'add'; text: string; addedBy: string }
  | { type: 'check' | 'uncheck' | 'remove'; id: number; by: string }
  | { type: 'edit'; id: number; text: string }
  | { type: 'copy'; fromThreadId: string }
  | { type: 'setByLabel'; label: string; done: boolean; by: string }
): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
  const checklist: ChecklistItem[] = wp.checklist as ChecklistItem[]

  if (op.type === 'add') {
    checklist.push({ id: nextChecklistId(checklist), text: op.text, done: false, done_at: null, done_by: null, added_by: op.addedBy, added_at: new Date().toISOString(), deleted: false })
  } else if (op.type === 'check' || op.type === 'uncheck') {
    const item = checklist.find(i => i.id === op.id)
    if (item) { item.done = op.type === 'check'; item.done_at = op.type === 'check' ? new Date().toISOString() : null; item.done_by = op.type === 'check' ? op.by : null }
  } else if (op.type === 'remove') {
    const item = checklist.find(i => i.id === op.id)
    if (item) item.deleted = true
  } else if (op.type === 'edit') {
    const item = checklist.find(i => i.id === op.id)
    if (item) item.text = op.text
  } else if (op.type === 'copy') {
    const source = await prisma.workingProject.findUnique({ where: { discordThreadId: op.fromThreadId } })
    if (!source) throw new Error(`WorkingProject not found for discordThreadId=${op.fromThreadId}`)
    let nextId = nextChecklistId(checklist)
    for (const src of source.checklist as ChecklistItem[]) {
      if (src.deleted) continue
      checklist.push({ ...src, id: nextId++, done: false, done_at: null, done_by: null })
    }
  } else if (op.type === 'setByLabel') {
    // Match the same way the GL Ring tab's read side matches (case-insensitive
    // substring), so a legacy inconsistently-labeled item (e.g. "A — Print
    // Frame (resin)") that reads as matching a canonical label continues to
    // be the item that gets updated on write too — otherwise the strict-equality
    // write path below would create a second, duplicate canonical-labeled item.
    const lowerLabel = op.label.toLowerCase()
    const item = checklist.find(i => !i.deleted && i.text.toLowerCase().includes(lowerLabel))
    if (item) {
      item.done = op.done
      item.done_at = op.done ? new Date().toISOString() : null
      item.done_by = op.done ? op.by : null
    } else {
      checklist.push({
        id: nextChecklistId(checklist),
        text: op.label,
        done: op.done,
        done_at: op.done ? new Date().toISOString() : null,
        done_by: op.done ? op.by : null,
        added_by: op.by,
        added_at: new Date().toISOString(),
        deleted: false,
      })
    }
  }

  const updated = await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { checklist } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, { starterContent: rebuildStarterContent(updated) })
  return { ok: true, discordSynced }
}

const REMINDER_SETTINGS_KEY = 'workingProjects.reminderSettings'

export type ReminderSettings = { reminderDays: number[]; defaultMentions: string[] }

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { reminderDays: [3, 1], defaultMentions: [] }

export async function getReminderSettings(): Promise<ReminderSettings> {
  const row = await prisma.config.findUnique({ where: { key: REMINDER_SETTINGS_KEY } })
  if (!row?.value) return DEFAULT_REMINDER_SETTINGS
  try {
    return JSON.parse(row.value) as ReminderSettings
  } catch {
    return DEFAULT_REMINDER_SETTINGS
  }
}

export async function setReminderSettings(settings: ReminderSettings): Promise<void> {
  await prisma.config.upsert({
    where: { key: REMINDER_SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: REMINDER_SETTINGS_KEY, value: JSON.stringify(settings) },
  })
}

export async function getDueReminders() {
  const settings = await getReminderSettings()
  if (settings.reminderDays.length === 0) return []
  const maxDays = Math.max(...settings.reminderDays)
  const cutoff = new Date(Date.now() + maxDays * 86400000)
  const candidates = await prisma.workingProject.findMany({
    where: { dueDate: { not: null, lte: cutoff }, status: { notIn: ['Done', 'Canceled'] } },
  })
  return candidates.filter(wp => {
    if (!wp.dueDate) return false
    const daysLeft = Math.ceil((wp.dueDate.getTime() - Date.now()) / 86400000)
    return settings.reminderDays.includes(daysLeft) && !wp.remindersSent.includes(daysLeft)
  })
}

export async function markReminderSent(threadId: string, daysLeft: number): Promise<{ ok: true }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
  await prisma.workingProject.update({
    where: { discordThreadId: threadId },
    data: { remindersSent: Array.from(new Set([...wp.remindersSent, daysLeft])) },
  })
  return { ok: true }
}
