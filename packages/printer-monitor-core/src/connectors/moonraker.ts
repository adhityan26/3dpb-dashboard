import type { Connector } from '../engine'
import type { CommandResult, DeviceConfig, NormalizedStatus, PrinterCommand } from '../types'
import { normalizeMoonraker } from '../normalize-moonraker'

export interface MoonrakerConnectorOpts { pollIntervalMs?: number; fetchImpl?: typeof fetch }

export class MoonrakerConnector implements Connector {
  readonly deviceId: string
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(private device: DeviceConfig, private opts: MoonrakerConnectorOpts = {}) {
    this.deviceId = device.id
  }
  async start(onStatus: (s: NormalizedStatus) => void): Promise<void> {
    const f = this.opts.fetchImpl ?? fetch
    const url = `http://${this.device.ip}/printer/objects/query?print_stats&virtual_sdcard&display_status`
    // extruder/heater_bed SENGAJA di-query terpisah dari status utama di atas: Moonraker
    // membalas error utk SELURUH query gabungan kalau salah satu object yang diminta tidak
    // ada di config Klipper printer itu (mis. printer tanpa heated bed, atau nama section
    // beda dari "heater_bed" standar) -- kalau digabung jadi satu request, printer semacam
    // itu bukan cuma kehilangan data suhu, statusnya (state/progress) ikut berhenti
    // ter-update sama sekali (dianggap poll gagal, staleness->OFFLINE). Dipisah + try/catch
    // sendiri: kegagalan suhu tak pernah menjatuhkan status utama.
    const tempUrl = `http://${this.device.ip}/printer/objects/query?extruder&heater_bed`
    const tick = async () => {
      try {
        const res = await f(url)
        if (!res.ok) throw new Error(`moonraker ${res.status}`)
        const body = (await res.json()) as { result?: { status?: Record<string, unknown> } }

        try {
          const tempRes = await f(tempUrl)
          if (tempRes.ok) {
            const tempBody = (await tempRes.json()) as { result?: { status?: Record<string, unknown> } }
            body.result = { ...body.result, status: { ...body.result?.status, ...tempBody.result?.status } }
          }
        } catch { /* suhu opsional -- abaikan, status utama tetap jalan tanpa data suhu */ }

        onStatus(normalizeMoonraker(this.device.id, body))
      } catch { /* printer/moonraker mati: staleness yang menandai OFFLINE */ }
    }
    await tick()
    this.timer = setInterval(() => void tick(), this.opts.pollIntervalMs ?? 60_000)
  }
  async sendCommand(cmd: PrinterCommand): Promise<CommandResult> {
    const f = this.opts.fetchImpl ?? fetch
    let url: string
    let init: RequestInit
    switch (cmd.kind) {
      case 'pause':
        url = `http://${this.device.ip}/printer/print/pause`
        init = { method: 'POST', signal: AbortSignal.timeout(10_000) }
        break
      case 'resume':
        url = `http://${this.device.ip}/printer/print/resume`
        init = { method: 'POST', signal: AbortSignal.timeout(10_000) }
        break
      case 'stop':
        url = `http://${this.device.ip}/printer/print/cancel`
        init = { method: 'POST', signal: AbortSignal.timeout(10_000) }
        break
      case 'setSpeedPercent': {
        const pct = Math.round(Number(cmd.percent))
        if (!Number.isFinite(pct) || pct < 20 || pct > 200) return { ok: false, message: 'unsupported_command' }
        url = `http://${this.device.ip}/printer/gcode/script`
        init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: `M220 S${pct}` }),
          signal: AbortSignal.timeout(10_000),
        }
        break
      }
      default:
        return { ok: false, message: 'unsupported_command' }
    }
    try {
      const res = await f(url, init)
      if (!res.ok) return { ok: false, message: `moonraker_${res.status}` }
      return { ok: true }
    } catch (err) {
      // Kegagalan network-class (fetch gak bisa connect sama sekali, atau timeout dari
      // AbortSignal.timeout di atas) -- printer TIDAK terjangkau. Bedakan dari respons
      // non-2xx (di atas, res.ok false): itu artinya printer NYALA & jawab, cuma nolak
      // request. Map ke literal 'printer_offline' yang sama dgn BambuMqttConnector supaya
      // commandErrorMessage() di UI kasih pesan presisi yang sama utk kondisi yang sama,
      // bukan cuma utk Bambu.
      if (err instanceof TypeError) return { ok: false, message: 'printer_offline' }
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        return { ok: false, message: 'printer_offline' }
      }
      return { ok: false, message: err instanceof Error ? err.message : 'network_error' }
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
