import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { syncWorkingProjectStatusFromMarketplace, runDailyStatusSyncIfDue } from "@/lib/working-projects/status-sync"

/**
 * POST /api/internal/working-projects/status-sync
 *
 * For every WP still "Open", checks the actual Shopee/Tokopedia order
 * status and moves it on (Waiting Customer/Siap Kirim/Done/Canceled) when
 * the marketplace order has — via updateWorkingProject(), so the Discord
 * thread is edited in place. Runs at most once per WIB calendar day, after
 * 01:00 WIB — called every few minutes by the background poller
 * (instrumentation.ts), same pattern as the auto-create job.
 *
 * Authorization (same pattern as /api/notifications/poll and
 * /api/internal/working-projects/auto-create):
 * - Owner session with `?force=1` (manual trigger, ignores the daily cutoff)
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
    const result = force && isOwner ? await syncWorkingProjectStatusFromMarketplace() : await runDailyStatusSyncIfDue()
    if (result === null) {
      return NextResponse.json({ ranToday: false })
    }
    return NextResponse.json({ ranToday: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("POST /api/internal/working-projects/status-sync failed:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
