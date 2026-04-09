export interface DailyPoint {
  date: string // "YYYY-MM-DD"
  omzet: number
  orders: number
  adSpend: number
}

export interface TopProduct {
  productName: string
  qty: number
  omzet: number
}

export interface AnalyticsData {
  range: { startDate: string; endDate: string }
  fetchedAt: string
  kpi: {
    totalOmzet: number
    totalOrders: number
    totalAdSpend: number
    overallRoas: number
    avgOrderValue: number
    grossProfit: number
    netProfit: number | null
    hppCoverage: number
  }
  daily: DailyPoint[]
  topProducts: TopProduct[]
}
