import type { DeviceConfig, NormalizedStatus, PrinterEventKind, StoredState } from './types'
import { storedStateFor } from './capture-event'
import { HmsLookup, describeError } from './hms'

export class StateStore {
  private m = new Map<string, StoredState>()
  constructor(private hms: HmsLookup = new HmsLookup()) {}
  get(id: string) { return this.m.get(id) }
  all() { return this.m }
  upsertFromStatus(device: DeviceConfig, s: NormalizedStatus, event: PrinterEventKind | null): StoredState {
    const row: StoredState = {
      name: device.name, type: device.type,
      last_state: storedStateFor(event, s),
      last_progress: s.progress,
      last_remaining_min: s.remainingMin,
      last_task_id: s.taskId,
      last_filename: s.file,
      last_error_code: s.errorDetails,
      // Bukan cuma `state === 'error'` literal -- Bambu kadang lapor gcode_state=PAUSE walau
      // print_error-nya non-zero (genuinely error, bukan pause manual biasa; kasus nyata:
      // printer "Uranus" P1S, relay dari sesi firmware CYD 2026-08-09). `state` di payload TAK
      // diubah paksa jadi 'error' -- itu keputusan tampilan firmware CYD sendiri; di sini cuma
      // memastikan error_message terisi supaya ADA teks buat firmware tampilkan.
      last_error_message: s.state === 'error' || s.printError !== 0 ? describeError(s.hms, s.printError, this.hms) : '',
      last_seen_at: s.eventTime,
      last_nozzle_temp: s.nozzleTemp,
      last_bed_temp: s.bedTemp,
    }
    this.m.set(device.id, row)
    return row
  }
}
