export interface RefresherConfig {
  dashboardUrl: string
  internalServiceToken: string
  checkIntervalHours: number
  refreshThresholdHours: number
  notifyCooldownHours: number
  browserProfileDir: string
  waOmniEndpoint: string
  waOmniToken: string
  waOmniTargetNumber: string
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} wajib diisi (env var kosong)`)
  return v
}

function envNumber(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function loadConfig(): RefresherConfig {
  return {
    dashboardUrl: requireEnv('DASHBOARD_URL'),
    internalServiceToken: requireEnv('INTERNAL_SERVICE_TOKEN'),
    checkIntervalHours: envNumber('CHECK_INTERVAL_HOURS', 4),
    refreshThresholdHours: envNumber('REFRESH_THRESHOLD_HOURS', 24),
    notifyCooldownHours: envNumber('NOTIFY_COOLDOWN_HOURS', 6),
    browserProfileDir: process.env.BROWSER_PROFILE_DIR ?? '/data/browser-profile',
    waOmniEndpoint: requireEnv('WA_OMNI_ENDPOINT'),
    waOmniToken: requireEnv('WA_OMNI_TOKEN'),
    waOmniTargetNumber: requireEnv('WA_OMNI_TARGET_NUMBER'),
  }
}
