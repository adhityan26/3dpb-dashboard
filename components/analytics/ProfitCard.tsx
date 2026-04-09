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

export function ProfitCard({ kpi }: Props) {
  const hasNetProfit = kpi.netProfit !== null
  const coveragePercent = Math.round(kpi.hppCoverage * 100)

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">💰 Breakdown Laba</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Omzet</span>
            <span className="font-medium">{fmt(kpi.totalOmzet)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>− Ad Spend</span>
            <span>{fmt(kpi.totalAdSpend)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Laba Kotor</span>
            <span className="text-green-600">{fmt(kpi.grossProfit)}</span>
          </div>
          {hasNetProfit ? (
            <>
              <div className="flex justify-between text-red-600">
                <span>− HPP Produk</span>
                <span>
                  {fmt(
                    kpi.totalOmzet - kpi.totalAdSpend - (kpi.netProfit ?? 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold text-base">
                <span>Laba Bersih</span>
                <span className="text-green-700">
                  {fmt(kpi.netProfit ?? 0)}
                </span>
              </div>
            </>
          ) : (
            <div className="border-t pt-2 text-xs text-gray-400">
              Laba bersih belum bisa dihitung —{" "}
              {coveragePercent === 0
                ? "HPP produk belum diisi"
                : `hanya ${coveragePercent}% omzet yang punya data HPP`}
              . Atur HPP di tab Produk (tersedia di Plan 5).
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
