export interface OrderItemSummary {
  productName: string
  variantName: string | null
  sku: string | null
  qty: number
  unitPrice: number
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
}

export interface OrderListResult {
  orders: OrderSummary[]
  kpi: {
    total: number
    belumCetak: number
    sudahCetak: number
  }
  fetchedAt: string
}
