import { auth } from "@/lib/auth"
import { fetchAllSanityLgOrders } from "@/lib/light-generator/sanity-helpers"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import type { SanityLgOrderWithConfirmed } from "@/lib/light-generator/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sanityOrders = await fetchAllSanityLgOrders()
  if (sanityOrders.length === 0) return NextResponse.json([])

  const confirmed = await prisma.lightGeneratorOrder.findMany({
    where: { id: { in: sanityOrders.map((o) => o.orderId) } },
    select: { id: true },
  })
  const confirmedSet = new Set(confirmed.map((r: { id: string }) => r.id))

  const result: SanityLgOrderWithConfirmed[] = sanityOrders.map((o) => ({
    ...o,
    isConfirmed: confirmedSet.has(o.orderId),
  }))

  return NextResponse.json(result)
}
