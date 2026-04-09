"use client"

import { Button } from "@/components/ui/button"
import type { ProductFilterValue } from "./types"

interface Props {
  value: ProductFilterValue
  onChange: (value: ProductFilterValue) => void
  counts: Record<ProductFilterValue, number>
}

const OPTIONS: Array<{ key: ProductFilterValue; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "perlu_perhatian", label: "Perlu Perhatian" },
  { key: "stok_kritis", label: "Stok Kritis" },
  { key: "unlist", label: "Non-aktif" },
]

export function ProductFilter({ value, onChange, counts }: Props) {
  return (
    <div className="inline-flex rounded-md border bg-white p-1 gap-1 flex-wrap">
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
            <span className="ml-1.5 text-xs opacity-70">
              ({counts[opt.key]})
            </span>
          </Button>
        )
      })}
    </div>
  )
}
