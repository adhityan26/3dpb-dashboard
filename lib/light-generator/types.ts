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
  isInternal: boolean
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
  /** Raw technical config JSON string from original LG order (operator starting point) */
  configJsonRaw?: string | null
  silhouetteImage: { asset: { _ref: string } }
  floorInsertImage?: { asset: { _ref: string } } | null
  submittedAt: string
}

export type SanityLgOrderWithConfirmed = SanityLgOrder & { isConfirmed: boolean }

/**
 * Default generator config for operator-created (internal) orders.
 * Single source of truth — seeds the order's configJson so the editor
 * opens with sane values instead of blank fields.
 */
export const DEFAULT_LG_CONFIG = {
  outer_radius: 100,
  base_radius: 100,
  shell_height: null,        // null = auto
  shell_thickness: 3,
  base_thickness: 2,
  casing_lift: 0,
  floor_half_size: 600,
  shadow_offset_x: 0,
  shadow_offset_y: 0,
  light_x: 0,
  light_y: 0,
  light_z_offset: 10,
  edge_smooth_sigma: 2,
  shadow_threshold: 0,
  n_stencil_theta: 2048,
  n_stencil_z: 64,
  support_stems: true,
  stem_width: 2,
  min_bridge_mm: 1.2,
} as const
