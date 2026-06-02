"use client"

import { useState } from "react"
import { useAddShopeeLink, useRemoveShopeeLink, useSetVariantKalkulasi } from "@/lib/hooks/use-katalog"
import { useKalkulasiList } from "@/lib/hooks/use-kalkulator"
import type { KalkulasiData } from "@/lib/kalkulator/types"
import { useProducts } from "@/lib/hooks/use-products"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

interface LinkItem {
  id: string
  shopeeItemId: string
  shopeeModelId: string | null
  namaProduk: string | null
  kalkulasiId: string | null
  kalkulasiNama: string | null
  hppTotal: number | null
  floorPrice: number | null
  shopeeA: number | null
  offlineA: number | null
}

interface Props {
  produkId: string
  links: LinkItem[]
}

export function ShopeeLinksSection({ produkId, links }: Props) {
  const [search, setSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [expandedLink, setExpandedLink] = useState<string | null>(null)
  const [kalkSearch, setKalkSearch] = useState("")

  const addLink = useAddShopeeLink()
  const removeLink = useRemoveShopeeLink()
  const setVariantKalk = useSetVariantKalkulasi()

  const { data: productsData } = useProducts()
  const { data: kalkulasiListResult } = useKalkulasiList()
  const allProducts = productsData?.products ?? []
  const allKalkulasi: KalkulasiData[] = Array.isArray(kalkulasiListResult)
    ? kalkulasiListResult
    : (kalkulasiListResult as { items?: KalkulasiData[] } | null)?.items ?? []

  const linkedIds = new Set(links.map(l => l.shopeeItemId))

  const searchResults = search.trim()
    ? allProducts.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.productId.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 6)
    : allProducts.slice(0, 6)

  async function handleAdd(shopeeItemId: string) {
    if (linkedIds.has(shopeeItemId)) return
    await addLink.mutateAsync({ katalogId: produkId, shopeeItemId })
    setSearch("")
  }

  async function handleRemove(linkId: string, shopeeItemId: string) {
    await removeLink.mutateAsync({ katalogId: produkId, shopeeItemId })
  }

  async function handleSetKalkulasi(linkId: string, kalkulasiId: string | null) {
    await setVariantKalk.mutateAsync({ katalogId: produkId, linkId, kalkulasiId })
    setExpandedLink(null)
  }

  const filteredKalk = kalkSearch.trim()
    ? allKalkulasi.filter(k => k.nama.toLowerCase().includes(kalkSearch.toLowerCase()))
    : allKalkulasi

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider g-accent">
        Link Shopee
      </div>

      {/* Current links */}
      <div className="space-y-1.5">
        {links.map(link => {
          const product = allProducts.find(p => p.productId === link.shopeeItemId)
          const isExpanded = expandedLink === link.id
          const hasVariantKalk = link.kalkulasiId != null

          return (
            <div key={link.id} className="rounded-[8px] overflow-hidden"
                 style={{ background: "var(--g-card)", border: `1px solid ${hasVariantKalk ? "rgba(99,102,241,0.3)" : "var(--g-card-border)"}` }}>
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium truncate g-t1">
                    {link.namaProduk ?? product?.name ?? link.shopeeItemId}
                  </div>
                  <div className="text-[9px] flex gap-2 mt-0.5">
                    <span className="g-t4">{link.shopeeItemId}</span>
                    {link.shopeeModelId && (
                      <span className="g-accent">model: {link.shopeeModelId}</span>
                    )}
                  </div>
                </div>

                {/* Variant kalkulasi badge */}
                {hasVariantKalk ? (
                  <div className="text-right flex-shrink-0">
                    <div className="text-[9px] font-semibold" style={{ color: "#a5b4fc" }}>
                      🧮 {link.kalkulasiNama ?? "—"}
                    </div>
                    {link.hppTotal && (
                      <div className="text-[9px]" style={{ color: "rgba(52,211,153,0.7)" }}>
                        HPP: {fmt(link.hppTotal)}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-[9px] g-t5">pakai HPP produk</span>
                )}

                {/* Actions */}
                <button
                  onClick={() => setExpandedLink(isExpanded ? null : link.id)}
                  className="h-6 px-2 rounded-[5px] text-[9px] transition-all flex-shrink-0"
                  style={{ background: isExpanded ? "rgba(99,102,241,0.2)" : "var(--g-inner)", color: isExpanded ? "#a5b4fc" : "var(--g-t3)" }}
                >
                  🧮 Kalkulasi
                </button>
                <button
                  onClick={() => handleRemove(link.id, link.shopeeItemId)}
                  disabled={removeLink.isPending}
                  className="text-[10px] w-5 h-5 flex items-center justify-center rounded transition-all flex-shrink-0"
                  style={{ color: "rgba(239,68,68,0.5)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(239,68,68,0.5)")}
                >✕</button>
              </div>

              {/* Kalkulasi picker for this variant */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 space-y-2"
                     style={{ borderTop: "1px solid var(--g-inner-border)" }}>
                  <div className="text-[9px] font-semibold uppercase tracking-wider g-accent">
                    Pilih kalkulasi untuk variant ini
                  </div>
                  <input
                    type="text" value={kalkSearch} onChange={e => setKalkSearch(e.target.value)}
                    placeholder="Cari kalkulasi..."
                    className="glass-input w-full h-7 rounded-[6px] px-2 text-[10px]"
                    autoFocus
                  />
                  {hasVariantKalk && (
                    <button
                      onClick={() => handleSetKalkulasi(link.id, null)}
                      disabled={setVariantKalk.isPending}
                      className="w-full h-7 rounded-[6px] text-[10px] transition-all"
                      style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}
                    >
                      Lepas kalkulasi variant → pakai HPP produk
                    </button>
                  )}
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {filteredKalk.map(k => (
                      <div
                        key={k.id}
                        onClick={() => handleSetKalkulasi(link.id, k.id)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] cursor-pointer transition-all"
                        style={{ background: link.kalkulasiId === k.id ? "rgba(99,102,241,0.15)" : "var(--g-card)", border: `1px solid ${link.kalkulasiId === k.id ? "rgba(99,102,241,0.35)" : "var(--g-card-border)"}` }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium truncate g-t1">{k.nama}</div>
                          <div className="text-[9px] g-t4">
                            HPP: {fmt(k.hppTotal)} · Floor: {fmt(k.floorPrice)}
                          </div>
                        </div>
                        {link.kalkulasiId === k.id && (
                          <span className="text-[9px]" style={{ color: "#a5b4fc" }}>✓ Aktif</span>
                        )}
                      </div>
                    ))}
                    {filteredKalk.length === 0 && (
                      <div className="text-[10px] text-center py-2 g-t5">
                        Tidak ada kalkulasi ditemukan
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new link button */}
      <button
        onClick={() => setShowSearch(v => !v)}
        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all g-t3"
        style={{ background: "var(--g-card)", border: "1px dashed var(--g-dashed)" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; e.currentTarget.style.color = "#a5b4fc" }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--g-dashed)"; e.currentTarget.style.color = "var(--g-t3)" }}
      >
        + Link Shopee
      </button>

      {showSearch && (
        <div className="rounded-[10px] p-3 space-y-2"
             style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--g-inner-border)" }}>
          <input type="text" placeholder="Cari produk Shopee..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input w-full h-8 rounded-[8px] px-3 text-[11px]" autoFocus />
          <div className="space-y-1">
            {searchResults.map(p => {
              const linked = linkedIds.has(p.productId)
              return (
                <div key={p.productId}
                     className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] transition-all"
                     style={{ background: linked ? "rgba(99,102,241,0.1)" : "var(--g-card)", border: `1px solid ${linked ? "rgba(99,102,241,0.25)" : "var(--g-card-border)"}`, cursor: linked ? "default" : "pointer" }}
                     onClick={() => !linked && handleAdd(p.productId)}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate g-t1">{p.name}</div>
                    <div className="text-[9px] g-t4">{p.productId}</div>
                  </div>
                  {linked
                    ? <span className="text-[10px]" style={{ color: "#a5b4fc" }}>✓</span>
                    : <span className="text-[10px]" style={{ color: "rgba(99,102,241,0.6)" }}>+ Link</span>
                  }
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
