import { auth } from "@/lib/auth"
import { getAnalytics, type AnalyticsRange } from "@/lib/analytics/service"
import { parseRangeFromSearchParams } from "@/lib/analytics/parse-range"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED_ROLES = ["OWNER", "TEST_USER"]

export { parseRangeFromSearchParams }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const range = parseRangeFromSearchParams(req.nextUrl.searchParams)

  try {
    const result = await getAnalytics(range)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error(`GET /api/analytics?range=${range} failed:`, err)
    const notConnected =
      msg.includes("not authorized") || msg.includes("shop_id not found")
    return NextResponse.json(
      { error: msg, notConnected },
      { status: notConnected ? 503 : 500 },
    )
  }
}
