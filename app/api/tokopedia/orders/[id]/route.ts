import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrderById } from "@/lib/tokopedia/orders"
import { parseOrder } from "@/lib/tokopedia/parse"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  try {
    const raw = await getOrderById(id)
    if (!raw) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(parseOrder(raw))
  } catch (err) {
    if (err instanceof TokopediaError) return NextResponse.json({ error: err.code }, { status: 409 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 })
  }
}
