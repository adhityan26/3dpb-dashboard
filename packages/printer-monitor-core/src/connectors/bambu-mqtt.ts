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

    // Subscribe + pushall pada SETIAP event 'connect' (termasuk reconnect setelah printer nyala lagi)
    this.client.on('connect', () => {
      this.client!.subscribe(reportTopic)
      pushall()
    })

    // Printer mati/unreachable TIDAK BOLEH menggagalkan start() (ECONNREFUSED) atau
    // menggantungnya (TCP timeout) — mqtt.js sudah reconnectPeriod:5000 dan akan terus
    // mencoba di background. Staleness→OFFLINE (payload.ts) yang menangani printer mati,
    // bukan crash proses. Error cukup di-log, jangan reject.
    this.client.on('error', (err) => {
      console.error(`[bambu-mqtt ${this.device.id}]`, err.message)
    })

    // Timer pushall independen dari status koneksi saat ini (guard: publish hanya kalau connected)
    this.timer = setInterval(() => {
      if (this.client?.connected) pushall()
    }, this.opts.pushallIntervalMs ?? 300_000)

    return Promise.resolve()
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    // force=true: hentikan reconnect loop mqtt.js segera meski koneksi belum pernah sukses
    // (mis. sedang mencoba connect ke printer mati) — cegah handle tersisa setelah stop().
    await this.client?.endAsync(true)
    this.client = null
  }
}
