import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:net'
import Aedes from 'aedes'
import mqtt from 'mqtt'
import { BambuMqttConnector } from '../connectors/bambu-mqtt'
import type { DeviceConfig, NormalizedStatus } from '../types'

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

    const pub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => pub.on('connect', () => res()))
    pub.publish('device/SER1/report', JSON.stringify({ print: { gcode_state: 'RUNNING', mc_percent: 7 } }))
    await new Promise((r) => setTimeout(r, 200))
    pub.end()
    await c.stop()

    expect(pushalls.length).toBeGreaterThanOrEqual(1)
    expect(JSON.parse(pushalls[0]).pushing.command).toBe('pushall')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ deviceId: 'mars', state: 'running', progress: 7 })
  })

  it('payload non-JSON di-skip tanpa crash', async () => {
    const got: NormalizedStatus[] = []
    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start((s) => void got.push(s))
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
    await new Promise((r) => setTimeout(r, 100))

    const result = await c.sendCommand({ kind: 'pause' })
    await new Promise((r) => setTimeout(r, 100))

    expect(result).toEqual({ ok: true })
    const pauseMsg = received.find((m) => JSON.parse(m).print?.command === 'pause')
    expect(pauseMsg).toBeTruthy()

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
    await new Promise((r) => setTimeout(r, 100))

    await c.sendCommand({ kind: 'setSpeedLevel', level: 3 })
    await new Promise((r) => setTimeout(r, 100))

    const speedMsg = received.find((m) => JSON.parse(m).print?.command === 'print_speed')
    expect(speedMsg).toBeTruthy()
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
    await new Promise((r) => setTimeout(r, 100))
    const result = await c.sendCommand({ kind: 'setSpeedPercent', percent: 100 })
    expect(result).toEqual({ ok: false, message: 'unsupported_command' })
    await c.stop()
  })
})
