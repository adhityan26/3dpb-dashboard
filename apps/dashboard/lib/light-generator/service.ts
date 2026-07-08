import { prisma } from "@/lib/db"
import type { LgOrder } from "./types"
import { DEFAULT_LG_CONFIG } from "./types"

function serializeOrder(o: {
  id: string
  sanityDocId: string | null
  isInternal: boolean
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
  internal?: boolean
  limit?: number
  offset?: number
}): Promise<{ orders: LgOrder[]; total: number }> {
  // internal: true → only internal, false → only customer, undefined → all
  const where: { status?: string; isInternal?: boolean } = {}
  if (opts.internal !== undefined) where.isInternal = opts.internal
  if (opts.status) where.status = opts.status
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
    where: { isInternal: false, status: { in: ["submitted", "paid"] } },
  })
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0")
}

/**
 * Create a blank internal (operator-authored) order for experimentation.
 * No customer, no Sanity sync. Seeded with DEFAULT_LG_CONFIG and an empty
 * imagePath (set when the operator uploads a silhouette).
 */
export async function createInternalLgOrder(label?: string): Promise<LgOrder> {
  const now = new Date()
  const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`
  const prefix = `LG-INT-${ymd}-`
  const todayCount = await prisma.lightGeneratorOrder.count({
    where: { id: { startsWith: prefix } },
  })
  const id = `${prefix}${pad(todayCount + 1, 4)}`

  const row = await prisma.lightGeneratorOrder.create({
    data: {
      id,
      isInternal: true,
      sanityDocId: null,
      status: "submitted",
      customerName: label?.trim() || "Internal",
      customerContact: "-",
      configJson: JSON.stringify(DEFAULT_LG_CONFIG),
      imagePath: "",
    },
  })
  return serializeOrder(row)
}
