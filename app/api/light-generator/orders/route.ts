import { auth } from "@/lib/auth"
import { listLgOrders } from "@/lib/light-generator/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? undefined
  const limit = Number(searchParams.get("limit") ?? "100")
  const offset = Number(searchParams.get("offset") ?? "0")

  try {
    const result = await listLgOrders({ status, limit, offset })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
