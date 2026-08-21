import type { CommandResult, DeviceConfig, NormalizedStatus, PrinterCommand, PrinterEvent, PrintersPayload } from './types'
import { captureEvent } from './capture-event'
import { StateStore } from './state-store'
import { buildPrintersPayload, DEFAULT_STALE_AFTER_MS } from './payload'
import { HmsLookup } from './hms'

export interface Connector {
  readonly deviceId: string
  start(onStatus: (s: NormalizedStatus) => void): void | Promise<void>
  stop(): void | Promise<void>
  sendCommand(cmd: PrinterCommand): Promise<CommandResult>
}
export interface Reporter {
  publishStatus(p: PrintersPayload): void | Promise<void>
  emitEvent(e: PrinterEvent): void | Promise<void>
}
export interface Notifier {
  notify(e: PrinterEvent, ctx: { printerName: string; hmsText: string[] }): void | Promise<void>
}
export interface EngineOpts {
  devices: DeviceConfig[]
  connectors: Connector[]
  reporters: Reporter[]
  notifiers?: Notifier[]
  hms?: HmsLookup
  staleAfterMs?: number
  republishIntervalMs?: number
  now?: () => number
}

export class Engine {
  private hms: HmsLookup
  private store: StateStore
  private timer: ReturnType<typeof setInterval> | null = null
  private deviceById: Map<string, DeviceConfig>
  private connectorById: Map<string, Connector>
  constructor(private opts: EngineOpts) {
    this.deviceById = new Map(opts.devices.map((d) => [d.id, d]))
    this.connectorById = new Map(opts.connectors.map((c) => [c.deviceId, c]))
    this.hms = opts.hms ?? new HmsLookup()
    this.store = new StateStore(this.hms)
  }

  async sendCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult> {
    const connector = this.connectorById.get(deviceId)
    if (!connector) return { ok: false, message: 'device_not_found' }
    return connector.sendCommand(cmd)
  }

  snapshot(): PrintersPayload {
    const now = this.opts.now?.() ?? Date.now()
    return buildPrintersPayload(this.opts.devices, this.store, now,
      this.opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS)
  }

  async handleStatus(s: NormalizedStatus): Promise<void> {
    const device = this.deviceById.get(s.deviceId)
    if (!device) return
    if (device.connector === 'bambu' && !s.gcodeState) return // gate If n8n

    const prev = this.store.get(device.id)
    const { event } = captureEvent(s, prev)
    this.store.upsertFromStatus(device, s, event)

    if (event) {
      const e: PrinterEvent = { deviceId: device.id, kind: event, status: s, prevState: prev?.last_state ?? 'idle' }
      const hmsText = this.hms.translate(s.hms)
      for (const r of this.opts.reporters) {
        try { await r.emitEvent(e) }
        catch (err) { console.error('[reporter]', err) }
      }
      for (const n of this.opts.notifiers ?? []) {
        try { await n.notify(e, { printerName: device.name, hmsText }) }
        catch (err) { console.error('[notifier]', err) }
      }
    }
    await this.publish()
  }

  private async publish(): Promise<void> {
    const p = this.snapshot()
    for (const r of this.opts.reporters) {
      try { await r.publishStatus(p) }
      catch (err) { console.error('[reporter]', err) }
    }
  }

  async start(): Promise<void> {
    // Satu connector gagal start() (throw/reject -- mis. BambuMqttConnector menolak device
    // dengan serial/accessCode kosong) TIDAK BOLEH menghentikan connector LAIN dari start().
    // Tanpa guard ini, satu device dengan secret salah bikin SELURUH Engine gagal ter-start,
    // menjatuhkan monitoring utk SEMUA device lain yang sebenarnya baik-baik saja (real
    // incident: user pairing 1 device Klipper ke slot device ber-type "bambu", serial kosong
    // -> BambuMqttConnector throw -> semua printer, termasuk yang sudah benar, jadi tak
    // termonitor).
    for (const c of this.opts.connectors) {
      try {
        await c.start((s) => void this.handleStatus(s))
      } catch (err) {
        console.error(`[engine] connector ${c.deviceId} gagal start -- device lain tetap lanjut`, err)
      }
    }
    this.timer = setInterval(() => void this.publish(), this.opts.republishIntervalMs ?? 60_000)
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const c of this.opts.connectors) await c.stop()
  }
}
