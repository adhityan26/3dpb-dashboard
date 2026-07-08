"use client"

import { useState } from "react"
import { AdsKpiBar } from "@/components/ads/AdsKpiBar"
import { AdsTable } from "@/components/ads/AdsTable"
import { AdRecommendationList } from "@/components/ads/AdRecommendationList"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import { DateRangeSelector } from "@/components/ui/DateRangeSelector"
import { useAds } from "@/lib/hooks/use-ads"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { FlexRange } from "@/lib/dateRange"

export default function IklanPage() {
  const [range, setRange] = useState<FlexRange>("7d")
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
      <GlassPageHeader title="Iklan" subtitle="Performa iklan Shopee hari ini">
        <RefreshIndicator
          lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
          intervalMs={intervalMs}
          onRefresh={() => refetch()}
        />
      </GlassPageHeader>

      <DateRangeSelector value={range} onChange={setRange} />

      <AdsKpiBar kpi={data.kpi} />

      <AdRecommendationList ads={data.ads} />

      <AdsTable ads={data.ads} />
    </div>
  )
}
