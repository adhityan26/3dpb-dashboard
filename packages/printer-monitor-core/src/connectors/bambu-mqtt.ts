import mqtt, { type MqttClient } from 'mqtt'
import type { Connector } from '../engine'
import type { CommandResult, DeviceConfig, NormalizedStatus, PrinterCommand } from '../types'
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

  async sendCommand(cmd: PrinterCommand): Promise<CommandResult> {
    if (!this.client?.connected) return { ok: false, message: 'printer_offline' }
    const requestTopic = `device/${this.device.serial}/request`
    let payload: Record<string, unknown>
    switch (cmd.kind) {
      case 'pause':
        payload = { print: { sequence_id: '0', command: 'pause' } }
        break
      case 'resume':
        payload = { print: { sequence_id: '0', command: 'resume' } }
        break
      case 'stop':
        payload = { print: { sequence_id: '0', command: 'stop' } }
        break
      case 'setSpeedLevel':
        payload = { print: { sequence_id: '0', command: 'print_speed', param: String(cmd.level) } }
        break
      default:
        return { ok: false, message: 'unsupported_command' }
    }
    try {
      await this.client.publishAsync(requestTopic, JSON.stringify(payload))
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'publish_failed' }
    }
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
