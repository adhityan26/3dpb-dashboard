import { loadConfig } from './config'
import { shouldRefresh } from './scheduler'
import { shouldNotify, sendFailureNotification } from './notify'
import { refreshTokopediaSession } from './refresh'

async function getTokenExpiryMs(dashboardUrl: string, internalServiceToken: string): Promise<number | null> {
  const res = await fetch(`${dashboardUrl}/api/tokopedia/session`, {
    headers: { 'X-Internal-Token': internalServiceToken },
  })
  if (!res.ok) throw new Error(`Gagal baca status sesi: HTTP ${res.status}`)
  const status = (await res.json()) as { tokenExpiry?: string | null }
  return status.tokenExpiry ? new Date(status.tokenExpiry).getTime() : null
}

const DASHBOARD_UNREACHABLE_FAILURE_THRESHOLD = 3

interface TickState {
  lastNotifiedAtMs: number | null
  consecutiveDashboardFailures: number
}

async function tick(cfg: ReturnType<typeof loadConfig>, state: TickState): Promise<TickState> {
  const now = Date.now()
  let tokenExpiryMs: number | null
  try {
    tokenExpiryMs = await getTokenExpiryMs(cfg.dashboardUrl, cfg.internalServiceToken)
  } catch (err) {
    console.error(`[tick] Error tak terduga:`, err)
    const consecutiveDashboardFailures = state.consecutiveDashboardFailures + 1
    if (
      consecutiveDashboardFailures >= DASHBOARD_UNREACHABLE_FAILURE_THRESHOLD &&
      shouldNotify(state.lastNotifiedAtMs, now, cfg.notifyCooldownHours)
    ) {
      const message = err instanceof Error ? err.message : String(err)
      try {
        await sendFailureNotification(
          cfg,
          `Tokopedia session refresher tidak bisa menghubungi dashboard setelah ${consecutiveDashboardFailures}x percobaan berturut-turut: ${message}. Cek koneksi/DASHBOARD_URL.`,
        )
      } catch (notifyErr) {
        console.error('[tick] Gagal kirim notifikasi WA:', notifyErr)
      }
      return { lastNotifiedAtMs: now, consecutiveDashboardFailures }
    }
    return { ...state, consecutiveDashboardFailures }
  }

  if (!shouldRefresh(tokenExpiryMs, now, cfg.refreshThresholdHours)) {
    console.log(`[tick] Token masih valid, skip refresh.`)
    return { lastNotifiedAtMs: state.lastNotifiedAtMs, consecutiveDashboardFailures: 0 }
  }
  console.log(`[tick] Token dekat/sudah expired, menjalankan refresh...`)
  const result = await refreshTokopediaSession(cfg)
  if (result.success) {
    console.log(`[tick] Refresh sukses.`)
    return { lastNotifiedAtMs: null, consecutiveDashboardFailures: 0 } // reset notify state on success
  }
  console.error(`[tick] Refresh gagal: ${result.error}`)
  if (shouldNotify(state.lastNotifiedAtMs, now, cfg.notifyCooldownHours)) {
    try {
      await sendFailureNotification(cfg, `Refresh sesi Tokopedia gagal: ${result.error}. Perlu login manual via VNC.`)
    } catch (notifyErr) {
      console.error('[tick] Gagal kirim notifikasi WA:', notifyErr)
    }
    return { lastNotifiedAtMs: now, consecutiveDashboardFailures: 0 }
  }
  return { lastNotifiedAtMs: state.lastNotifiedAtMs, consecutiveDashboardFailures: 0 }
}

async function main() {
  const cfg = loadConfig()
  let state: TickState = { lastNotifiedAtMs: null, consecutiveDashboardFailures: 0 }
  console.log(`[main] tokopedia-session-refresher started. check every ${cfg.checkIntervalHours}h, threshold ${cfg.refreshThresholdHours}h.`)
  while (true) {
    state = await tick(cfg, state)
    await new Promise((resolve) => setTimeout(resolve, cfg.checkIntervalHours * 60 * 60 * 1000))
  }
}

main().catch((err) => {
  console.error('[main] Fatal error:', err)
  process.exit(1)
})
