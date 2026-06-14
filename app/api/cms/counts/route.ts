import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { countUnconfirmedSanityLgOrders } from "@/lib/light-generator/sanity-helpers"
import { countPendingKeycapOrders } from "@/lib/keycap/sanity-helpers"
import type { CmsCounts } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [sanityCounts, lgOrdersPending, keycapOrdersPending] = await Promise.all([
    sanityRead.fetch<Omit<CmsCounts, "lgOrdersPending" | "keycapOrdersPending">>(Q.counts),
    countUnconfirmedSanityLgOrders(),
    countPendingKeycapOrders(),
  ])

  const counts: CmsCounts = { ...sanityCounts, lgOrdersPending, keycapOrdersPending }
  return NextResponse.json(counts)
}
