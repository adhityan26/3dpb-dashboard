import { auth } from "@/lib/auth"
import { fetchSanityPendingOrders } from "@/lib/light-generator/sanity-helpers"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Fetch Sanity orders with status "submitted"
  const sanityOrders = await fetchSanityPendingOrders()

  // Filter out orders already in local DB
  const localIds = await prisma.lightGeneratorOrder.findMany({
    where: { id: { in: sanityOrders.map((o) => o.orderId) } },
    select: { id: true },
  })
  const localIdSet = new Set(localIds.map((r) => r.id))
  const pending = sanityOrders.filter((o) => !localIdSet.has(o.orderId))

  return NextResponse.json(pending)
}
