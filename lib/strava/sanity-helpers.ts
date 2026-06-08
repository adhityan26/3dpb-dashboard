// lib/strava/sanity-helpers.ts

import { sanity } from '@/lib/sanity/client'
import type { StravaOrder } from './types'

const STRAVA_ORDER_QUERY = `{
  _id,
  orderId,
  status,
  customerName,
  customerEmail,
  customerPhone,
  items,
  totalAmount,
  operatorNotes,
  submittedAt,
  confirmedAt,
  completedAt,
}`

export async function fetchPendingStravaOrders() {
  return sanity.fetch(
    `*[_type == "stravaOrder" && status == "submitted"] | order(submittedAt desc) ${STRAVA_ORDER_QUERY}`
  )
}

export async function fetchAllStravaOrders() {
  return sanity.fetch(
    `*[_type == "stravaOrder"] | order(submittedAt desc) ${STRAVA_ORDER_QUERY}`
  )
}

export async function countPendingStravaOrders(): Promise<number> {
  const docs = await fetchPendingStravaOrders()
  return docs.length
}

export async function createSanityStravaOrder(orderData: StravaOrder) {
  const doc = {
    _type: 'stravaOrder',
    orderId: orderData.orderId,
    status: 'submitted',
    customerName: orderData.customerName,
    customerEmail: orderData.customerEmail,
    customerPhone: orderData.customerPhone,
    items: orderData.items,
    totalAmount: orderData.totalAmount,
    submittedAt: orderData.submittedAt.toISOString(),
  }

  return sanity.create(doc)
}

export async function updateSanityStravaOrder(docId: string, updates: Partial<StravaOrder>) {
  const patch: Record<string, any> = {}

  if (updates.status) patch.status = updates.status
  if (updates.operatorNotes !== undefined) patch.operatorNotes = updates.operatorNotes
  if (updates.confirmedAt) patch.confirmedAt = updates.confirmedAt.toISOString()
  if (updates.completedAt) patch.completedAt = updates.completedAt.toISOString()

  return sanity.patch(docId).set(patch).commit()
}

export async function getStravaOrderBySanityId(sanityDocId: string) {
  return sanity.fetch(
    `*[_type == "stravaOrder" && _id == $id][0] ${STRAVA_ORDER_QUERY}`,
    { id: sanityDocId }
  )
}
