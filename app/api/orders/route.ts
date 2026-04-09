import { auth } from "@/lib/auth"
import { getReadyToShipOrders } from "@/lib/orders/service"
import { NextResponse } from "next/server"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "TEST_USER"]

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await getReadyToShipOrders()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("GET /api/orders failed:", err)
    const notConnected = msg.includes("not authorized")
    return NextResponse.json(
      { error: msg, notConnected },
      { status: notConnected ? 503 : 500 },
    )
  }
}
