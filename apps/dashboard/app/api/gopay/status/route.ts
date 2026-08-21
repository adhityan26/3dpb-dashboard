import { auth } from "@/lib/auth"
import { assertGopayRole, gopayTokenStatus } from "@/lib/gopay/bridge"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!assertGopayRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const status = await gopayTokenStatus()
  return NextResponse.json(status)
}
