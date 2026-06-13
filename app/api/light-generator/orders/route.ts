import { auth } from "@/lib/auth"
import { listLgOrders, createInternalLgOrder } from "@/lib/light-generator/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? undefined
  const internal = searchParams.get("internal") === "true"
  const limit = Number(searchParams.get("limit") ?? "100")
  const offset = Number(searchParams.get("offset") ?? "0")

  try {
    const result = await listLgOrders({ status, internal, limit, offset })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let label: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.label === "string") label = body.label
  } catch {
    // empty/invalid body is fine — label stays undefined
  }

  try {
    const order = await createInternalLgOrder(label)
    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
