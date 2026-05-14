"use client"

import { useState } from "react"
import { useAddShopeeLink, useRemoveShopeeLink } from "@/lib/hooks/use-katalog"
import { useProducts } from "@/lib/hooks/use-products"

interface LinkItem {
  id: string
  shopeeItemId: string
}

interface Props {
  produkId: string
  links: LinkItem[]
}

export function ShopeeLinksSection({ produkId, links }: Props) {
  const [search, setSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  const addLink = useAddShopeeLink()
  const removeLink = useRemoveShopeeLink()

  const { data: productsData } = useProducts()
  const allProducts = productsData?.products ?? []

  const linkedIds = new Set(links.map(l => l.shopeeItemId))

  const searchResults = search.trim()
    ? allProducts
        .filter(p =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.productId.toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 6)
    : allProducts.slice(0, 6)

  async function handleAdd(shopeeItemId: string) {
    if (linkedIds.has(shopeeItemId)) return
    await addLink.mutateAsync({ katalogId: produkId, shopeeItemId })
    setSearch("")
  }

  async function handleRemove(shopeeItemId: string) {
    await removeLink.mutateAsync({ katalogId: produkId, shopeeItemId })
  }

  return (
    <div className="space-y-3">
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgba(165,180,252,0.6)" }}
      >
        Link Shopee
      </div>

      {/* Current chips */}
      <div className="flex flex-wrap gap-2">
        {links.map(link => (
          <span
            key={link.id}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "#a5b4fc",
            }}
          >
            {link.shopeeItemId}
            <button
              onClick={() => handleRemove(link.shopeeItemId)}
              disabled={removeLink.isPending}
              className="ml-0.5 text-[9px] font-bold transition-all"
              style={{ color: "rgba(165,180,252,0.5)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(165,180,252,0.5)")}
            >
              ✕
            </button>
          </span>
        ))}

        <button
          onClick={() => setShowSearch(v => !v)}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px dashed rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.45)",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"
            e.currentTarget.style.color = "#a5b4fc"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"
            e.currentTarget.style.color = "rgba(255,255,255,0.45)"
          }}
        >
          + Link Shopee
        </button>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div
          className="rounded-[12px] p-3 space-y-2"
          style={{
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <input
            type="text"
            placeholder="Cari produk Shopee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input w-full h-8 rounded-[8px] px-3 text-[11px]"
            autoFocus
          />
          <div className="space-y-1">
            {searchResults.map(p => {
              const isLinked = linkedIds.has(p.productId)
              return (
                <div
                  key={p.productId}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] transition-all"
                  style={{
                    background: isLinked ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isLinked ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.05)"}`,
                    cursor: isLinked ? "default" : "pointer",
                  }}
                  onClick={() => !isLinked && handleAdd(p.productId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.8)" }}>
                      {p.name}
                    </div>
                    <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {p.productId}
                    </div>
                  </div>
                  {isLinked
                    ? <span className="text-[10px] flex-shrink-0" style={{ color: "#a5b4fc" }}>✓</span>
                    : <span className="text-[10px] flex-shrink-0" style={{ color: "rgba(99,102,241,0.6)" }}>+ Link</span>
                  }
                </div>
              )
            })}
            {searchResults.length === 0 && (
              <div className="text-[10px] text-center py-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                Tidak ada produk Shopee ditemukan
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
