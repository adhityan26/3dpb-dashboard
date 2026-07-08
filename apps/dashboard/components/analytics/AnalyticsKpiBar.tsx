"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { AnalyticsData } from "@/lib/analytics/types"

interface Props {
  kpi: AnalyticsData["kpi"]
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n))
}

export function AnalyticsKpiBar({ kpi }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Omzet</div>
          <div className="text-xl font-bold text-[#EE4D2D]">
            {fmt(kpi.totalOmzet)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Pesanan</div>
          <div className="text-xl font-bold text-blue-600">
            {fmtNum(kpi.totalOrders)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            AOV {fmt(kpi.avgOrderValue)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Ad Spend</div>
          <div className="text-xl font-bold text-amber-600">
            {fmt(kpi.totalAdSpend)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            ROAS {kpi.overallRoas.toFixed(2)}x
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Laba Kotor</div>
          <div className="text-xl font-bold text-green-600">
            {fmt(kpi.grossProfit)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            = Omzet − Ad Spend
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
