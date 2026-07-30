export type FieldId = 'name' | 'type' | 'state' | 'progress' | 'progressBar' | 'timeLeft' | 'eta' | 'filename' | 'error'

export type FieldEntry = FieldId | { id: FieldId; label?: string }
export type FieldRow = FieldEntry[]

export interface LayoutCellPrinterOut {
  printer: string
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
  fields?: FieldRow[]
}

export interface LayoutCellLabelOut {
  type: 'label'
  text: string
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
}

export type LayoutCellOut = LayoutCellPrinterOut | LayoutCellLabelOut

export interface LayoutPageOut {
  id: string
  grid: { cols: number; rows: number; rowWeights?: number[] }
  fields: FieldRow[]
  durationSec: number
  cells: LayoutCellOut[]
}

export interface LayoutConfigOut {
  schemaVersion: 1
  pages: LayoutPageOut[]
}

// Batas validasi — cocok MAX_* di firmware layout_types.h
// (~/Documents/Project/3pb-monitoring-display/apps/internal/src/layout/layout_types.h)
export const LAYOUT_LIMITS = {
  maxPages: 8,
  maxCellsPerPage: 24,
  maxGridRows: 8,
  maxFieldsPerRow: 3,
  maxRowsPerFieldsPageDefault: 8,
  maxRowsPerFieldsCellOverride: 3,
  // Batas panjang string — cocok buffer firmware char[N] (kapasitas = N-1 sebelum null-terminator).
  // BARU: gap ini belum ada sebelumnya di apps/dashboard, ditambah di sini (dipakai KEDUA app).
  maxPrinterIdLength: 23,
  // Batas nilai `Device.model` (SaaS) yang dikirim Agent sebagai field `type` payload
  // 3dpb/printers — cocok kapasitas `char type[12]` firmware (11 byte efektif sebelum
  // null-terminator). BUKAN bagian validasi layout cell seperti limit lain di atas; dipakai
  // langsung oleh apps/saas/lib/devices/service.ts saat validasi input model.
  maxPrinterModelLength: 11,
  maxLabelLength: 15,
  maxLabelTextLength: 31,
  maxPageIdLength: 15,
} as const
