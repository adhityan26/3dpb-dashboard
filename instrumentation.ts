// Next.js calls this once when the server starts.
// Used to spin up a background notification poller.

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const INITIAL_DELAY_MS = 30_000

export async function register() {
  // Only run on the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // Don't run during build
  if (process.env.NEXT_PHASE === "phase-production-build") return

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET

  if (!secret) {
    console.warn(
      "[notifications] INTERNAL_NOTIFICATION_SECRET not set — background poller disabled. Add it to .env.local to enable.",
    )
    return
  }

  console.log("[notifications] Background poller starting...")

  // Initial delay so the server is ready before first poll
  setTimeout(() => {
    void runPoll(baseUrl, secret)
    setInterval(() => {
      void runPoll(baseUrl, secret)
    }, POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)
}

async function runPoll(baseUrl: string, secret: string): Promise<void> {
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
