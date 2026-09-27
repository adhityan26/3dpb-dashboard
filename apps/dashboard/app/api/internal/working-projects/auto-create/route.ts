import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { autoCreateWorkingProjectsFromNewOrders, runDailyAutoCreateIfDue } from "@/lib/working-projects/auto-create"

/**
 * POST /api/internal/working-projects/auto-create
 *
 * Scans Shopee + Tokopedia for orders without a Working Project yet and
 * creates one for each, routed to the right Discord forum by product
 * category. Runs at most once per WIB calendar day, after 23:00 WIB —
 * called every few minutes by the background poller (instrumentation.ts),
 * which decides on each tick whether today's run is due yet.
 *
 * Authorization (same pattern as /api/notifications/poll):
 * - Owner session with `?force=1` (manual trigger from Settings, ignores the
 *   daily cutoff/dedupe-by-date so it can be re-run on demand)
 * - OR internal secret header (background poller)
 */
export async function POST(req: NextRequest) {
  const internalSecret = process.env.INTERNAL_NOTIFICATION_SECRET
  const headerSecret = req.headers.get("x-internal-secret")
  const force = new URL(req.url).searchParams.get("force") === "1"

  let authorized = false
  let isOwner = false
  if (internalSecret && headerSecret === internalSecret) {
    authorized = true
  } else {
    const session = await auth()
    if (session?.user?.role === "OWNER") {
      authorized = true
      isOwner = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = force && isOwner ? await autoCreateWorkingProjectsFromNewOrders() : await runDailyAutoCreateIfDue()
    if (result === null) {
      return NextResponse.json({ ranToday: false })
    }
    return NextResponse.json({ ranToday: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("POST /api/internal/working-projects/auto-create failed:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
