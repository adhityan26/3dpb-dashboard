import { describe, it, expect, vi } from 'vitest'
import { Engine, type Reporter, type Notifier } from '../engine'
import { normalizeBambu } from '../normalize-bambu'
import { BambuMqttConnector } from '../connectors/bambu-mqtt'
import type { DeviceConfig, PrintersPayload, PrinterEvent } from '../types'

const mars: DeviceConfig = { id: 'mars', name: 'Mars', type: 'P1P', connector: 'bambu', ip: 'x', serial: 's', accessCode: 'a' }
const mk = (g: string, extra: Record<string, unknown> = {}) =>
  normalizeBambu('mars', { print: { gcode_state: g, print_error: 0, mc_print_error_code: '0', fail_reason: '0', ...extra } })

function makeEngine() {
  const published: PrintersPayload[] = []
  const events: PrinterEvent[] = []
  const notified: string[] = []
  const reporter: Reporter = { publishStatus: (p) => void published.push(p), emitEvent: (e) => void events.push(e) }
  const notifier: Notifier = { notify: (e) => void notified.push(e.kind) }
  const engine = new Engine({
    devices: [mars], connectors: [], reporters: [reporter], notifiers: [notifier],
    now: () => Date.parse('2026-07-16T01:00:00Z'),
  })
  return { engine, published, events, notified }
}

describe('Engine', () => {
  it('status masuk → publish payload; transisi idle→running → event started + notifier', async () => {
    const { engine, published, events, notified } = makeEngine()
    await engine.handleStatus(mk('RUNNING'))
    expect(published).toHaveLength(1)
    expect(published[0].payload[0]).toMatchObject({ name: 'Mars', state: 'running' })
    expect(events.map((e) => e.kind)).toEqual(['started'])
    expect(notified).toEqual(['started'])
  })

  it('status tanpa gcode_state di-skip (gate If n8n)', async () => {
    const { engine, published } = makeEngine()
    await engine.handleStatus(normalizeBambu('mars', { print: { mc_percent: 3 } }))
    expect(published).toHaveLength(0)
  })

  it('running→idle progress 100 → finished; payload menampilkan finish', async () => {
    const { engine, events, published } = makeEngine()
    await engine.handleStatus(mk('RUNNING', { mc_percent: 50 }))
    await engine.handleStatus(mk('IDLE', { mc_percent: 100 }))
    expect(events.map((e) => e.kind)).toEqual(['started', 'finished'])
    expect(published.at(-1)!.payload[0].state).toBe('finish')
  })

  it('start() menjadwalkan republish periodik (staleness bisa berubah tanpa message)', async () => {
    vi.useFakeTimers()
    const { engine, published } = makeEngine()
    await engine.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(published.length).toBeGreaterThanOrEqual(1)
    await engine.stop()
    vi.useRealTimers()
  })

  it('connector printer mati (connection refused) tidak menggagalkan engine.start(); snapshot OFFLINE', async () => {
    const reporter: Reporter = { publishStatus: () => {}, emitEvent: () => {} }
    const connector = new BambuMqttConnector(mars, { urlOverride: 'mqtt://127.0.0.1:1' })
    const engine = new Engine({
      devices: [mars], connectors: [connector], reporters: [reporter],
      now: () => Date.parse('2026-07-16T01:00:00Z'),
    })
    await expect(engine.start()).resolves.toBeUndefined()
    expect(engine.snapshot().payload[0]).toMatchObject({ name: 'Mars', state: 'OFFLINE' })
    await engine.stop()
  })

  it('reporter yang throw (emitEvent/publishStatus) tidak menghentikan engine — reporter lain & status berikutnya tetap diproses', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const published: PrintersPayload[] = []
    const events: PrinterEvent[] = []
    const badReporter: Reporter = {
      emitEvent: () => { throw new Error('boom-event') },
      publishStatus: () => { throw new Error('boom-publish') },
    }
    const goodReporter: Reporter = {
      emitEvent: (e) => void events.push(e),
      publishStatus: (p) => void published.push(p),
    }
    const engine = new Engine({
      devices: [mars], connectors: [], reporters: [badReporter, goodReporter],
      now: () => Date.parse('2026-07-16T01:00:00Z'),
    })
    await engine.handleStatus(mk('RUNNING'))
    await engine.handleStatus(mk('RUNNING', { mc_percent: 50 }))
    expect(errSpy).toHaveBeenCalledWith('[reporter]', expect.any(Error))
    errSpy.mockRestore()
    expect(events.map((e) => e.kind)).toEqual(['started'])
    expect(published).toHaveLength(2)
  })
})
