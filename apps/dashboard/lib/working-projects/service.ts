import { prisma } from '@/lib/db'
import { buildTitle, buildPostContent, parseDueDate, parseOrderDate, parseAmount, appendNoteWithTimestamp, WORKING_PROJECT_STATUSES, WORKING_PROJECT_SOURCES } from './format'
import { createRelayThread, editRelayThread, archiveRelayThread, deleteRelayThread } from './discord-sync'

export async function createWorkingProject(input: {
  source: 'shopee' | 'tokopedia' | 'manual'
  sourceOrderNo?: string
  sourceProductId?: string
  orderNoLegacy?: string
  forumChannelId: string
  customer: string
  contact?: string
  platform?: string
  product: string
  variant?: string
  dueDateRaw?: string
  orderDateRaw?: string
  notes?: string
  invoiceAmountRaw?: string
  mentions?: string[]
}): Promise<{ id: string; threadUrl: string | null; syncState: string }> {
  const { dueDate, dueDateRaw } = input.dueDateRaw ? parseDueDate(input.dueDateRaw) : { dueDate: null, dueDateRaw: null }
  const orderDate = input.orderDateRaw ? parseOrderDate(input.orderDateRaw) : null
  const title = buildTitle({ customer: input.customer, product: input.product, variant: input.variant })

  const wp = await prisma.workingProject.create({
    data: {
      source: input.source,
      sourceOrderNo: input.sourceOrderNo ?? null,
      sourceProductId: input.sourceProductId ?? null,
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
      orderDate,
      notes: input.notes ?? null,
      invoiceAmount: input.invoiceAmountRaw ? parseAmount(input.invoiceAmountRaw) : 0,
      mentions: input.mentions ?? [],
    },
  })

  const message = buildPostContent({
    customer: input.customer, contact: input.contact, product: input.product, variant: input.variant,
    platform: input.platform, sourceOrderNo: input.sourceOrderNo, orderNoLegacy: input.orderNoLegacy,
    orderDate, dueDate, dueDateRaw, notes: input.notes, mentions: input.mentions,
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

// Permanently removes a WorkingProject row and (best-effort) its Discord
// thread — used for cleaning up genuine duplicates (e.g. two threads
// created for the same marketplace order). The DB row is deleted first: if
// the Discord delete fails (thread already gone, relay down), the WP row
// is still gone and doesn't linger as an orphaned duplicate in the
// dashboard/rekap — discordDeleted:false just means the Discord thread
// itself needs manual cleanup.
export async function deleteWorkingProject(threadId: string): Promise<{ ok: true; discordDeleted: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
  await prisma.workingProject.delete({ where: { id: wp.id } })
  let discordDeleted = true
  try {
    await deleteRelayThread(threadId)
  } catch {
    discordDeleted = false
  }
  return { ok: true, discordDeleted }
}

const UPDATE_PATCH_KEYS = new Set([
  'dueDateRaw', 'orderDateRaw', 'paymentRaw', 'invoiceAmountRaw', 'paidAmountRaw',
  'notesAppend', 'notes', 'variant', 'customer', 'product',
  'shipping', 'trackingNo', 'mentions', 'appliedTags',
  'status', 'platform', 'contact', 'source', 'quotationId',
])

// Validates the enum/string fields opened up for PATCH. Throws
// "invalid patch value: ..." — the routes map that to a 400, same as the
// "unknown patch field" guard, so a caller passing e.g. status:"done"
// (wrong case) gets told instead of silently writing a value every status
// filter/badge in the UI would then fail to recognize.
function assertValidPatchValues(patch: { status?: unknown; source?: unknown; platform?: unknown; contact?: unknown; quotationId?: unknown }): void {
  if (patch.status !== undefined && !(WORKING_PROJECT_STATUSES as readonly unknown[]).includes(patch.status)) {
    throw new Error(`updateWorkingProject: invalid patch value: status must be one of ${WORKING_PROJECT_STATUSES.join(', ')} (got ${JSON.stringify(patch.status)})`)
  }
  if (patch.source !== undefined && !(WORKING_PROJECT_SOURCES as readonly unknown[]).includes(patch.source)) {
    throw new Error(`updateWorkingProject: invalid patch value: source must be one of ${WORKING_PROJECT_SOURCES.join(', ')} (got ${JSON.stringify(patch.source)})`)
  }
  // null unlinks the invoice; otherwise it must be a non-empty id.
  if (patch.quotationId !== undefined && patch.quotationId !== null
    && (typeof patch.quotationId !== 'string' || !patch.quotationId.trim())) {
    throw new Error('updateWorkingProject: invalid patch value: quotationId must be a non-empty string or null')
  }
  for (const key of ['platform', 'contact'] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== 'string') {
      throw new Error(`updateWorkingProject: invalid patch value: ${key} must be a string`)
    }
  }
}

export async function updateWorkingProject(threadId: string, patch: Partial<{
  dueDateRaw: string; orderDateRaw: string; paymentRaw: string; invoiceAmountRaw: string; paidAmountRaw: string
  notesAppend: string; notes: string; variant: string; customer: string; product: string
  shipping: string; trackingNo: string; mentions: string[]; appliedTags: string[]
  status: string; platform: string; contact: string; source: string; quotationId: string | null
}>): Promise<{ ok: true; discordSynced: boolean }> {
  // A patch with only unrecognized keys (a typo'd field name, or a field
  // that doesn't exist on WorkingProject at all — e.g. the Discord bot's AI
  // assistant guessing at a field it was never told about) used to silently
  // no-op: `data` stayed empty, the Prisma update + Discord resync still
  // ran and reported {ok:true, discordSynced:true}, and the caller had no
  // way to tell nothing actually changed. Fail loud instead.
  const unknownKeys = Object.keys(patch).filter((k) => !UPDATE_PATCH_KEYS.has(k))
  if (unknownKeys.length > 0) {
    throw new Error(`updateWorkingProject: unknown patch field(s): ${unknownKeys.join(', ')}`)
  }
  assertValidPatchValues(patch)

  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) throw new Error(`WorkingProject not found for discordThreadId=${threadId}`)
  const data: Record<string, unknown> = {}
  if (patch.dueDateRaw !== undefined) Object.assign(data, parseDueDate(patch.dueDateRaw))
  if (patch.orderDateRaw !== undefined) data.orderDate = parseOrderDate(patch.orderDateRaw)
  if (patch.paymentRaw !== undefined) data.payment = patch.paymentRaw
  if (patch.invoiceAmountRaw !== undefined) data.invoiceAmount = parseAmount(patch.invoiceAmountRaw)
  if (patch.paidAmountRaw !== undefined) data.paidAmount = parseAmount(patch.paidAmountRaw)
  if (patch.notesAppend !== undefined) data.notes = appendNoteWithTimestamp(wp.notes, patch.notesAppend)
  // Direct notes replacement (dashboard's Notes & Checklist modal) — takes
  // precedence over notesAppend if both are somehow sent in the same patch.
  if (patch.notes !== undefined) data.notes = patch.notes
  if (patch.variant !== undefined) data.variant = patch.variant
  if (patch.customer !== undefined) data.customer = patch.customer
  if (patch.product !== undefined) data.product = patch.product
  if (patch.shipping !== undefined) data.shipping = patch.shipping
  if (patch.trackingNo !== undefined) data.trackingNo = patch.trackingNo
  if (patch.mentions !== undefined) data.mentions = patch.mentions
  if (patch.appliedTags !== undefined) data.appliedTags = patch.appliedTags
  // status behaves like setStatus(): DB + starter-post resync only. Unlike
  // markDone() it does NOT archive the Discord thread — use the /done
  // endpoint for that.
  if (patch.status !== undefined) data.status = patch.status
  if (patch.platform !== undefined) data.platform = patch.platform
  if (patch.contact !== undefined) data.contact = patch.contact
  if (patch.source !== undefined) data.source = patch.source
  if (patch.quotationId !== undefined) data.quotationId = patch.quotationId

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
    ...(patch.mentions !== undefined ? { mentions: patch.mentions } : {}),
    ...(patch.appliedTags !== undefined ? { appliedTags: patch.appliedTags } : {}),
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
    starterContent: rebuildStarterContent(wp),
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
  | { type: 'reorder'; orderedIds: number[] }
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
  } else if (op.type === 'reorder') {
    // Reorder by the given id sequence; any id not present in the checklist
    // (already deleted, or a stale client) is skipped, and any existing item
    // missing from orderedIds (e.g. added concurrently) is appended at the
    // end so a partial/stale reorder request never silently drops items.
    const byId = new Map(checklist.map(i => [i.id, i]))
    const reordered: ChecklistItem[] = []
    for (const id of op.orderedIds) {
      const item = byId.get(id)
      if (item) {
        reordered.push(item)
        byId.delete(id)
      }
    }
    reordered.push(...byId.values())
    checklist.length = 0
    checklist.push(...reordered)
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

const GL_RING_PRODUCT_IDS_KEY = 'workingProjects.glRingProductIds'

// Shopee `item_id`s (as strings) that identify a "Green Lantern Ring" style
// product. Product-ID matching is the reliable signal for GL Ring detection
// (a curated, explicit list) — the product-NAME regex in isGLRing() is only
// a fallback for rows created before this list existed or whose creation
// path doesn't yet capture sourceProductId (see create-from-order.ts).
export async function getGLRingProductIds(): Promise<string[]> {
  const row = await prisma.config.findUnique({ where: { key: GL_RING_PRODUCT_IDS_KEY } })
  if (!row?.value) return []
  try {
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export async function setGLRingProductIds(productIds: string[]): Promise<void> {
  await prisma.config.upsert({
    where: { key: GL_RING_PRODUCT_IDS_KEY },
    update: { value: JSON.stringify(productIds) },
    create: { key: GL_RING_PRODUCT_IDS_KEY, value: JSON.stringify(productIds) },
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
