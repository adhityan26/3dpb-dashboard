import { auth } from "@/lib/auth"
import { assertGopayRole, bridgeInput } from "@/lib/gopay/bridge"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!assertGopayRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const value = body?.value
  if (typeof value !== "string" || !value.trim()) {
    return NextResponse.json({ error: "value wajib diisi" }, { status: 400 })
  }

  try {
    const result = await bridgeInput(value)
    return NextResponse.json(result, { status: result?.success ? 200 : 409 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("POST /api/gopay/input failed:", err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
