import { auth } from "@/lib/auth"
import { runAllDetectors } from "@/lib/notifications/runner"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/notifications/poll
 *
 * Run all detectors once and send any non-deduplicated alerts.
 *
 * Authorization:
 * - Owner session (manual trigger from Settings tab)
 * - OR internal secret header (background poller)
 */
export async function POST(req: NextRequest) {
  const internalSecret = process.env.INTERNAL_NOTIFICATION_SECRET
  const headerSecret = req.headers.get("x-internal-secret")

  let authorized = false
  if (internalSecret && headerSecret === internalSecret) {
    authorized = true
  } else {
    const session = await auth()
    if (session?.user?.role === "OWNER") {
      authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await runAllDetectors()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("POST /api/notifications/poll failed:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
