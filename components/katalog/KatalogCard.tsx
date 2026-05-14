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

// Fixed column widths — same across all cards so prices align like a table
const COL = "140px 140px 160px 96px"

interface Props {
  produk: ProdukInternalData
  onEdit: (p: ProdukInternalData) => void
}

function PriceCol({
  label,
  value,
  color,
  dimLabel,
}: {
  label: string
  value: string | null
  color: string
  dimLabel?: boolean
}) {
  return (
    <div>
      <div
        className="text-[9px] uppercase tracking-wider font-semibold mb-0.5"
        style={{ color: dimLabel ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.35)" }}
      >
        {label}
      </div>
      {value ? (
        <div className="text-sm font-bold" style={{ color }}>
          {value}
        </div>
      ) : (
        <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.18)" }}>
          —
        </div>
      )}
    </div>
  )
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

  // Actual Shopee price from linked Shopee products
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
      className="rounded-[14px] overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Table-style main row: name | offline | shopeeA | hargaShopee | actions */}
      <div
        className="items-center px-5 py-4 gap-4"
        style={{ display: "grid", gridTemplateColumns: `1fr ${COL}` }}
      >
        {/* Col 1: Name + meta */}
        <div className="min-w-0">
          <div
            className="text-[15px] font-bold truncate"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {produk.nama}
          </div>

          {produk.deskripsi && (
            <div className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
              {produk.deskripsi}
            </div>
          )}

          {/* Meta badges */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {hasHpp ? (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}
              >
                HPP: {fmt(produk.hppTotal!)}
                {produk.kalkulasiNama && (
                  <span style={{ color: "rgba(52,211,153,0.55)" }}> · {produk.kalkulasiNama}</span>
                )}
              </span>
            ) : (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.15)" }}
              >
                Belum ada kalkulasi
              </span>
            )}

            {produk.shopeeLinks.length > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.18)" }}
              >
                🛍️ {produk.shopeeLinks.length} linked
              </span>
            )}

            {produk.floorPrice != null && (
              <span className="text-[10px]" style={{ color: "rgba(251,191,36,0.45)" }}>
                Floor: {fmt(produk.floorPrice)}
              </span>
            )}
          </div>
        </div>

        {/* Col 2: Offline */}
        <PriceCol
          label="Offline"
          value={produk.offlineA != null ? fmt(produk.offlineA) : null}
          color="#6ee7b7"
        />

        {/* Col 3: Rekm Shopee */}
        <PriceCol
          label="Rekm Shopee"
          value={produk.shopeeA != null ? fmt(produk.shopeeA) : null}
          color="#fb923c"
        />

        {/* Col 4: Harga Shopee aktual */}
        <PriceCol
          label={actualShopeePrice != null ? "Harga Shopee (aktual)" : "Harga Shopee"}
          value={actualShopeePrice != null ? fmt(actualShopeePrice) : null}
          color="#a5b4fc"
          dimLabel={actualShopeePrice == null}
        />

        {/* Col 5: Actions */}
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setExpanded(v => !v)}
            className="h-8 px-2.5 rounded-[8px] text-[11px] font-medium transition-all"
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
            className="h-8 w-8 rounded-[8px] text-[11px] flex items-center justify-center transition-all"
            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="h-8 w-8 rounded-[8px] text-[11px] flex items-center justify-center transition-all"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.15)", color: "#f87171" }}
          >
            {deleteMut.isPending ? "·" : "🗑️"}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
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
