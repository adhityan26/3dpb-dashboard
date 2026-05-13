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
    <div className="inline-flex rounded-xl p-1 gap-1 flex-wrap"
         style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(99,102,241,0.15)" }}>
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
                ? "bg-indigo-600 hover:bg-indigo-700 text-white h-8"
                : "h-8 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
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
