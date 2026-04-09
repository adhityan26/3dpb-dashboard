"use client"

import { Badge } from "@/components/ui/badge"
import type { AdSummary } from "@/lib/ads/types"

interface Props {
  ad: AdSummary
}

function fmtIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n))
}

const ROW_BG: Record<AdSummary["roasCategory"], string> = {
  good: "bg-green-50/50",
  medium: "bg-amber-50/40",
  bad: "bg-red-50/50",
}

const STATUS_COLOR: Record<AdSummary["status"], string> = {
  berjalan: "bg-green-100 text-green-800",
  dijeda: "bg-gray-100 text-gray-700",
  berakhir: "bg-red-100 text-red-800",
  unknown: "bg-gray-100 text-gray-500",
}

const RECOMMENDATION_COLOR: Record<string, string> = {
  pause: "bg-red-100 text-red-800",
  scale_up: "bg-green-100 text-green-800",
  reactivate: "bg-blue-100 text-blue-800",
  review: "bg-amber-100 text-amber-800",
  none: "",
}

export function AdsTableRow({ ad }: Props) {
  const recColor = RECOMMENDATION_COLOR[ad.recommendation.kind]

  return (
    <tr className={`${ROW_BG[ad.roasCategory]} border-b`}>
      <td className="px-3 py-2 text-sm">
        <div className="font-medium truncate max-w-[240px]" title={ad.adName}>
          {ad.adName}
        </div>
        <div className="text-xs text-gray-500">{ad.biddingMethod}</div>
      </td>
      <td className="px-3 py-2">
        <Badge className={STATUS_COLOR[ad.status]}>{ad.status}</Badge>
      </td>
      <td className="px-3 py-2 text-sm text-right">{fmtIdr(ad.expense)}</td>
      <td className="px-3 py-2 text-sm text-right">{fmtIdr(ad.omzet)}</td>
      <td className="px-3 py-2 text-sm text-right font-bold">
        {ad.roas.toFixed(2)}x
      </td>
      <td className="px-3 py-2 text-sm text-right text-gray-600">
        {ad.acos.toFixed(1)}%
      </td>
      <td className="px-3 py-2 text-sm text-right text-gray-600">
        {fmtNum(ad.itemsSold)}
      </td>
      <td className="px-3 py-2">
        {ad.recommendation.kind !== "none" ? (
          <div
            className={`text-xs px-2 py-1 rounded ${recColor}`}
            title={ad.recommendation.reason}
          >
            {ad.recommendation.kind}
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
    </tr>
  )
}
