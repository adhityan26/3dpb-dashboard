import type { NormalizedStatus, PrinterEventKind, StoredState } from './types'

export interface CaptureResult { event: PrinterEventKind | null; finalState: string }

type Prev = Pick<StoredState, 'last_state' | 'last_task_id' | 'last_progress'>

export function captureEvent(current: NormalizedStatus, prev?: Prev): CaptureResult {
  const prevState = prev?.last_state ?? 'idle'
  let event: PrinterEventKind | null = null

  if (prevState !== 'running' && current.state === 'running') event = 'started'
  else if (prevState !== 'error' && current.state === 'error') event = 'error'
  else if (
    prevState === 'running' && current.state === 'idle' &&
    current.printError === 0 && current.mcPrintErrorCode === '0' && current.failReason === '0' &&
    (current.progress >= 99 || current.remainingMin === 0)
  ) event = 'finished'
  else if (prevState === 'finished' && current.state === 'idle') event = null

  return { event, finalState: event === 'finished' ? 'finished' : current.state }
}

export function storedStateFor(event: PrinterEventKind | null, current: NormalizedStatus): string {
  if (event === 'finished') return 'finish'
  if (event === 'error') return 'error'
  return current.state
}
