// lib/strava/types.ts

export type StravaStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled'

export interface StravaOrderItem {
  productName: string
  quantity: number
  unitPrice: number  // in cents (Rp)
  notes?: string
}

export interface StravaOrder {
  id: string
  orderId: string
  sanityDocId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string
  items: StravaOrderItem[]
  totalAmount: number  // in cents (Rp)
  status: StravaStatus
  statusChangedAt?: Date
  operatorNotes?: string
  resultPhotoKeys: string[]
  submittedAt: Date
  confirmedAt?: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface StravaOrderWithPhotos extends StravaOrder {
  resultPhotos: Array<{
    key: string
    minioUrl: string
    sanityUrl?: string
    expired?: boolean
  }>
}

export interface CreateStravaOrderInput {
  customerName: string
  customerEmail: string
  customerPhone?: string
  items: StravaOrderItem[]
  totalAmount: number
}
