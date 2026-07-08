"use client"

import { useState } from "react"
import { ChevronRight, ChevronLeft } from "lucide-react"
import { useShopeeCategories } from "@/lib/hooks/use-shopee-create"
import type { ShopeeCategory } from "@/lib/shopee/types"

interface Props {
  selectedCategoryId: number | null
  onSelect: (categoryId: number, path: Array<{ id: number; name: string }>) => void
}

export function CategoryPicker({ selectedCategoryId, onSelect }: Props) {
  // Stack of { id, name } representing current navigation path
  const [navPath, setNavPath] = useState<Array<{ id: number; name: string }>>([])

  const currentParentId = navPath.length > 0 ? navPath[navPath.length - 1].id : 0
  const { data: categories, isLoading, isError } = useShopeeCategories(currentParentId)

  function handleDrillDown(cat: ShopeeCategory) {
    if (!cat.has_children) {
      // Leaf — select it
      const newPath = [...navPath, { id: cat.category_id, name: cat.category_name }]
      onSelect(cat.category_id, newPath)
    } else {
      // Parent — navigate into it
      setNavPath(prev => [...prev, { id: cat.category_id, name: cat.category_name }])
    }
  }

  function handleBack() {
    setNavPath(prev => prev.slice(0, -1))
  }

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Breadcrumb */}
      <div
        className="flex items-center gap-1 px-3 py-2 text-[11px] flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", minHeight: "34px" }}
      >
        {navPath.length > 0 && (
          <button
            onClick={handleBack}
            aria-label="Kembali"
            className="flex items-center gap-1 hover:opacity-70 transition-opacity flex-shrink-0"
            style={{ color: "#a5b4fc" }}
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
        )}
        {navPath.length === 0 ? (
          <span style={{ color: "rgba(255,255,255,0.3)" }}>Pilih kategori...</span>
        ) : (
          navPath.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" style={{ color: "rgba(255,255,255,0.2)" }} />}
              <span style={{ color: i === navPath.length - 1 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>
                {p.name}
              </span>
            </span>
          ))
        )}
      </div>

      {/* Category list */}
      <div className="max-h-48 overflow-y-auto">
        {isError && (
          <div className="px-3 py-4 text-center text-[11px]" style={{ color: "#f87171" }}>
            Gagal memuat kategori
          </div>
        )}
        {isLoading && (
          <div className="px-3 py-4 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Memuat kategori...
          </div>
        )}
        {!isLoading && (!categories || categories.length === 0) && (
          <div className="px-3 py-4 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Tidak ada kategori
          </div>
        )}
        {(categories ?? []).map(cat => {
          const isSelected = !cat.has_children && cat.category_id === selectedCategoryId
          return (
            <button
              key={cat.category_id}
              onClick={() => handleDrillDown(cat)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-all hover:opacity-80"
              style={{
                background: isSelected ? "rgba(99,102,241,0.15)" : "transparent",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: isSelected ? "#a5b4fc" : "rgba(255,255,255,0.7)",
              }}
            >
              <span className="text-[12px]">{cat.category_name}</span>
              {cat.has_children ? (
                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
              ) : isSelected ? (
                <span className="text-[10px]" style={{ color: "#a5b4fc" }}>✓</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
