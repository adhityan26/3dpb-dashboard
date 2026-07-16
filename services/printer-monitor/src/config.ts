import type { DeviceConfig } from '@3pb/printer-monitor-core'

export interface AppConfig {
  broker: { url: string }
  topics: { status: string; events: string }
  staleAfterMs: number
  pushallIntervalMs: number
  moonrakerPollMs: number
  republishIntervalMs: number
  notifications: null | {
    telegram?: { botToken: string; chatIds: string[] }
    pushover?: { token: string; user: string }
  }
  devices: DeviceConfig[]
}

export function loadConfig(raw: unknown): { config: AppConfig; skipped: { id: string; reason: string }[] } {
  const r = (raw ?? {}) as Record<string, any>
  if (!r.broker?.url) throw new Error('config: broker.url wajib diisi')

  const skipped: { id: string; reason: string }[] = []
  const devices: DeviceConfig[] = []
  for (const d of r.devices ?? []) {
    if (!d.id || !d.name || !d.connector) { skipped.push({ id: d.id ?? '?', reason: 'field id/name/connector kurang' }); continue }
    if (d.connector !== 'bambu' && d.connector !== 'moonraker') {
      skipped.push({ id: d.id, reason: `connector tidak dikenal: ${d.connector}` }); continue
    }
    if (d.connector === 'bambu' && (!d.ip || !d.serial || !d.accessCode)) {
      skipped.push({ id: d.id, reason: 'bambu butuh ip+serial+accessCode (isi manual di config.json)' }); continue
    }
    if (d.connector === 'moonraker' && !d.ip) { skipped.push({ id: d.id, reason: 'moonraker butuh ip' }); continue }
    devices.push(d as DeviceConfig)
  }

  return {
    config: {
      broker: { url: String(r.broker.url) },
      topics: { status: r.topics?.status ?? '3dpb/printers-v2', events: r.topics?.events ?? '3dpb/printer-events' },
      staleAfterMs: r.staleAfterMs ?? 600_000,
      pushallIntervalMs: r.pushallIntervalMs ?? 300_000,
      moonrakerPollMs: r.moonrakerPollMs ?? 60_000,
      republishIntervalMs: r.republishIntervalMs ?? 60_000,
      notifications: r.notifications ?? null,
      devices,
    },
    skipped,
  }
}
