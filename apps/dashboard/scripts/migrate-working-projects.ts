import fs from 'node:fs'
import { prisma } from '@/lib/db'
import { parseDueDate, buildTitle } from '@/lib/working-projects/format'

const SHOPEE_ORDER_NO = /^\d{6}[A-Z0-9]{8,}$/
const TOKOPEDIA_ORDER_NO = /^INV\/|^\d{16,}$/

function derivePlatformFields(order: { order_no?: string; platform?: string }): {
  source: 'shopee' | 'tokopedia' | 'manual'
  sourceOrderNo: string | null
  orderNoLegacy: string | null
} {
  const platform = (order.platform ?? '').toLowerCase()
  const orderNo = order.order_no ?? ''
  if (platform === 'shopee' && SHOPEE_ORDER_NO.test(orderNo)) {
    return { source: 'shopee', sourceOrderNo: orderNo, orderNoLegacy: null }
  }
  if (platform === 'tokopedia' && TOKOPEDIA_ORDER_NO.test(orderNo)) {
    return { source: 'tokopedia', sourceOrderNo: orderNo, orderNoLegacy: null }
  }
  return { source: 'manual', sourceOrderNo: null, orderNoLegacy: orderNo || null }
}

export async function migrateWorkingProjects(
  exportPath: string
): Promise<{ imported: number; skipped: number; warnings: string[] }> {
  const { orders } = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
  const warnings: string[] = []
  let imported = 0
  let skipped = 0

  for (const order of orders) {
    if (!order.customer || !order.product) {
      warnings.push(`skipped order_no=${order.order_no}: missing customer/product`)
      skipped++
      continue
    }

    const { source, sourceOrderNo, orderNoLegacy } = derivePlatformFields(order)
    const { dueDate, dueDateRaw } = parseDueDate(order.due_date ?? '')
    let rawChecklist = order.checklist ?? []
    if (typeof rawChecklist === 'string') {
      try {
        rawChecklist = JSON.parse(rawChecklist || '[]')
      } catch {
        warnings.push(`order_no=${order.order_no}: unparseable checklist JSON, treated as empty`)
        rawChecklist = []
      }
    }
    if (!Array.isArray(rawChecklist)) rawChecklist = []
    const checklist = rawChecklist.map((item: any, idx: number) => ({
      id: item.id ?? idx + 1,
      text: item.text,
      done: !!item.done,
      done_at: item.done_at ?? null,
      done_by: item.done_by ?? null,
      added_by: item.added_by ?? null,
      added_at: item.added_at ?? new Date().toISOString(),
      deleted: !!item.deleted,
    }))

    await prisma.workingProject.create({
      data: {
        discordThreadId: order.thread_id ?? null,
        forumChannelId: null,
        source,
        sourceOrderNo,
        orderNoLegacy,
        customer: order.customer,
        contact: order.contact ?? null,
        platform: order.platform ?? null,
        product: order.product,
        variant: order.variant ?? null,
        title: buildTitle({ customer: order.customer, product: order.product, variant: order.variant }),
        status: order.status ?? 'Open',
        payment: order.payment ?? 'Belum',
        orderDate: order.order_date ? new Date(order.order_date) : null,
        dueDate,
        dueDateRaw,
        invoiceAmount: order.invoice_amount ?? 0,
        paidAmount: order.paid_amount ?? 0,
        notes: order.notes ?? null,
        shipping: order.shipping ?? null,
        trackingNo: order.tracking_no ?? null,
        checklist,
      },
    })
    imported++
  }

  return { imported, skipped, warnings }
}

if (require.main === module) {
  const exportPath = process.argv[2]
  if (!exportPath) {
    console.error('Usage: migrate-working-projects.ts <export.json>')
    process.exit(1)
  }
  migrateWorkingProjects(exportPath)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
