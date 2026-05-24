import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import type { CmsCounts } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const counts = await sanityRead.fetch<CmsCounts>(Q.counts)
  return NextResponse.json(counts)
}
