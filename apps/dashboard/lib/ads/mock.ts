import type { ShopeeAdDailyRow } from "@/lib/shopee/types"

/**
 * Generate mock daily ads rows for sandbox/development when Shopee sandbox
 * shop has no ads module. Returns a realistic distribution of ads with
 * varied ROAS so classifier and recommendation logic can be exercised.
 */
export function generateMockAdsRows(
  startDate: string, // DD-MM-YYYY
  endDate: string, // DD-MM-YYYY
): ShopeeAdDailyRow[] {
  const start = parseDdMmYyyy(startDate)
  const end = parseDdMmYyyy(endDate)

  const campaigns: Array<{
    campaign_id: number
    ad_name: string
    bidding_method: string
    ad_status: "berjalan" | "dijeda"
    item_name: string
    baselineExpense: number
    baselineRoas: number
  }> = [
    {
      campaign_id: 1001,
      ad_name: "Crocs Charm Jibbitz Swoosh Multicolor",
      bidding_method: "gmv_max_roas",
      ad_status: "berjalan",
      item_name: "Crocs Charm Jibbitz Swoosh Multicolor",
      baselineExpense: 120000,
      baselineRoas: 8.5,
    },
    {
      campaign_id: 1002,
      ad_name: "Aksesoris Sendal Fire Wave",
      bidding_method: "gmv_max_roas",
      ad_status: "berjalan",
      item_name: "Aksesoris Sendal Fire Wave",
      baselineExpense: 90000,
      baselineRoas: 7.2,
    },
    {
      campaign_id: 1003,
      ad_name: "Jibbitz Swoosh Side Logo (Sepasang)",
      bidding_method: "gmv_max_roas",
      ad_status: "berjalan",
      item_name: "Crocs Charm Jibbitz Swoosh Side Logo",
      baselineExpense: 50000,
      baselineRoas: 4.4,
    },
    {
      campaign_id: 1004,
      ad_name: "Aksesoris Sendal Dudukan Samping",
      bidding_method: "gmv_max_roas",
      ad_status: "berjalan",
      item_name: "3D Print Aksesoris Sendal Dudukan Samping",
      baselineExpense: 35000,
      baselineRoas: 7.5,
    },
    {
      campaign_id: 1005,
      ad_name: "MF Doom Mask Keychain",
      bidding_method: "gmv_max_auto",
      ad_status: "berjalan",
      item_name: "3D Print MF Doom Mask Keychain",
      baselineExpense: 15000,
      baselineRoas: 0.2, // losing money — will trigger review rec
    },
    {
      campaign_id: 1006,
      ad_name: "Demogorgon Keychain",
      bidding_method: "gmv_max_auto",
      ad_status: "berjalan",
      item_name: "3D Print Demogorgon Keychain",
      baselineExpense: 10000,
      baselineRoas: 0, // zero orders — will trigger review rec
    },
    {
      campaign_id: 1007,
      ad_name: "Fidget TNT & Creeper",
      bidding_method: "gmv_max_roas",
      ad_status: "berjalan",
      item_name: "Fidget TNT Creeper Keychain",
      baselineExpense: 800,
      baselineRoas: 38, // excellent — will trigger scale_up
    },
    {
      campaign_id: 1008,
      ad_name: "Crocs Jibbitz Side Logo (Dijeda)",
      bidding_method: "gmv_max_roas",
      ad_status: "dijeda",
      item_name: "Crocs Charm Jibbitz Side Logo (Dijeda)",
      baselineExpense: 60000,
      baselineRoas: 8.3, // paused but historically good — reactivate rec
    },
  ]

  const rows: ShopeeAdDailyRow[] = []
  const days = Math.ceil(
    (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
  ) + 1

  for (const c of campaigns) {
    for (let i = 0; i < days; i++) {
      const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      // Add some daily variation (±25%)
      const variance = 0.75 + Math.random() * 0.5
      const expense = Math.round((c.baselineExpense / days) * variance)
      const roas = c.baselineRoas * (0.85 + Math.random() * 0.3)
      const omzet = Math.round(expense * roas)
      const clicks = Math.round(expense / 800) // ~800 IDR CPC
      const impression = clicks * 25
      const itemsSold = Math.max(
        0,
        Math.round(omzet / 45000), // ~45k per item
      )

      rows.push({
        campaign_id: c.campaign_id,
        campaign_type: "product",
        bidding_method: c.bidding_method,
        ad_name: c.ad_name,
        ad_status: c.ad_status,
        date: formatDate(day),
        impression,
        clicks,
        ctr: impression > 0 ? (clicks / impression) * 100 : 0,
        expense,
        order_amount: omzet,
        direct_order_amount: Math.round(omzet * 0.7),
        roi: roas,
        direct_roi: roas * 0.7,
        item_sold: itemsSold,
        direct_item_sold: Math.round(itemsSold * 0.7),
        item_name: c.item_name,
      })
    }
  }

  return rows
}

function parseDdMmYyyy(s: string): Date {
  const [d, m, y] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
