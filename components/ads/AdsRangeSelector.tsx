"use client"

import { Button } from "@/components/ui/button"
import type { AdsRange } from "@/lib/ads/service"

interface Props {
  value: AdsRange
  onChange: (value: AdsRange) => void
}

const OPTIONS: Array<{ key: AdsRange; label: string }> = [
  { key: "7d", label: "7 Hari" },
  { key: "30d", label: "30 Hari" },
]

export function AdsRangeSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border bg-white p-1 gap-1">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.key
        return (
          <Button
            key={opt.key}
            variant={isActive ? "default" : "ghost"}
            size="sm"
            onClick={() => onChange(opt.key)}
            className={
              isActive
                ? "bg-[#EE4D2D] hover:bg-[#d44226] text-white h-8"
                : "h-8"
            }
          >
            {opt.label}
          </Button>
        )
      })}
    </div>
  )
}
