"use client"

import { Button } from "@/components/ui/button"
import type { FlexRange } from "@/lib/dateRange"

interface Props {
  value: FlexRange
  onChange: (value: FlexRange) => void
}

const OPTIONS: Array<{ key: string; label: string }> = [
  { key: "7d", label: "7 Hari" },
  { key: "30d", label: "30 Hari" },
]

export function AdsRangeSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-xl p-1 gap-1"
         style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(99,102,241,0.15)" }}>
      {OPTIONS.map((opt) => {
        const isActive = value === opt.key
        return (
          <Button
            key={opt.key}
            variant={isActive ? "default" : "ghost"}
            size="sm"
            onClick={() => onChange(opt.key as FlexRange)}
            className={
              isActive
                ? "bg-indigo-600 hover:bg-indigo-700 text-white h-8"
                : "h-8 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
            }
          >
            {opt.label}
          </Button>
        )
      })}
    </div>
  )
}
