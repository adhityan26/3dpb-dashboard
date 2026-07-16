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
})
