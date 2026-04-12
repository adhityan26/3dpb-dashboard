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

export interface AmsSlotData {
  id: string
  productType: ProductType
  variantName: string
  slotNumber: number
  filamentName: string
  spoolId: string | null
  spool: Pick<SpoolData, 'id' | 'barcode' | 'status' | 'colorHex' | 'brand' | 'colorName'> | null
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
