export type RoasCategory = "good" | "medium" | "bad"
export type AdStatus = "berjalan" | "dijeda" | "berakhir" | "unknown"

export type AdRecommendationKind =
  | "pause"
  | "scale_up"
  | "reactivate"
  | "review"
  | "none"

export interface AdRecommendation {
  kind: AdRecommendationKind
  reason: string
}

export interface AdSummary {
  campaignId: number
  adName: string
  biddingMethod: string
  campaignType: string
  status: AdStatus
  itemName: string | null
  impression: number
  clicks: number
  ctr: number
  expense: number
  omzet: number
  orders: number
  itemsSold: number
  roas: number
  acos: number
  roasCategory: RoasCategory
  recommendation: AdRecommendation
  daily: Array<{ date: string; expense: number; omzet: number; roas: number }>
}

export interface AdsListResult {
  ads: AdSummary[]
  kpi: {
    totalAds: number
    totalSpend: number
    totalOmzet: number
    totalRoas: number
    adsRugi: number
    adsGoodCount: number
  }
  range: { startDate: string; endDate: string }
  fetchedAt: string
}
