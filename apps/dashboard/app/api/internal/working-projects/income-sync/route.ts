import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { syncWorkingProjectIncome } from "@/lib/working-projects/income-sync"

/**
 * POST /api/internal/working-projects/income-sync
 *
 * Fills harga jual / biaya / pendapatan akhir on Done Shopee/Tokopedia WPs from the
 * marketplace's escrow/settlement data. Idempotent and self-gating (a WP is only fetched
 * when it has no income yet or its estimate is >12h old), so the background poller
 * (instrumentation.ts) calls it every 15 minutes and most ticks make no marketplace request.
 *
 * Authorization (same as the other internal WP jobs): internal secret header, or an OWNER session.
 */
export async function POST(req: NextRequest) {
  const internalSecret = process.env.INTERNAL_NOTIFICATION_SECRET
  const headerSecret = req.headers.get("x-internal-secret")

  let authorized = Boolean(internalSecret && headerSecret === internalSecret)
  if (!authorized) {
    const session = await auth()
    authorized = session?.user?.role === "OWNER"
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    return NextResponse.json(await syncWorkingProjectIncome())
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("POST /api/internal/working-projects/income-sync failed:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
