import { getAllAdsDailyPerformance } from "@/lib/shopee/ads"
import type { ShopeeAdDailyRow } from "@/lib/shopee/types"
import { classifyRoas, computeRecommendation } from "./classifier"
import { generateMockAdsRows } from "./mock"
import type { AdSummary, AdsListResult, AdStatus } from "./types"

export type AdsRange = "7d" | "30d"

function formatShopeeDate(d: Date): string {
  // Shopee Ads API requires DD-MM-YYYY format.
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

function getDateRange(range: AdsRange): { startDate: string; endDate: string } {
  const now = new Date()
  const days = range === "7d" ? 7 : 30
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return { startDate: formatShopeeDate(start), endDate: formatShopeeDate(now) }
}

function normalizeStatus(status: string | undefined): AdStatus {
  if (!status) return "unknown"
  const lower = status.toLowerCase()
  if (lower.includes("jalan") || lower === "running") return "berjalan"
  if (lower.includes("jeda") || lower === "paused") return "dijeda"
  if (lower.includes("akhir") || lower === "ended") return "berakhir"
  return "unknown"
}

function firstNumber(...values: Array<number | undefined>): number {
  for (const v of values) {
    if (typeof v === "number" && !Number.isNaN(v)) return v
  }
  return 0
}

/**
 * Fetch ads performance for the given range and aggregate per campaign.
 */
export async function getAdsPerformance(
  range: AdsRange,
): Promise<AdsListResult> {
  const { startDate, endDate } = getDateRange(range)

  // Sandbox mode: use mock data when real Shopee Ads API is unavailable
  // (sandbox shops often don't have ads module). Set SHOPEE_MOCK_ADS=true
  // in .env.local to enable.
  const useMock = process.env.SHOPEE_MOCK_ADS === "true"
  const rows = useMock
    ? generateMockAdsRows(startDate, endDate)
    : await getAllAdsDailyPerformance({ startDate, endDate })

  // Group by campaign_id
  const byCampaign = new Map<number, ShopeeAdDailyRow[]>()
  for (const row of rows) {
    const list = byCampaign.get(row.campaign_id) ?? []
    list.push(row)
    byCampaign.set(row.campaign_id, list)
  }

  const ads: AdSummary[] = []
  for (const [campaignId, campaignRows] of byCampaign.entries()) {
    campaignRows.sort((a, b) => a.date.localeCompare(b.date))

    const expense = campaignRows.reduce(
      (s, r) => s + firstNumber(r.expense),
      0,
    )
    const omzet = campaignRows.reduce(
      (s, r) =>
        s + firstNumber(r.order_amount, r.broad_gmv, r.direct_order_amount),
      0,
    )
    const impression = campaignRows.reduce(
      (s, r) => s + firstNumber(r.impression),
      0,
    )
    const clicks = campaignRows.reduce((s, r) => s + firstNumber(r.clicks), 0)
    const itemsSold = campaignRows.reduce(
      (s, r) => s + firstNumber(r.item_sold, r.direct_item_sold),
      0,
    )
    const orders = itemsSold

    const roas = expense > 0 ? omzet / expense : 0
    const acos = omzet > 0 ? (expense / omzet) * 100 : 0
    const ctr = impression > 0 ? (clicks / impression) * 100 : 0
    const roasCategory = classifyRoas(roas)

    const latest = campaignRows[campaignRows.length - 1]
    const status = normalizeStatus(latest.ad_status)

    const dailyRoas = campaignRows.map((r) => {
      const dexp = firstNumber(r.expense)
      const domz = firstNumber(
        r.order_amount,
        r.broad_gmv,
        r.direct_order_amount,
      )
      return dexp > 0 ? domz / dexp : 0
    })

    const recommendation = computeRecommendation({
      status,
      roas,
      expense,
      orders,
      dailyRoas,
    })

    ads.push({
      campaignId,
      adName: latest.ad_name ?? `Iklan ${campaignId}`,
      biddingMethod: latest.bidding_method ?? "unknown",
      campaignType: latest.campaign_type ?? "unknown",
      status,
      itemName: latest.item_name ?? null,
      impression,
      clicks,
      ctr,
      expense,
      omzet,
      orders,
      itemsSold,
      roas,
      acos,
      roasCategory,
      recommendation,
      daily: campaignRows.map((r) => {
        const dexp = firstNumber(r.expense)
        const domz = firstNumber(
          r.order_amount,
          r.broad_gmv,
          r.direct_order_amount,
        )
        return {
          date: r.date,
          expense: dexp,
          omzet: domz,
          roas: dexp > 0 ? domz / dexp : 0,
        }
      }),
    })
  }

  ads.sort((a, b) => b.expense - a.expense)

  const totalSpend = ads.reduce((s, a) => s + a.expense, 0)
  const totalOmzet = ads.reduce((s, a) => s + a.omzet, 0)
  const totalRoas = totalSpend > 0 ? totalOmzet / totalSpend : 0
  const adsRugi = ads.filter((a) => a.roasCategory === "bad").length
  const adsGoodCount = ads.filter((a) => a.roasCategory === "good").length

  return {
    ads,
    kpi: {
      totalAds: ads.length,
      totalSpend,
      totalOmzet,
      totalRoas,
      adsRugi,
      adsGoodCount,
    },
    range: { startDate, endDate },
    fetchedAt: new Date().toISOString(),
  }
}
