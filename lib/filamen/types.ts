export type SpoolStatus = 'new' | 'full' | 'mid' | 'low' | 'empty'
export type ProductType = 'swoosh' | 'clickers'

export interface SpoolData {
  id: string
  brand: string
  material: string
  colorName: string
  colorHex: string
  status: SpoolStatus
  barcode: string
  nfcTagId: string | null
  notes: string
  createdAt: string
  updatedAt: string
  /** How many AMS slots this spool is assigned to */
  assignedSlotCount: number
  /** From linked SpoolmanSpool — grams used so far (null if no Spoolman record) */
  usedWeight: number | null
  /** From linked SpoolmanSpool — original full weight in grams (null if no record) */
  initialWeight: number | null
}

export interface SpoolsResponse {
  spools: SpoolData[]
  kpi: {
    total: number
    byStatus: Record<SpoolStatus, number>
  }
}

export interface FilamentCatalogEntry {
  id: string
  brand: string
  material: string
  colorName: string
  colorHex: string
}

export interface AmsAlternativeData {
  id: string
  type: 'specific' | 'general'
  catalogId: string | null
  catalogColorHex: string | null
  catalogBrand: string | null
  catalogMaterial: string | null
  catalogColorName: string | null
  brand: string | null
  material: string | null
}

export interface AmsSlotData {
  id: string
  productType: ProductType
  variantName: string
  slotNumber: number
  filamentName: string
  catalogColorHex: string | null   // auto-mapped from SpoolmanDB
  spoolId: string | null
  spool: Pick<SpoolData, 'id' | 'barcode' | 'status' | 'colorHex' | 'brand' | 'colorName'> | null
  alternatives: AmsAlternativeData[]
}

export interface PrinterData {
  id: string
  name: string
  model: string
  isActive: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AmsVariant {
  variantName: string
  slots: AmsSlotData[]
  hasLowSpool: boolean
}

export interface AmsSectionResponse {
  swoosh: AmsVariant[]
  clickers: AmsVariant[]
}

export const SPOOL_STATUS_COLORS: Record<SpoolStatus, string> = {
  new: '#818cf8',
  full: '#4ade80',
  mid: '#facc15',
  low: '#f97316',
  empty: '#6b7280',
}

export const SPOOL_STATUS_LABELS: Record<SpoolStatus, string> = {
  new: 'NEW',
  full: 'FULL',
  mid: 'MID',
  low: 'LOW',
  empty: 'EMPTY',
}
