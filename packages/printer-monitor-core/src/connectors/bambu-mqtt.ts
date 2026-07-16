import mqtt, { type MqttClient } from 'mqtt'
import type { Connector } from '../engine'
import type { DeviceConfig, NormalizedStatus } from '../types'
import { normalizeBambu } from '../normalize-bambu'

const PUSHALL = JSON.stringify({
  pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 },
  user_id: '3dpb',
})

export interface BambuConnectorOpts { pushallIntervalMs?: number; urlOverride?: string }

export class BambuMqttConnector implements Connector {
  readonly deviceId: string
  private client: MqttClient | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(private device: DeviceConfig, private opts: BambuConnectorOpts = {}) {
    if (!device.serial || !device.accessCode) throw new Error(`bambu device ${device.id} butuh serial+accessCode`)
    this.deviceId = device.id
  }

  start(onStatus: (s: NormalizedStatus) => void): Promise<void> {
    const url = this.opts.urlOverride ?? `mqtts://${this.device.ip}:8883`
    return new Promise((res, rej) => {
      this.client = mqtt.connect(url, {
        username: 'bblp', password: this.device.accessCode,
        rejectUnauthorized: false, reconnectPeriod: 5000,
      })
      const reportTopic = `device/${this.device.serial}/report`
      const requestTopic = `device/${this.device.serial}/request`
      const pushall = () => this.client?.publish(requestTopic, PUSHALL)

      // Set up message handler first
      this.client.on('message', (_t, msg) => {
        try { onStatus(normalizeBambu(this.device.id, JSON.parse(msg.toString()))) }
        catch { /* frame non-JSON: abaikan */ }
      })

      // Set up connection handlers
      this.client.on('connect', () => {
        this.client!.subscribe(reportTopic)
        pushall()
      })
      this.client.once('connect', () => {
        this.timer = setInterval(pushall, this.opts.pushallIntervalMs ?? 300_000)
        res()
      })

      // Set up error handlers
      this.client.once('error', (e) => rej(e))
      this.client.on('error', (err) => {
        console.error(`[bambu-mqtt ${this.device.id}]`, err.message)
      })
    })
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.client?.endAsync()
    this.client = null
  }
}
