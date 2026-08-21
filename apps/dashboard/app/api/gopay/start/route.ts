import { auth } from "@/lib/auth"
import { assertGopayRole, bridgeStart } from "@/lib/gopay/bridge"
import { NextResponse } from "next/server"

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!assertGopayRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const result = await bridgeStart()
    return NextResponse.json(result, { status: result?.success ? 200 : 409 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("POST /api/gopay/start failed:", err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
