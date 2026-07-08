import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { fetchAllKeycapOrders } from "@/lib/keycap/sanity-helpers"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await fetchAllKeycapOrders()
  return NextResponse.json({ items })
}
