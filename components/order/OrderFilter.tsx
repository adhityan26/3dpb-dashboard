"use client"

import { Button } from "@/components/ui/button"

export type OrderFilterValue = "all" | "belum" | "sudah"

interface OrderFilterProps {
  value: OrderFilterValue
  onChange: (value: OrderFilterValue) => void
  counts: { all: number; belum: number; sudah: number }
}

const OPTIONS: Array<{ key: OrderFilterValue; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "belum", label: "Belum Cetak" },
  { key: "sudah", label: "Sudah Cetak" },
]

export function OrderFilter({ value, onChange, counts }: OrderFilterProps) {
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
            <span className="ml-1.5 text-xs opacity-70">
              ({counts[opt.key]})
            </span>
          </Button>
        )
      })}
    </div>
  )
}
