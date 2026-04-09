"use client"

import { useState } from "react"
import { AdsKpiBar } from "@/components/ads/AdsKpiBar"
import { AdsRangeSelector } from "@/components/ads/AdsRangeSelector"
import { AdsTable } from "@/components/ads/AdsTable"
import { AdRecommendationList } from "@/components/ads/AdRecommendationList"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import { useAds } from "@/lib/hooks/use-ads"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import type { AdsRange } from "@/lib/ads/service"

export default function IklanPage() {
  const [range, setRange] = useState<AdsRange>("7d")
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useAds(range)

  if (isLoading && !data) {
    return (
      <div className="py-12 text-center text-gray-400">Memuat iklan...</div>
    )
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    const needsConnect =
      msg.toLowerCase().includes("not authorized") ||
      msg.toLowerCase().includes("shop_id not found")
    return (
      <div className="py-12 text-center space-y-3">
        <div className="text-red-500">{msg}</div>
        {needsConnect && (
          <a
            href="/api/shopee/auth"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#EE4D2D] hover:bg-[#d44226] text-white text-sm font-medium"
          >
            Hubungkan Shopee
          </a>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Iklan</h1>
        <RefreshIndicator
          lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
          intervalMs={intervalMs}
          onRefresh={() => refetch()}
        />
      </div>

      <div className="flex items-center justify-between">
        <AdsRangeSelector value={range} onChange={setRange} />
        <div className="text-xs text-gray-500">
          {data.range.startDate} – {data.range.endDate}
        </div>
      </div>

      <AdsKpiBar kpi={data.kpi} />

      <AdRecommendationList ads={data.ads} />

      <AdsTable ads={data.ads} />
    </div>
  )
}
