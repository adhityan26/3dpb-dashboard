import { describe, it, expect, vi } from 'vitest'
import { MoonrakerConnector } from '../connectors/moonraker'
import type { DeviceConfig, NormalizedStatus } from '../types'

const gany: DeviceConfig = { id: 'ganymede', name: 'Ganymede', type: 'U1', connector: 'moonraker', ip: '192.168.88.40' }
const okBody = { result: { status: { print_stats: { state: 'printing', print_duration: 600, filename: 'a.gcode' }, virtual_sdcard: { progress: 0.5 }, display_status: { progress: 0.5 } } } }

describe('MoonrakerConnector', () => {
  it('poll on-start + tiap interval; URL benar; emit NormalizedStatus', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(okBody)))
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { pollIntervalMs: 60_000, fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await vi.advanceTimersByTimeAsync(60_000)
    await c.stop()
    vi.useRealTimers()

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://192.168.88.40/printer/objects/query?print_stats&virtual_sdcard&display_status')
    expect(got.length).toBe(2) // on-start + 1 tick
    expect(got[0]).toMatchObject({ deviceId: 'ganymede', state: 'running', progress: 50 })
  })

  it('fetch gagal → tidak emit, tidak crash', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('down') })
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await c.stop()
    expect(got).toHaveLength(0)
  })
})
