"use client"

import { useMemo, useState } from "react"
import type { AdSummary } from "@/lib/ads/types"
import { AdsTableRow } from "./AdsTableRow"

interface Props {
  ads: AdSummary[]
}

type SortKey = "expense" | "omzet" | "roas" | "acos"
type SortDir = "asc" | "desc"

const HEADERS: Array<{ key: SortKey | null; label: string; align?: "right" }> =
  [
    { key: null, label: "Iklan" },
    { key: null, label: "Status" },
    { key: "expense", label: "Spend", align: "right" },
    { key: "omzet", label: "Omzet", align: "right" },
    { key: "roas", label: "ROAS", align: "right" },
    { key: "acos", label: "ACOS", align: "right" },
    { key: null, label: "Terjual", align: "right" },
    { key: null, label: "Rekomendasi" },
  ]

export function AdsTable({ ads }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("expense")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const sorted = useMemo(() => {
    const copy = [...ads]
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      return sortDir === "desc" ? -diff : diff
    })
    return copy
  }, [ads, sortKey, sortDir])

  function toggleSort(key: SortKey | null) {
    if (!key) return
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  if (ads.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        Tidak ada iklan pada periode ini.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="min-w-full">
        <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
          <tr>
            {HEADERS.map((h) => (
              <th
                key={h.label}
                className={`px-3 py-2 font-medium ${h.align === "right" ? "text-right" : "text-left"} ${h.key ? "cursor-pointer hover:text-[#EE4D2D]" : ""}`}
                onClick={() => toggleSort(h.key)}
              >
                {h.label}
                {h.key === sortKey && (
                  <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((ad) => (
            <AdsTableRow key={ad.campaignId} ad={ad} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
