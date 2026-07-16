import type { HmsEntry, NormalizedStatus, PrinterState } from './types'

const STATE_MAP: Record<string, PrinterState> = {
  RUNNING: 'running', PAUSE: 'pause', PAUSED: 'pause',
  FINISH: 'finish', FAILED: 'error', IDLE: 'idle', PREPARE: 'running',
}

const basename = (p: string) => p.split('/').pop() ?? ''

export function buildErrorDetails(hms: HmsEntry[], printError: number, mcPrintErrorCode: string): string {
  const hmsText = hms.map((h) => `hms=code=${h.code}, attr=${h.attr}`).join(' | ')
  return [hmsText, `print_error=${printError}`, `mc_print_error_code=${mcPrintErrorCode}`]
    .filter(Boolean).join(' | ')
}

export function normalizeBambu(deviceId: string, message: unknown): NormalizedStatus {
  const raw = ((message as Record<string, unknown>)?.print ?? {}) as Record<string, unknown>
  const gcodeState = String(raw.gcode_state ?? '').toUpperCase()
  const hms = Array.isArray(raw.hms) ? (raw.hms as HmsEntry[]) : []
  const printError = Number(raw.print_error ?? 0)
  const mcPrintErrorCode = String(raw.mc_print_error_code ?? '0')
  const file =
    (raw.subtask_name as string) ||
    (raw.gcode_file ? basename(String(raw.gcode_file)) : '') ||
    (raw.file ? basename(String(raw.file)) : '')

  return {
    deviceId,
    state: STATE_MAP[gcodeState] ?? 'idle',
    gcodeState,
    progress: Number(raw.mc_percent ?? raw.percent ?? 0),
    file,
    taskId: String(raw.task_id ?? ''),
    remainingMin: Number(raw.mc_remaining_time ?? raw.remain_time ?? 0),
    printError,
    mcPrintErrorCode,
    failReason: String(raw.fail_reason ?? '0'),
    hms,
    errorDetails: buildErrorDetails(hms, printError, mcPrintErrorCode),
    eventTime: new Date().toISOString(),
  }
}
