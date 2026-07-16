import type { NormalizedStatus, PrinterState } from './types'

const STATE_MAP: Record<string, PrinterState> = {
  printing: 'running', standby: 'idle', complete: 'finish',
  error: 'error', cancelled: 'idle', paused: 'pause',
}

export function normalizeMoonraker(deviceId: string, body: unknown): NormalizedStatus {
  const status = ((body as any)?.result?.status ?? {}) as Record<string, any>
  const ps = status.print_stats ?? {}
  const vs = status.virtual_sdcard ?? {}
  const ds = status.display_status ?? {}

  const rawState = String(ps.state ?? 'standby').toLowerCase()
  const state = STATE_MAP[rawState] ?? 'idle'
  const progress = Math.round((vs.progress ?? ds.progress ?? 0) * 100)
  const elapsed = Number(ps.print_duration ?? 0)
  const remainingMin = progress > 0 && progress < 100
    ? Math.round((elapsed / (progress / 100) - elapsed) / 60) : 0

  return {
    deviceId, state, gcodeState: rawState.toUpperCase(),
    progress, file: String(ps.filename ?? ''), taskId: '',
    remainingMin, printError: 0, mcPrintErrorCode: '0', failReason: '0',
    hms: [], errorDetails: '', eventTime: new Date().toISOString(),
  }
}
