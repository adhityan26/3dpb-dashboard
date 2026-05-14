"use client"

import { useState, useMemo } from "react"
import { useDeleteKatalog } from "@/lib/hooks/use-katalog"
import { useProducts } from "@/lib/hooks/use-products"
import type { ProdukInternalData } from "@/lib/katalog/types"
import { ShopeeLinksSection } from "./ShopeeLinksSection"
import { KalkulasiLinkSection } from "./KalkulasiLinkSection"

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

interface Props {
  produk: ProdukInternalData
  onEdit: (p: ProdukInternalData) => void
}

export function KatalogCard({ produk, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false)
  const deleteMut = useDeleteKatalog()
  const { data: productsData } = useProducts()

  async function handleDelete() {
    if (!confirm(`Hapus produk "${produk.nama}"?`)) return
    await deleteMut.mutateAsync(produk.id)
  }

  const hasHpp = produk.hppTotal != null && produk.hppTotal > 0
  const hasPrices = produk.offlineA != null || produk.shopeeA != null

  // Actual Shopee price: look up from linked Shopee items
  const actualShopeePrice = useMemo(() => {
    if (!produk.shopeeLinks.length || !productsData?.products) return null
    const linkedIds = new Set(produk.shopeeLinks.map(l => l.shopeeItemId))
    const prices = productsData.products
      .filter(p => linkedIds.has(p.productId) && p.priceMin > 0)
      .map(p => p.priceMin)
    return prices.length > 0 ? Math.min(...prices) : null
  }, [produk.shopeeLinks, productsData])

  return (
    <div
      className="rounded-[14px] overflow-hidden transition-all"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Main row */}
      <div className="px-5 py-4">

        {/* Top: title + prices + actions */}
        <div className="flex items-start gap-3">

          {/* Title + prices */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Product name */}
              <span
                className="text-[15px] font-bold"
                style={{ color: "rgba(255,255,255,0.9)" }}
              >
                {produk.nama}
              </span>

              {/* Prices inline with title — only when kalkulasi is linked */}
              {hasPrices && (
                <>
                  <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.12)" }}>·</span>

                  {produk.offlineA != null && (
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: "rgba(110,231,183,0.6)" }}>Offline</span>
                      <span className="text-sm font-bold" style={{ color: "#6ee7b7" }}>{fmt(produk.offlineA)}</span>
                    </div>
                  )}

                  {produk.shopeeA != null && (
                    <>
                      <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.12)" }}>·</span>
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: "rgba(251,146,60,0.7)" }}>Rekm Shopee</span>
                        <span className="text-sm font-bold" style={{ color: "#fb923c" }}>{fmt(produk.shopeeA)}</span>
                      </div>
                    </>
                  )}

                  {/* Actual Shopee price from linked product, or kalkulasiShopeeA as fallback label */}
                  <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.12)" }}>·</span>
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: actualShopeePrice != null ? "rgba(165,180,252,0.7)" : "rgba(255,255,255,0.25)" }}>
                      Harga Shopee{actualShopeePrice != null ? " (aktual)" : ""}
                    </span>
                    {actualShopeePrice != null ? (
                      <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>{fmt(actualShopeePrice)}</span>
                    ) : (
                      <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Deskripsi */}
            {produk.deskripsi && (
              <div className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                {produk.deskripsi}
              </div>
            )}

            {/* Meta badges: HPP + Shopee links */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {hasHpp ? (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}
                >
                  HPP: {fmt(produk.hppTotal!)}
                  {produk.kalkulasiNama && (
                    <span style={{ color: "rgba(52,211,153,0.6)" }}> · {produk.kalkulasiNama}</span>
                  )}
                </span>
              ) : (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                >
                  Belum ada kalkulasi
                </span>
              )}

              {produk.shopeeLinks.length > 0 && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}
                >
                  🛍️ {produk.shopeeLinks.length} linked
                </span>
              )}

              {produk.floorPrice != null && (
                <span className="text-[10px]" style={{ color: "rgba(251,191,36,0.5)" }}>
                  Floor: {fmt(produk.floorPrice)}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setExpanded(v => !v)}
              className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
              style={{
                background: expanded ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)",
                border: expanded ? "1px solid rgba(99,102,241,0.35)" : "1px solid rgba(255,255,255,0.08)",
                color: expanded ? "#a5b4fc" : "rgba(255,255,255,0.5)",
              }}
            >
              {expanded ? "▲" : "▼"}
            </button>
            <button
              onClick={() => onEdit(produk)}
              className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}
            >
              ✏️
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.15)", color: "#f87171" }}
            >
              {deleteMut.isPending ? "..." : "🗑️"}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded detail sections */}
      {expanded && (
        <div
          className="px-5 pb-5 space-y-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="pt-4">
            <ShopeeLinksSection produkId={produk.id} links={produk.shopeeLinks} />
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }} className="pt-4">
            <KalkulasiLinkSection
              produkId={produk.id}
              currentKalkulasiId={produk.primaryKalkulasiId ?? null}
              currentKalkulasiNama={produk.kalkulasiNama ?? null}
              currentHpp={produk.hppTotal ?? null}
            />
          </div>
        </div>
      )}
    </div>
  )
}
