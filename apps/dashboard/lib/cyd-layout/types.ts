// lib/cyd-layout/types.ts
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

// Persis dari build-config.ts v1 — dipertahankan sebagai preset field per-sel/per-halaman.
export const FIELD_PRESETS = {
  ringkas: [['name'], ['state', 'progress'], ['progressBar']] as FieldRow[],
  detail: [
    ['name', 'type'],
    ['state', 'progress'],
    ['progressBar'],
    [{ id: 'timeLeft', label: 'Sisa' }, { id: 'eta', label: 'ETA' }],
    ['filename'],
  ] as FieldRow[],
} as const

export type FieldPresetKey = keyof typeof FIELD_PRESETS

// Batas validasi — cocok MAX_* di firmware layout_types.h
// (~/Documents/Project/3pb-monitoring-display/apps/internal/src/layout/layout_types.h)
export const LAYOUT_LIMITS = {
  maxPages: 8,
  maxCellsPerPage: 24,
  maxGridRows: 8,
  maxFieldsPerRow: 3,
  maxRowsPerFieldsPageDefault: 8,
  maxRowsPerFieldsCellOverride: 3,
} as const
