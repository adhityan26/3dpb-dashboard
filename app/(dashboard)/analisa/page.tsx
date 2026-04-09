"use client"

import { useState } from "react"
import { AnalyticsKpiBar } from "@/components/analytics/AnalyticsKpiBar"
import { SalesTrendChart } from "@/components/analytics/SalesTrendChart"
import { TopProductsChart } from "@/components/analytics/TopProductsChart"
import { ProfitCard } from "@/components/analytics/ProfitCard"
import { AdsRangeSelector } from "@/components/ads/AdsRangeSelector"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import { useAnalytics } from "@/lib/hooks/use-analytics"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import type { AnalyticsRange } from "@/lib/analytics/service"

export default function AnalisaPage() {
  const [range, setRange] = useState<AnalyticsRange>("7d")
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useAnalytics(range)

  if (isLoading && !data) {
    return (
      <div className="py-12 text-center text-gray-400">Memuat analisa...</div>
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
        <h1 className="text-xl font-semibold">Analisa</h1>
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

      <AnalyticsKpiBar kpi={data.kpi} />

      <SalesTrendChart daily={data.daily} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopProductsChart products={data.topProducts} />
        <ProfitCard kpi={data.kpi} />
      </div>
    </div>
  )
}
