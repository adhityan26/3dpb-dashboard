export interface LgConfigJson {
  size: "S" | "M" | "L"
  shape: "circle" | "square" | "triangle" | "rect" | "oval"
  shapeRatio: { width: number; height: number } | null
  shadowDiameter: number
  shadowOffsetX: number
  shadowOffsetY: number
  supportStems: boolean
}

export type LgStatus =
  | "submitted"
  | "paid"
  | "generating"
  | "ready"
  | "shipped"
  | "cancelled"

export interface LgOrder {
  id: string
  sanityDocId: string | null
  status: string
  statusNote: string | null
  customerName: string
  customerContact: string
  notesCustomer: string | null
  configJson: string
  imagePath: string
  configJsonOperator: string | null
  stlPath: string | null
  notesOperator: string | null
  additionalImagePath: string | null
  createdAt: string
  updatedAt: string
}

/** Sanity `lightGeneratorOrder` document shape */
export interface SanityLgOrder {
  _id: string
  orderId: string
  status: string
  customerName: string
  customerContact: string
  customerNotes?: string
  size: "S" | "M" | "L"
  shape: "circle" | "square" | "triangle" | "rect" | "oval"
  shapeRatio?: { width: number; height: number }
  shadowDiameter: number
  shadowOffsetX: number
  shadowOffsetY: number
  supportStems: boolean
  silhouetteImage: { asset: { _ref: string } }
  floorInsertImage?: { asset: { _ref: string } } | null
  submittedAt: string
}

export type SanityLgOrderWithConfirmed = SanityLgOrder & { isConfirmed: boolean }
