import { describe, it, expect, vi } from 'vitest'
import { MoonrakerConnector } from '../connectors/moonraker'
import type { DeviceConfig, NormalizedStatus } from '../types'

const gany: DeviceConfig = { id: 'ganymede', name: 'Ganymede', type: 'U1', connector: 'moonraker', ip: '192.168.88.40' }
const okBody = { result: { status: { print_stats: { state: 'printing', print_duration: 600, filename: 'a.gcode' }, virtual_sdcard: { progress: 0.5 }, display_status: { progress: 0.5 } } } }
const tempBody = { result: { status: { extruder: { temperature: 210 }, heater_bed: { temperature: 60 } } } }
const statusUrl = 'http://192.168.88.40/printer/objects/query?print_stats&virtual_sdcard&display_status'
const tempUrl = 'http://192.168.88.40/printer/objects/query?extruder&heater_bed'

describe('MoonrakerConnector', () => {
  it('poll on-start + tiap interval; URL status DAN URL suhu keduanya dipanggil, terpisah; emit NormalizedStatus gabungan', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async (url: string) =>
      url === tempUrl ? new Response(JSON.stringify(tempBody)) : new Response(JSON.stringify(okBody)))
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { pollIntervalMs: 60_000, fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await vi.advanceTimersByTimeAsync(60_000)
    await c.stop()
    vi.useRealTimers()

    expect(fetchImpl).toHaveBeenCalledWith(statusUrl)
    expect(fetchImpl).toHaveBeenCalledWith(tempUrl)
    expect(got.length).toBe(2) // on-start + 1 tick -- SATU emit per tick meski 2 fetch
    expect(got[0]).toMatchObject({ deviceId: 'ganymede', state: 'running', progress: 50, nozzleTemp: 210, bedTemp: 60 })
  })

  it('fetch gagal → tidak emit, tidak crash', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('down') })
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await c.stop()
    expect(got).toHaveLength(0)
  })

  it('respons non-2xx → tidak emit (dianggap poll gagal)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }))
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await c.stop()
    expect(got).toHaveLength(0)
  })

  it('query suhu (extruder/heater_bed) di-query TERPISAH dari status utama -- printer tanpa heater_bed (Moonraker balas 400 utk object yang gak ada) TETAP dapat status/progress ter-update, cuma suhu jadi 0. Regresi nyata: kalau digabung jadi satu query, Moonraker balas error utk SELURUH request gabungan, bukan cuma field suhu yang kosong -- status ikut gagal ke-update.', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === tempUrl
        ? new Response(JSON.stringify({ error: 'unknown object heater_bed' }), { status: 400 })
        : new Response(JSON.stringify(okBody)))
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await c.stop()

    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ state: 'running', progress: 50, nozzleTemp: 0, bedTemp: 0 })
  })

  it('query suhu throw (network error terpisah, bukan HTTP error) -- status utama tetap jalan', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === tempUrl) throw new Error('temp endpoint down')
      return new Response(JSON.stringify(okBody))
    })
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await c.stop()

    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ state: 'running', progress: 50, nozzleTemp: 0, bedTemp: 0 })
  })
})
