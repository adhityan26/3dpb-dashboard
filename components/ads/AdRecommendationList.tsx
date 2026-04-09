"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { AdSummary } from "@/lib/ads/types"

interface Props {
  ads: AdSummary[]
}

const KIND_LABEL: Record<string, { title: string; color: string }> = {
  pause: { title: "Stop Dulu", color: "text-red-600" },
  scale_up: { title: "Naikkan Budget", color: "text-green-600" },
  reactivate: { title: "Aktifkan Kembali", color: "text-blue-600" },
  review: { title: "Perlu Review", color: "text-amber-600" },
}

export function AdRecommendationList({ ads }: Props) {
  const withRecs = ads.filter((a) => a.recommendation.kind !== "none")

  if (withRecs.length === 0) {
    return null
  }

  const grouped = new Map<string, AdSummary[]>()
  for (const ad of withRecs) {
    const kind = ad.recommendation.kind
    const list = grouped.get(kind) ?? []
    list.push(ad)
    grouped.set(kind, list)
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">💡 Rekomendasi</h3>
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([kind, list]) => {
            const meta = KIND_LABEL[kind]
            if (!meta) return null
            return (
              <div key={kind}>
                <div className={`text-xs font-semibold ${meta.color} mb-1`}>
                  {meta.title} ({list.length})
                </div>
                <ul className="space-y-1">
                  {list.slice(0, 5).map((ad) => (
                    <li key={ad.campaignId} className="text-xs text-gray-600">
                      <span className="font-medium">{ad.adName}</span> —{" "}
                      <span className="text-gray-500">
                        {ad.recommendation.reason}
                      </span>
                    </li>
                  ))}
                  {list.length > 5 && (
                    <li className="text-xs text-gray-400">
                      +{list.length - 5} iklan lain
                    </li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
