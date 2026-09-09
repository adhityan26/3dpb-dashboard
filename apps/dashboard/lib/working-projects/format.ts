export function buildTitle(wp: { customer: string; product: string; variant?: string | null }): string {
  const base = `${wp.customer} - ${wp.product}`
  return wp.variant ? `${base} (${wp.variant})` : base
}

export function parseDueDate(raw: string): { dueDate: Date | null; dueDateRaw: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { dueDate: null, dueDateRaw: null }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return { dueDate: parsed, dueDateRaw: null }
  }
  return { dueDate: null, dueDateRaw: trimmed }
}

export function buildPostContent(wp: {
  customer: string
  contact?: string | null
  product: string
  variant?: string | null
  platform?: string | null
  sourceOrderNo?: string | null
  orderNoLegacy?: string | null
  dueDate?: Date | null
  dueDateRaw?: string | null
  notes?: string | null
}): string {
  const lines = [
    `**Customer:** ${wp.customer}${wp.contact ? ` (${wp.contact})` : ''}`,
    `**Produk:** ${wp.product}${wp.variant ? ` — ${wp.variant}` : ''}`,
  ]
  if (wp.platform) lines.push(`**Platform:** ${wp.platform}`)
  const orderNo = wp.sourceOrderNo ?? wp.orderNoLegacy
  if (orderNo) lines.push(`**No. Order:** ${orderNo}`)
  const due = wp.dueDate ? wp.dueDate.toISOString().slice(0, 10) : wp.dueDateRaw
  if (due) lines.push(`**Due Date:** ${due}`)
  if (wp.notes) lines.push(`**Catatan:** ${wp.notes}`)
  return lines.join('\n')
}
