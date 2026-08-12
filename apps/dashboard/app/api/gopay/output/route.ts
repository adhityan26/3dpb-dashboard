import { auth } from "@/lib/auth"
import { assertGopayRole, bridgeOutput } from "@/lib/gopay/bridge"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!assertGopayRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const result = await bridgeOutput()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("GET /api/gopay/output failed:", err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
