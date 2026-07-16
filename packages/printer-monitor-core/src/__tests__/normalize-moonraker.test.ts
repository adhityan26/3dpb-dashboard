import { describe, it, expect } from 'vitest'
import { normalizeMoonraker } from '../normalize-moonraker'

const body = (ps: Record<string, unknown>, progress = 0.4) => ({
  result: { status: { print_stats: ps, virtual_sdcard: { progress }, display_status: { progress } } },
})

describe('normalizeMoonraker (port ganymede Parse Status, casing distandarkan lowercase)', () => {
  it('printing → running + remaining dari elapsed/progress', () => {
    const s = normalizeMoonraker('ganymede',
      body({ state: 'printing', print_duration: 1200, filename: 'benchy.gcode' }, 0.4))
    expect(s).toMatchObject({
      deviceId: 'ganymede', state: 'running', progress: 40,
      remainingMin: 30, file: 'benchy.gcode', errorDetails: '', gcodeState: 'PRINTING',
    })
  })
  it('stateMap: standby→idle, complete→finish, cancelled→idle, paused→pause, error→error, unknown→idle', () => {
    const st = (x: string) => normalizeMoonraker('g', body({ state: x })).state
    expect(st('standby')).toBe('idle'); expect(st('complete')).toBe('finish')
    expect(st('cancelled')).toBe('idle'); expect(st('paused')).toBe('pause')
    expect(st('error')).toBe('error'); expect(st('zzz')).toBe('idle')
  })
  it('remaining 0 saat progress 0 atau 100', () => {
    expect(normalizeMoonraker('g', body({ state: 'printing', print_duration: 100 }, 0)).remainingMin).toBe(0)
    expect(normalizeMoonraker('g', body({ state: 'complete', print_duration: 100 }, 1)).remainingMin).toBe(0)
  })
})
