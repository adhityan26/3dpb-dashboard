import { auth } from "@/lib/auth"
import { getAdsPerformance, type AdsRange } from "@/lib/ads/service"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED_ROLES = ["OWNER", "TEST_USER"]

function parseRange(raw: string | null): AdsRange {
  if (raw === "30d") return "30d"
  return "7d"
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const range = parseRange(req.nextUrl.searchParams.get("range"))

  try {
    const result = await getAdsPerformance(range)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error(`GET /api/ads?range=${range} failed:`, err)
    const notConnected =
      msg.includes("not authorized") || msg.includes("shop_id not found")
    return NextResponse.json(
      { error: msg, notConnected },
      { status: notConnected ? 503 : 500 },
    )
  }
}
