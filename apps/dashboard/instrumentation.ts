// Next.js calls this once when the server starts.
// Used to spin up background pollers: notifications, the daily Working
// Project auto-create job, and the daily WP-status-vs-marketplace sync.

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const INITIAL_DELAY_MS = 30_000

// The auto-create job itself only actually runs once per WIB day (after the
// 23:00 WIB cutoff — see runDailyAutoCreateIfDue in
// lib/working-projects/auto-create.ts), so this poller can tick far more
// often than that without spamming Shopee/Tokopedia — every tick just asks
// "is today's run due yet?" and the endpoint no-ops otherwise.
const AUTO_CREATE_POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

// Same "ticks often, endpoint decides if due" pattern — the status-sync job
// itself only runs once per WIB day, after the 01:00 WIB cutoff (see
// runDailyStatusSyncIfDue in lib/working-projects/status-sync.ts).
const STATUS_SYNC_POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

// Fills salePrice/biaya/pendapatan on Done WPs. Self-gating like the jobs above: with nothing
// pending (no newly Done WP, no estimate older than 12h) a tick makes no marketplace request.
const INCOME_SYNC_POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

export async function register() {
  // Only run on the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // Don't run during build
  if (process.env.NEXT_PHASE === "phase-production-build") return

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET

  if (!secret) {
    console.warn(
      "[notifications] INTERNAL_NOTIFICATION_SECRET not set — background pollers disabled. Add it to .env.local to enable.",
    )
    return
  }

  console.log("[notifications] Background poller starting...")
  setTimeout(() => {
    void runNotificationPoll(baseUrl, secret)
    setInterval(() => {
      void runNotificationPoll(baseUrl, secret)
    }, POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)

  console.log("[working-projects] Auto-create poller starting...")
  setTimeout(() => {
    void runAutoCreatePoll(baseUrl, secret)
    setInterval(() => {
      void runAutoCreatePoll(baseUrl, secret)
    }, AUTO_CREATE_POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)

  console.log("[working-projects] Status-sync poller starting...")
  setTimeout(() => {
    void runStatusSyncPoll(baseUrl, secret)
    setInterval(() => {
      void runStatusSyncPoll(baseUrl, secret)
    }, STATUS_SYNC_POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)

  // Offset by 3 minutes so it doesn't start together with the status-sync's Tokopedia reads.
  console.log("[working-projects] Income-sync poller starting...")
  setTimeout(() => {
    void runIncomeSyncPoll(baseUrl, secret)
    setInterval(() => {
      void runIncomeSyncPoll(baseUrl, secret)
    }, INCOME_SYNC_POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS + 3 * 60 * 1000)
}

async function runNotificationPoll(baseUrl: string, secret: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/notifications/poll`, {
      method: "POST",
      headers: { "x-internal-secret": secret },
    })
    if (!res.ok) {
      console.warn(
        `[notifications] Poll returned ${res.status}: ${await res.text()}`,
      )
      return
    }
    const result = (await res.json()) as {
      detected: number
      sent: number
      skipped: number
      failed: number
    }
    if (result.sent > 0 || result.failed > 0) {
      console.log(
        `[notifications] poll done: detected=${result.detected} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
      )
    }
  } catch (err) {
    console.warn("[notifications] poll error:", err)
  }
}

async function runAutoCreatePoll(baseUrl: string, secret: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/internal/working-projects/auto-create`, {
      method: "POST",
      headers: { "x-internal-secret": secret },
    })
    if (!res.ok) {
      console.warn(
        `[working-projects] Auto-create poll returned ${res.status}: ${await res.text()}`,
      )
      return
    }
    const result = (await res.json()) as {
      ranToday: boolean
      scanned?: number
      created?: number
      skipped?: number
      failed?: number
      errors?: string[]
    }
    if (result.ranToday) {
      console.log(
        `[working-projects] auto-create done: scanned=${result.scanned} created=${result.created} skipped=${result.skipped} failed=${result.failed}`,
      )
      if (result.errors?.length) {
        console.warn("[working-projects] auto-create errors:", result.errors)
      }
    }
  } catch (err) {
    console.warn("[working-projects] auto-create poll error:", err)
  }
}

async function runIncomeSyncPoll(baseUrl: string, secret: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/internal/working-projects/income-sync`, {
      method: "POST",
      headers: { "x-internal-secret": secret },
    })
    if (!res.ok) {
      console.warn(`[working-projects] Income-sync poll returned ${res.status}: ${await res.text()}`)
      return
    }
    const result = (await res.json()) as {
      scanned: number
      updated: number
      notFound: number
      failed: number
      errors: string[]
    }
    if (result.scanned > 0) {
      console.log(
        `[working-projects] income-sync done: scanned=${result.scanned} updated=${result.updated} notFound=${result.notFound} failed=${result.failed}`,
      )
      if (result.errors.length) console.warn("[working-projects] income-sync errors:", result.errors)
    }
  } catch (err) {
    console.warn("[working-projects] income-sync poll error:", err)
  }
}

async function runStatusSyncPoll(baseUrl: string, secret: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/internal/working-projects/status-sync`, {
      method: "POST",
      headers: { "x-internal-secret": secret },
    })
    if (!res.ok) {
      console.warn(
        `[working-projects] Status-sync poll returned ${res.status}: ${await res.text()}`,
      )
      return
    }
    const result = (await res.json()) as {
      ranToday: boolean
      scanned?: number
      updated?: number
      skipped?: number
      failed?: number
      errors?: string[]
    }
    if (result.ranToday) {
      console.log(
        `[working-projects] status-sync done: scanned=${result.scanned} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
      )
      if (result.errors?.length) {
        console.warn("[working-projects] status-sync errors:", result.errors)
      }
    }
  } catch (err) {
    console.warn("[working-projects] status-sync poll error:", err)
  }
}
