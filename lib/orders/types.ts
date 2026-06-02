export interface OrderItemSummary {
  productName: string
  variantName: string | null
  sku: string | null
  qty: number
  unitPrice: number
  imageUrl: string | null
}

export interface OrderSummary {
  orderSn: string
  shopeeStatus: string
  createTime: number
  updateTime: number
  totalAmount: number
  currency: string
  buyerUsername: string | null
  items: OrderItemSummary[]
  labelPrinted: boolean
  labelPrintedAt: string | null
  labelPrintedBy: string | null
  isPreOrder: boolean
  shipByDate: number | null
}

export interface OrderListResult {
  orders: OrderSummary[]
  kpi: {
    total: number
    orderBaru: number
    perluCetak: number
    sudahDiproses: number
  }
  fetchedAt: string
}
