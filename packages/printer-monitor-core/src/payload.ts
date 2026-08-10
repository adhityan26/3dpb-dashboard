import type { DeviceConfig, PrintersPayload } from './types'
import type { StateStore } from './state-store'

export const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000

export function buildPrintersPayload(
  devices: DeviceConfig[], store: StateStore, nowMs: number,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): PrintersPayload {
  return {
    payload: devices.map((d) => {
      const r = store.get(d.id)
      const lastSeen = r?.last_seen_at ? Date.parse(r.last_seen_at) : null
      const isStale = lastSeen === null || nowMs - lastSeen > staleAfterMs
      return {
        id: d.id,
        name: d.name, type: d.type, connector: d.connector,
        state: isStale ? 'OFFLINE' : (r!.last_state || 'idle'),
        progress: r?.last_progress ?? 0,
        remaining_min: r?.last_remaining_min ?? 0,
        filename: r?.last_filename ?? '',
        error_msg: r?.last_error_code ?? '',
        error_message: r?.last_error_message ?? '',
        last_seen: r?.last_seen_at ?? null,
        nozzle_temp: r?.last_nozzle_temp ?? 0,
        bed_temp: r?.last_bed_temp ?? 0,
      }
    }),
  }
}
