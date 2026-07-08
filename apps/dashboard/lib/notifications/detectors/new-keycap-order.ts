import { sanityRead } from '@/lib/sanity/client'
import type { AlertEvent } from '../types'

interface NewOrder {
  _id: string
  orderNumber: string
  customerName: string
  qty: number
  orientation: string
}

export async function detectNewKeycapOrder(): Promise<AlertEvent[]> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const orders = await sanityRead.fetch<NewOrder[]>(
    `*[_type == "keycapOrder" && status == "pending" && submittedAt > $since] {
      _id, orderNumber, customerName, qty, orientation
    }`,
    { since: tenMinutesAgo },
  )

  return orders.map((order) => ({
    kind: 'keycap_order' as const,
    severity: 'high' as const,
    alertKey: `keycap-order:${order._id}`,
    title: 'Pesanan Keycap Baru',
    body: `${order.orderNumber} — ${order.customerName}, ${order.qty} key (${order.orientation})`,
    dedupHours: 24,
  }))
}
