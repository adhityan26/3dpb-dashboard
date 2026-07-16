import { describe, it, expect } from 'vitest'
import { captureEvent, storedStateFor } from '../capture-event'
import { normalizeBambu } from '../normalize-bambu'

const mk = (over: Record<string, unknown>) =>
  normalizeBambu('x', { print: { gcode_state: 'IDLE', print_error: 0, mc_print_error_code: '0', fail_reason: '0', ...over } })

describe('captureEvent (port n8n Capture Event)', () => {
  it('idle→running = started (termasuk prev undefined)', () => {
    const cur = mk({ gcode_state: 'RUNNING' })
    expect(captureEvent(cur, undefined).event).toBe('started')
    expect(captureEvent(cur, { last_state: 'idle', last_task_id: '', last_progress: 0 }).event).toBe('started')
  })
  it('running→running = tidak ada event', () => {
    expect(captureEvent(mk({ gcode_state: 'RUNNING' }),
      { last_state: 'running', last_task_id: '', last_progress: 10 }).event).toBeNull()
  })
  it('any→error = error (hanya via FAILED, bukan print_error!=0)', () => {
    expect(captureEvent(mk({ gcode_state: 'FAILED' }),
      { last_state: 'running', last_task_id: '', last_progress: 50 }).event).toBe('error')
    expect(captureEvent(mk({ gcode_state: 'RUNNING', print_error: 123 }),
      { last_state: 'running', last_task_id: '', last_progress: 50 }).event).toBeNull()
  })
  it('running→idle bersih & progress>=99 = finished, finalState=finished', () => {
    const r = captureEvent(mk({ gcode_state: 'IDLE', mc_percent: 100 }),
      { last_state: 'running', last_task_id: 't', last_progress: 98 })
    expect(r.event).toBe('finished'); expect(r.finalState).toBe('finished')
  })
  it('running→idle dgn print_error != 0 = BUKAN finished', () => {
    expect(captureEvent(mk({ gcode_state: 'IDLE', mc_percent: 100, print_error: 5 }),
      { last_state: 'running', last_task_id: 't', last_progress: 98 }).event).toBeNull()
  })
  it('finished→idle = tidak ada event', () => {
    expect(captureEvent(mk({ gcode_state: 'IDLE' }),
      { last_state: 'finished', last_task_id: 't', last_progress: 100 }).event).toBeNull()
  })
})

describe('storedStateFor (port kolom last_state "Update row(s)")', () => {
  it('finished→finish, error→error, else state normalized', () => {
    const cur = mk({ gcode_state: 'RUNNING' })
    expect(storedStateFor('finished', cur)).toBe('finish')
    expect(storedStateFor('error', cur)).toBe('error')
    expect(storedStateFor(null, cur)).toBe('running')
  })
})
