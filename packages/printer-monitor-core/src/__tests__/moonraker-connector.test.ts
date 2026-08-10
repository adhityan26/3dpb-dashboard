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

describe('MoonrakerConnector.sendCommand', () => {
  it('pause -> POST /printer/print/pause', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'pause' })
    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.88.40/printer/print/pause', {
      method: 'POST', signal: expect.any(AbortSignal),
    })
  })

  it('setSpeedPercent -> POST /printer/gcode/script dengan M220 S<persen>', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'setSpeedPercent', percent: 120 })
    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.88.40/printer/gcode/script', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script: 'M220 S120' }),
      signal: expect.any(AbortSignal),
    })
  })

  it('respons non-2xx -> {ok:false, message berisi status code}', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'stop' })
    expect(result).toEqual({ ok: false, message: 'moonraker_500' })
  })

  it('stop -> POST /printer/print/cancel (URL destruktif ini sebelumnya tak pernah di-assert)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.sendCommand({ kind: 'stop' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://192.168.88.40/printer/print/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('fetch throw TypeError (koneksi gagal) -> {ok:false, message:"printer_offline"} (sama dgn Bambu utk kondisi sama)', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'resume' })
    expect(result).toEqual({ ok: false, message: 'printer_offline' })
  })

  it('request timeout (10s) -> {ok:false, message:"printer_offline"}', async () => {
    // Node's AbortSignal.timeout() menjalankan timer internal yang TIDAK ter-hook oleh fake
    // timers vitest/sinon (mereka cuma patch global setTimeout). Untuk menguji jalur
    // 10-detik ini dgn fake timers (fetchImpl yang tak pernah resolve sendiri +
    // vi.advanceTimersByTimeAsync, sesuai pola file ini), spy AbortSignal.timeout supaya
    // pakai global setTimeout (yang KE-fake) -- tetap memverifikasi kode produksi memanggil
    // AbortSignal.timeout(10_000) dan bahwa abort-nya dipetakan ke 'printer_offline'.
    vi.useFakeTimers()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('The operation timed out', 'TimeoutError')), ms)
      return controller.signal
    })
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () => reject(signal.reason))
      }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const resultPromise = c.sendCommand({ kind: 'pause' })
    await vi.advanceTimersByTimeAsync(10_000)
    const result = await resultPromise
    expect(timeoutSpy).toHaveBeenCalledWith(10_000) // assert SEBELUM mockRestore -- restore mereset call history
    timeoutSpy.mockRestore()
    vi.useRealTimers()
    expect(result).toEqual({ ok: false, message: 'printer_offline' })
  })

  it('setSpeedPercent di luar rentang 20-200 -> {ok:false, message:"unsupported_command"}, tak fetch', async () => {
    const fetchImpl = vi.fn()
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const tooLow = await c.sendCommand({ kind: 'setSpeedPercent', percent: 10 })
    const tooHigh = await c.sendCommand({ kind: 'setSpeedPercent', percent: 250 })
    expect(tooLow).toEqual({ ok: false, message: 'unsupported_command' })
    expect(tooHigh).toEqual({ ok: false, message: 'unsupported_command' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('setSpeedPercent non-numeric -> {ok:false, message:"unsupported_command"}, tak fetch', async () => {
    const fetchImpl = vi.fn()
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'setSpeedPercent', percent: Number('bukan angka') })
    expect(result).toEqual({ ok: false, message: 'unsupported_command' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('command kind yang tak didukung Moonraker (mis. setSpeedLevel, punya Bambu) -> unsupported_command', async () => {
    const fetchImpl = vi.fn()
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'setSpeedLevel', level: 2 })
    expect(result).toEqual({ ok: false, message: 'unsupported_command' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
