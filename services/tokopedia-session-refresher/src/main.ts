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

async function tick(cfg: ReturnType<typeof loadConfig>, lastNotifiedAtMs: number | null): Promise<number | null> {
  const now = Date.now()
  try {
    const tokenExpiryMs = await getTokenExpiryMs(cfg.dashboardUrl, cfg.internalServiceToken)
    if (!shouldRefresh(tokenExpiryMs, now, cfg.refreshThresholdHours)) {
      console.log(`[tick] Token masih valid, skip refresh.`)
      return lastNotifiedAtMs
    }
    console.log(`[tick] Token dekat/sudah expired, menjalankan refresh...`)
    const result = await refreshTokopediaSession(cfg)
    if (result.success) {
      console.log(`[tick] Refresh sukses.`)
      return null // reset notify state on success
    }
    console.error(`[tick] Refresh gagal: ${result.error}`)
    if (shouldNotify(lastNotifiedAtMs, now, cfg.notifyCooldownHours)) {
      await sendFailureNotification(cfg, `Refresh sesi Tokopedia gagal: ${result.error}. Perlu login manual via VNC.`)
      return now
    }
    return lastNotifiedAtMs
  } catch (err) {
    console.error(`[tick] Error tak terduga:`, err)
    return lastNotifiedAtMs
  }
}

async function main() {
  const cfg = loadConfig()
  let lastNotifiedAtMs: number | null = null
  console.log(`[main] tokopedia-session-refresher started. check every ${cfg.checkIntervalHours}h, threshold ${cfg.refreshThresholdHours}h.`)
  while (true) {
    lastNotifiedAtMs = await tick(cfg, lastNotifiedAtMs)
    await new Promise((resolve) => setTimeout(resolve, cfg.checkIntervalHours * 60 * 60 * 1000))
  }
}

main().catch((err) => {
  console.error('[main] Fatal error:', err)
  process.exit(1)
})
