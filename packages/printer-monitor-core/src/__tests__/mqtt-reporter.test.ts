import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:net'
import Aedes from 'aedes'
import mqtt from 'mqtt'
import { MqttReporter } from '../reporters/mqtt'

let server: Server, port: number, aedes: InstanceType<typeof Aedes>

beforeAll(async () => {
  aedes = new Aedes()
  server = createServer(aedes.handle)
  await new Promise<void>((res) => server.listen(0, () => res()))
  port = (server.address() as { port: number }).port
})
afterAll(async () => { aedes.close(); server.close() })

describe('MqttReporter', () => {
  it('publishStatus retained ke statusTopic; emitEvent non-retained ke eventsTopic', async () => {
    const url = `mqtt://127.0.0.1:${port}`
    const rep = new MqttReporter({ url })
    await rep.connect()
    await rep.publishStatus({ payload: [] })
    await rep.emitEvent({ deviceId: 'mars', kind: 'started', prevState: 'idle', status: {} as never })
    await rep.close()

    // retained harus terkirim ke subscriber baru
    const sub = mqtt.connect(url)
    const got = await new Promise<{ topic: string; retain: boolean; body: string }>((res) => {
      sub.subscribe('3dpb/printers-v2')
      sub.on('message', (topic, msg, pkt) => res({ topic, retain: pkt.retain, body: msg.toString() }))
    })
    expect(got.topic).toBe('3dpb/printers-v2')
    expect(got.retain).toBe(true)
    expect(JSON.parse(got.body)).toEqual({ payload: [] })
    sub.end()
  })

  it('emitEvent non-retained ke eventsTopic', async () => {
    const url = `mqtt://127.0.0.1:${port}`
    const sub = mqtt.connect(url)
    await new Promise<void>((res) => sub.on('connect', () => sub.subscribe('3dpb/printer-events', () => res())))

    const gotP = new Promise<{ topic: string; retain: boolean; body: any }>((res) =>
      sub.on('message', (topic, msg, pkt) => res({ topic, retain: pkt.retain, body: JSON.parse(msg.toString()) })))

    const rep = new MqttReporter({ url })
    await rep.connect()
    await rep.emitEvent({ deviceId: 'mars', kind: 'started', prevState: 'idle', status: {} as never })
    const got = await gotP
    await rep.close()
    sub.end()

    expect(got.topic).toBe('3dpb/printer-events')
    expect(got.retain).toBe(false)
    expect(got.body).toMatchObject({ deviceId: 'mars', kind: 'started' })
  })
})
