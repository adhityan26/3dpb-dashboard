import { shopeeRequest } from "./client"
import type {
  ShopeeAdDailyRow,
  ShopeeAdsDailyPerformanceResponse,
} from "./types"

/**
 * Get daily performance for all CPC/GMV-Max ads in a date range.
 * Range max is typically 30 days per Shopee's limits.
 */
export async function getAdsDailyPerformance(params: {
  startDate: string
  endDate: string
  pageSize?: number
  offset?: number
}): Promise<ShopeeAdDailyRow[]> {
  const query: Record<string, string | number> = {
    start_date: params.startDate,
    end_date: params.endDate,
    page_size: params.pageSize ?? 100,
    offset: params.offset ?? 0,
  }

  const json = await shopeeRequest<ShopeeAdsDailyPerformanceResponse>(
    "/api/v2/ads/get_all_cpc_ads_daily_performance",
    query,
  )

  return json.response.ad_performance_list ?? json.response.list ?? []
}

/**
 * Paginate through all results.
 */
export async function getAllAdsDailyPerformance(params: {
  startDate: string
  endDate: string
}): Promise<ShopeeAdDailyRow[]> {
  const all: ShopeeAdDailyRow[] = []
  let offset = 0
  const pageSize = 100
  let safety = 0

  while (safety < 50) {
    const page = await getAdsDailyPerformance({
      startDate: params.startDate,
      endDate: params.endDate,
      pageSize,
      offset,
    })
    all.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
    safety++
  }

  return all
}
