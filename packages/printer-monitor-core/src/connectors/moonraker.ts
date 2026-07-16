import type { Connector } from '../engine'
import type { DeviceConfig, NormalizedStatus } from '../types'
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
    const tick = async () => {
      try {
        const res = await f(url)
        if (!res.ok) throw new Error(`moonraker ${res.status}`)
        onStatus(normalizeMoonraker(this.device.id, await res.json()))
      } catch { /* printer/moonraker mati: staleness yang menandai OFFLINE */ }
    }
    await tick()
    this.timer = setInterval(() => void tick(), this.opts.pollIntervalMs ?? 60_000)
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
