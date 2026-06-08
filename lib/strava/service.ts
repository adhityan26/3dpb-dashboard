// lib/strava/service.ts

import { prisma } from '@/lib/db'
import type { StravaOrder, StravaStatus, CreateStravaOrderInput } from './types'
import {
  createSanityStravaOrder,
  updateSanityStravaOrder,
} from './sanity-helpers'

/** Generate unique order ID: STR-YYYYMMDD-NNNN */
function generateOrderId(): string {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `STR-${date}-${random}`
}

export async function createStravaOrder(input: CreateStravaOrderInput): Promise<StravaOrder> {
  const orderId = generateOrderId()
  const now = new Date()

  // 1. Create in PostgreSQL
  const order = await prisma.stravaOrder.create({
    data: {
      orderId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      items: input.items as any,  // JSON field
      totalAmount: input.totalAmount,
      status: 'pending',
      submittedAt: now,
      resultPhotoKeys: [],
    },
  })

  // 2. Create in Sanity (approval gate)
  try {
    const sanityDoc = await createSanityStravaOrder({
      ...order,
      items: (Array.isArray(order.items) ? order.items : []) as any,
      submittedAt: new Date(order.submittedAt),
      createdAt: new Date(order.createdAt),
      updatedAt: new Date(order.updatedAt),
    } as StravaOrder)

    // 3. Link Sanity doc to PostgreSQL record
    const updated = await prisma.stravaOrder.update({
      where: { id: order.id },
      data: { sanityDocId: sanityDoc._id },
    })
    return {
      ...updated,
      items: (Array.isArray(updated.items) ? updated.items : []) as any,
      customerPhone: updated.customerPhone ?? undefined,
      submittedAt: new Date(updated.submittedAt),
      confirmedAt: updated.confirmedAt ? new Date(updated.confirmedAt) : undefined,
      completedAt: updated.completedAt ? new Date(updated.completedAt) : undefined,
      createdAt: new Date(updated.createdAt),
      updatedAt: new Date(updated.updatedAt),
    } as StravaOrder
  } catch (err) {
    // If Sanity creation fails, delete PostgreSQL record
    await prisma.stravaOrder.delete({ where: { id: order.id } })
    throw err
  }
}

export async function getStravaOrders(status?: StravaStatus): Promise<StravaOrder[]> {
  const orders = await prisma.stravaOrder.findMany({
    where: status ? { status } : undefined,
    orderBy: { submittedAt: 'desc' },
  })
  return orders.map(o => ({
    ...o,
    items: (Array.isArray(o.items) ? o.items : []) as any,
    submittedAt: new Date(o.submittedAt),
    confirmedAt: o.confirmedAt ? new Date(o.confirmedAt) : undefined,
    completedAt: o.completedAt ? new Date(o.completedAt) : undefined,
    createdAt: new Date(o.createdAt),
    updatedAt: new Date(o.updatedAt),
  })) as StravaOrder[]
}

export async function getStravaOrder(id: string): Promise<StravaOrder | null> {
  const order = await prisma.stravaOrder.findUnique({ where: { id } })
  if (!order) return null
  return {
    ...order,
    items: (Array.isArray(order.items) ? order.items : []) as any,
    submittedAt: new Date(order.submittedAt),
    confirmedAt: order.confirmedAt ? new Date(order.confirmedAt) : undefined,
    completedAt: order.completedAt ? new Date(order.completedAt) : undefined,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
  } as StravaOrder
}

export async function getStravaOrderByOrderId(orderId: string): Promise<StravaOrder | null> {
  return getStravaOrder((await prisma.stravaOrder.findUnique({ where: { orderId } }))?.id || '')
}

export async function updateStravaOrder(
  id: string,
  updates: Partial<StravaOrder>
): Promise<StravaOrder> {
  const updateData: Record<string, any> = {}

  if (updates.status) updateData.status = updates.status
  if (updates.operatorNotes !== undefined) updateData.operatorNotes = updates.operatorNotes
  if (updates.statusChangedAt) updateData.statusChangedAt = updates.statusChangedAt
  if (updates.confirmedAt) updateData.confirmedAt = updates.confirmedAt
  if (updates.completedAt) updateData.completedAt = updates.completedAt

  const updated = await prisma.stravaOrder.update({
    where: { id },
    data: updateData,
  })

  // Sync to Sanity if status changed
  if (updates.status && updated.sanityDocId) {
    await updateSanityStravaOrder(updated.sanityDocId, { status: updates.status })
  }

  return {
    ...updated,
    items: (Array.isArray(updated.items) ? updated.items : []) as any,
    customerPhone: updated.customerPhone ?? undefined,
    submittedAt: new Date(updated.submittedAt),
    confirmedAt: updated.confirmedAt ? new Date(updated.confirmedAt) : undefined,
    completedAt: updated.completedAt ? new Date(updated.completedAt) : undefined,
    createdAt: new Date(updated.createdAt),
    updatedAt: new Date(updated.updatedAt),
  } as StravaOrder
}

export async function confirmStravaOrder(id: string): Promise<StravaOrder> {
  const now = new Date()
  return updateStravaOrder(id, {
    status: 'confirmed',
    confirmedAt: now,
  })
}
