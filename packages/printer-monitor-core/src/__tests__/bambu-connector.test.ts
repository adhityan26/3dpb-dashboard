import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer, type Server } from 'node:net'
import Aedes from 'aedes'
import mqtt from 'mqtt'
import { BambuMqttConnector } from '../connectors/bambu-mqtt'
import type { DeviceConfig, NormalizedStatus } from '../types'

// start() sengaja resolve TANPA menunggu koneksi (lihat test "printer mati"), jadi test
// harus menunggu kondisi nyata — fixed sleep (100ms) flaky saat CPU padat, mis. full
// parallel `turbo test` (10 paket sekaligus): CONNACK bisa lewat dari 100ms → sendCommand
// balikin printer_offline palsu.
const waitForConnected = (c: BambuMqttConnector) =>
  vi.waitFor(() => { if (!c.connected) throw new Error('MQTT belum connect') }, { timeout: 10_000 })

const waitFor = (cond: () => boolean, what: string) =>
  vi.waitFor(() => { if (!cond()) throw new Error(`menunggu: ${what}`) }, { timeout: 10_000 })

let server: Server, port: number, aedes: InstanceType<typeof Aedes>
beforeAll(async () => {
  aedes = new Aedes()
  server = createServer(aedes.handle)
  await new Promise<void>((res) => server.listen(0, () => res()))
  port = (server.address() as { port: number }).port
})
afterAll(async () => { aedes.close(); server.close() })

const mars: DeviceConfig = { id: 'mars', name: 'Mars', type: 'P1P', connector: 'bambu', ip: '127.0.0.1', serial: 'SER1', accessCode: 'code' }

describe('BambuMqttConnector', () => {
  it('subscribe report, kirim pushall on-connect, emit NormalizedStatus', async () => {
    const pushalls: string[] = []
    aedes.subscribe('device/SER1/request', (pkt, cb) => { pushalls.push(pkt.payload.toString()); cb() }, () => {})

    const got: NormalizedStatus[] = []
    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start((s) => void got.push(s))
    // Pushall terkirim SETELAH subscribe (urutan paket di socket yang sama) — begitu pushall
    // sampai, subscribe connector pasti sudah diproses aedes, aman untuk publish report.
    await waitFor(() => pushalls.length >= 1, 'pushall on-connect diterima broker')

    const pub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => pub.on('connect', () => res()))
    pub.publish('device/SER1/report', JSON.stringify({ print: { gcode_state: 'RUNNING', mc_percent: 7 } }))
    await waitFor(() => got.length >= 1, 'NormalizedStatus ter-emit')
    pub.end()
    await c.stop()

    expect(JSON.parse(pushalls[0]).pushing.command).toBe('pushall')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ deviceId: 'mars', state: 'running', progress: 7 })
  })

  it('payload non-JSON di-skip tanpa crash', async () => {
    const got: NormalizedStatus[] = []
    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start((s) => void got.push(s))
    await waitForConnected(c)
    const pub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => pub.on('connect', () => res()))
    pub.publish('device/SER1/report', 'bukan json')
    await new Promise((r) => setTimeout(r, 200))
    pub.end()
    await c.stop()
    expect(got).toHaveLength(0)
  })

  it('printer mati (connection refused) → start() resolve cepat tanpa throw/hang; stop() bersih', async () => {
    // port 1 = reserved, tidak ada listener → ECONNREFUSED. Sebelum fix, start() reject
    // di sini (unhandled rejection di Engine.start → proses exit / crash-loop).
    const c = new BambuMqttConnector(mars, { urlOverride: 'mqtt://127.0.0.1:1', pushallIntervalMs: 50 })
    const startedAt = Date.now()
    await expect(c.start(() => {})).resolves.toBeUndefined()
    expect(Date.now() - startedAt).toBeLessThan(1000)
    await c.stop()
  })
})

describe('BambuMqttConnector.sendCommand', () => {
  it('pause -> publish command pause ke topic request', async () => {
    const received: string[] = []
    const sub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => sub.on('connect', () => res()))
    await sub.subscribeAsync('device/SER1/request')
    sub.on('message', (_t, msg) => received.push(msg.toString()))

    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await waitForConnected(c)

    const result = await c.sendCommand({ kind: 'pause' })
    expect(result).toEqual({ ok: true })
    await waitFor(() => received.some((m) => JSON.parse(m).print?.command === 'pause'), 'command pause diterima subscriber')

    await c.stop()
    sub.end()
  })

  it('setSpeedLevel -> command print_speed dengan param level (string)', async () => {
    const received: string[] = []
    const sub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => sub.on('connect', () => res()))
    await sub.subscribeAsync('device/SER1/request')
    sub.on('message', (_t, msg) => received.push(msg.toString()))

    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await waitForConnected(c)

    await c.sendCommand({ kind: 'setSpeedLevel', level: 3 })
    await waitFor(() => received.some((m) => JSON.parse(m).print?.command === 'print_speed'), 'command print_speed diterima subscriber')

    const speedMsg = received.find((m) => JSON.parse(m).print?.command === 'print_speed')
    expect(JSON.parse(speedMsg!).print.param).toBe('3')

    await c.stop()
    sub.end()
  })

  it('belum connect -> {ok:false, message:"printer_offline"}, tak publish apa pun', async () => {
    const c = new BambuMqttConnector(mars, { urlOverride: 'mqtt://127.0.0.1:1' })
    const result = await c.sendCommand({ kind: 'stop' })
    expect(result).toEqual({ ok: false, message: 'printer_offline' })
    await c.stop()
  })

  it('command kind yang tak didukung Bambu (mis. setSpeedPercent, punya Moonraker) -> unsupported_command', async () => {
    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await waitForConnected(c)
    const result = await c.sendCommand({ kind: 'setSpeedPercent', percent: 100 })
    expect(result).toEqual({ ok: false, message: 'unsupported_command' })
    await c.stop()
  })

  it('startPrint -> publish command project_file dengan filename dan plate_idx', async () => {
    const received: string[] = []
    const sub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => sub.on('connect', () => res()))
    await sub.subscribeAsync('device/SER1/request')
    sub.on('message', (_t, msg) => received.push(msg.toString()))

    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await new Promise((r) => setTimeout(r, 100))

    const result = await c.sendCommand({ kind: 'startPrint', filename: '/model.gcode.3mf', plateIndex: 2 })
    await new Promise((r) => setTimeout(r, 100))

    expect(result).toEqual({ ok: true })
    const startMsg = received.find((m) => JSON.parse(m).print?.command === 'project_file')
    expect(startMsg).toBeTruthy()
    const payload = JSON.parse(startMsg!)
    expect(payload.print.param).toBe('/model.gcode.3mf')
    expect(payload.print.plate_idx).toBe(2)

    await c.stop()
    sub.end()
  })

  it('setSpeedLevel invalid (bukan 1-4) -> unsupported_command, tak publish apa pun', async () => {
    const received: string[] = []
    const sub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => sub.on('connect', () => res()))
    await sub.subscribeAsync('device/SER1/request')
    sub.on('message', (_t, msg) => received.push(msg.toString()))

    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await waitForConnected(c)

    const zero = await c.sendCommand({ kind: 'setSpeedLevel', level: 0 as unknown as 1 | 2 | 3 | 4 })
    const five = await c.sendCommand({ kind: 'setSpeedLevel', level: 5 as unknown as 1 | 2 | 3 | 4 })
    await new Promise((r) => setTimeout(r, 100))

    expect(zero).toEqual({ ok: false, message: 'unsupported_command' })
    expect(five).toEqual({ ok: false, message: 'unsupported_command' })
    expect(received.find((m) => JSON.parse(m).print?.command === 'print_speed')).toBeUndefined()

    await c.stop()
    sub.end()
  })
})
