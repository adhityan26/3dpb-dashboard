import { prisma } from "@/lib/db"
import type { LgOrder } from "./types"

function serializeOrder(o: {
  id: string
  sanityDocId: string | null
  status: string
  statusNote: string | null
  customerName: string
  customerContact: string
  notesCustomer: string | null
  configJson: string
  imagePath: string
  configJsonOperator: string | null
  stlPath: string | null
  notesOperator: string | null
  additionalImagePath: string | null
  createdAt: Date
  updatedAt: Date
}): LgOrder {
  return {
    ...o,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }
}

export async function listLgOrders(opts: {
  status?: string
  limit?: number
  offset?: number
}): Promise<{ orders: LgOrder[]; total: number }> {
  const where = opts.status ? { status: opts.status } : {}
  const [orders, total] = await Promise.all([
    prisma.lightGeneratorOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
    }),
    prisma.lightGeneratorOrder.count({ where }),
  ])
  return { orders: orders.map(serializeOrder), total }
}

export async function getLgOrder(id: string): Promise<LgOrder | null> {
  const o = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!o) return null
  return serializeOrder(o)
}

/** Count submitted + paid orders for the sidebar badge */
export async function countLgPendingOrders(): Promise<number> {
  return prisma.lightGeneratorOrder.count({
    where: { status: { in: ["submitted", "paid"] } },
  })
}
