import mqtt, { type MqttClient } from 'mqtt'
import type { Reporter } from '../engine'
import type { PrinterEvent, PrintersPayload } from '../types'

export interface MqttReporterOpts {
  url: string
  statusTopic?: string
  eventsTopic?: string
  // Password CONNECT MQTT -- opsional (broker lain, mis. mosquitto homelab, tak butuh
  // ini). Kalau diisi, dikirim bareng username placeholder tetap ("agent") karena MQTT
  // 3.1.1 butuh username flag diset biar client library benar-benar mengirim password.
  password?: string
}

const MQTT_AUTH_USERNAME_PLACEHOLDER = 'agent'

export class MqttReporter implements Reporter {
  private client: MqttClient | null = null
  private statusTopic: string
  private eventsTopic: string
  constructor(private opts: MqttReporterOpts) {
    this.statusTopic = opts.statusTopic ?? '3dpb/printers-v2'
    this.eventsTopic = opts.eventsTopic ?? '3dpb/printer-events'
  }
  connect(): Promise<void> {
    return new Promise((res, rej) => {
      this.client = mqtt.connect(this.opts.url, {
        reconnectPeriod: 5000,
        ...(this.opts.password !== undefined
          ? { username: MQTT_AUTH_USERNAME_PLACEHOLDER, password: this.opts.password }
          : {}),
      })
      this.client.on('error', (err) => {
        console.error('[mqtt-reporter]', err.message)
        rej(err)
      })
      this.client.once('connect', () => res())
    })
  }
  async publishStatus(p: PrintersPayload): Promise<void> {
    await this.client?.publishAsync(this.statusTopic, JSON.stringify(p), { retain: true })
  }
  async emitEvent(e: PrinterEvent): Promise<void> {
    await this.client?.publishAsync(this.eventsTopic, JSON.stringify(e))
  }
  async close(): Promise<void> { await this.client?.endAsync() }
}
