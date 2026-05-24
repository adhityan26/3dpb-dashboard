import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.stravaOrders)
  return NextResponse.json({ items })
}
