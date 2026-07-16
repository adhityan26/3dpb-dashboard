import { describe, it, expect } from 'vitest'
import { normalizeBambu } from '../normalize-bambu'

const running = {
  print: {
    upgrade_state: { sn: '01S00A2C0502433' },
    gcode_state: 'RUNNING', mc_percent: 42, mc_remaining_time: 58,
    subtask_name: 'Nike_Crocs_1.3', task_id: '12345',
    print_error: 0, mc_print_error_code: '0', fail_reason: '0', hms: [],
  },
}

describe('normalizeBambu (port n8n Normalize Message)', () => {
  it('memetakan report RUNNING', () => {
    const s = normalizeBambu('mars', running)
    expect(s).toMatchObject({
      deviceId: 'mars', state: 'running', gcodeState: 'RUNNING',
      progress: 42, remainingMin: 58, file: 'Nike_Crocs_1.3', taskId: '12345',
      printError: 0, mcPrintErrorCode: '0', failReason: '0',
      errorDetails: 'print_error=0 | mc_print_error_code=0',
    })
    expect(Date.parse(s.eventTime)).not.toBeNaN()
  })

  it('STATE_MAP: FINISH→finish, PAUSED→pause, FAILED→error, PREPARE→running, unknown→idle', () => {
    const st = (g: string) => normalizeBambu('x', { print: { ...running.print, gcode_state: g } }).state
    expect(st('FINISH')).toBe('finish'); expect(st('PAUSED')).toBe('pause')
    expect(st('FAILED')).toBe('error'); expect(st('PREPARE')).toBe('running')
    expect(st('WEIRD')).toBe('idle')
  })

  it('gcode_state absen → gcodeState "" dan state idle (gate If n8n dievaluasi caller)', () => {
    const s = normalizeBambu('x', { print: { mc_percent: 1 } })
    expect(s.gcodeState).toBe(''); expect(s.state).toBe('idle')
  })

  it('file fallback: subtask_name > basename(gcode_file) > basename(file)', () => {
    const s = normalizeBambu('x', { print: { gcode_state: 'IDLE', gcode_file: '/data/dir/part.gcode.3mf' } })
    expect(s.file).toBe('part.gcode.3mf')
  })

  it('errorDetails gaya Capture Event: HMS + print_error desimal', () => {
    const s = normalizeBambu('x', {
      print: { gcode_state: 'RUNNING', print_error: 117473285, mc_print_error_code: '0',
        hms: [{ attr: 0x0c000100, code: 0x00010004 }] },
    })
    expect(s.errorDetails).toBe(
      'hms=code=65540, attr=201326848 | print_error=117473285 | mc_print_error_code=0')
  })
})
