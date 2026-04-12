"use client"

import { useState } from "react"
import { useAms } from "@/lib/hooks/use-filamen"
import { AmsVariantRow } from "./AmsVariantRow"
import type { ProductType } from "@/lib/filamen/types"

export function AmsTab() {
  const { data, isLoading, isError } = useAms()
  const [section, setSection] = useState<ProductType>("swoosh")

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Memuat data AMS...</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Gagal memuat data AMS.</div>
  if (!data) return null

  const variants = section === "swoosh" ? data.swoosh : data.clickers
  const lowCount = variants.filter((v) => v.hasLowSpool).length

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-2 items-center">
        {(["swoosh", "clickers"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              section === s
                ? "bg-[#EE4D2D] text-white border-[#EE4D2D]"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        {lowCount > 0 && (
          <span className="text-xs text-orange-500 ml-2">
            ⚠️ {lowCount} varian ada spool LOW
          </span>
        )}
      </div>

      {/* Accordion rows */}
      <div>
        {variants.map((variant) => (
          <AmsVariantRow key={variant.variantName} variant={variant} />
        ))}
      </div>
    </div>
  )
}
