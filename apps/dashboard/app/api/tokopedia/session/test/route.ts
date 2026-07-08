import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listOrders } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    await listOrders("perlu-dikirim", { count: 1 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const code = err instanceof TokopediaError ? err.code : "UNKNOWN"
    return NextResponse.json({ ok: false, error: code })
  }
}
