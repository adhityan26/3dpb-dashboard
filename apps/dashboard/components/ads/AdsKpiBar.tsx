"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { AdsListResult } from "@/lib/ads/types"

interface Props {
  kpi: AdsListResult["kpi"]
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function AdsKpiBar({ kpi }: Props) {
  const roasColor =
    kpi.totalRoas >= 5
      ? "text-green-600"
      : kpi.totalRoas < 2
        ? "text-red-600"
        : "text-amber-600"

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">ROAS Total</div>
          <div className={`text-2xl font-bold ${roasColor}`}>
            {kpi.totalRoas.toFixed(2)}x
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Spend</div>
          <div className="text-2xl font-bold text-blue-600">
            {fmt(kpi.totalSpend)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Omzet</div>
          <div className="text-2xl font-bold text-[#EE4D2D]">
            {fmt(kpi.totalOmzet)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Iklan Rugi</div>
          <div className="text-2xl font-bold text-red-600">
            {kpi.adsRugi}
            <span className="text-sm font-normal text-gray-400">
              {" "}
              / {kpi.totalAds}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
