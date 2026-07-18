export type ConnectorKind = 'bambu' | 'moonraker'

export interface DeviceConfig {
  id: string            // slug unik, mis. 'mars'
  name: string          // tampil di payload, mis. 'Mars'
  type: string          // model, mis. 'P1P' — sumber kolom `type` payload
  connector: ConnectorKind
  ip: string
  serial?: string       // wajib utk bambu (topic device/<serial>/report)
  accessCode?: string   // wajib utk bambu (password MQTT user 'bblp')
}

export type PrinterState = 'running' | 'pause' | 'finish' | 'error' | 'idle'

export interface HmsEntry { attr: number; code: number }

export interface NormalizedStatus {
  deviceId: string
  state: PrinterState
  gcodeState: string        // mentah uppercase; '' jika tidak ada di message
  progress: number
  file: string
  taskId: string
  remainingMin: number
  printError: number
  mcPrintErrorCode: string
  failReason: string
  hms: HmsEntry[]
  errorDetails: string      // gaya n8n Capture Event: "hms=... | print_error=N | mc_print_error_code=M"
  eventTime: string         // ISO
}

export type PrinterEventKind = 'started' | 'error' | 'finished'

export interface PrinterEvent {
  deviceId: string
  kind: PrinterEventKind
  status: NormalizedStatus
  prevState: string
}

export interface StoredState {
  name: string
  type: string
  last_state: string
  last_progress: number
  last_remaining_min: number
  last_task_id: string
  last_filename: string
  last_error_code: string
  last_seen_at: string | null
}

// Kontrak CYD — JANGAN diubah (spec §2)
export interface PrinterRow {
  id: string
  name: string
  type: string
  state: string             // PrinterState | 'OFFLINE'
  progress: number
  remaining_min: number
  filename: string
  error_msg: string
  last_seen: string | null
}
export interface PrintersPayload { payload: PrinterRow[] }
