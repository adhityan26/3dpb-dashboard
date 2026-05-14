"use client"

import { useState, useMemo, useRef } from "react"
import { useDeleteKatalog, useUploadKatalogImage, useDeleteKatalogImage } from "@/lib/hooks/use-katalog"
import { useProducts } from "@/lib/hooks/use-products"
import type { ProdukInternalData } from "@/lib/katalog/types"
import { ShopeeLinksSection } from "./ShopeeLinksSection"
import { KalkulasiLinkSection } from "./KalkulasiLinkSection"
import { HistorySection } from "./HistorySection"

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

function fmtDurasi(jam: number): string {
  const h = Math.floor(jam)
  const m = Math.round((jam - h) * 60)
  return m === 0 ? `${h}j` : `${h}j ${m}m`
}

const COL = "52px 1fr 140px 140px 160px 96px"

interface Props {
  produk: ProdukInternalData
  onEdit: (p: ProdukInternalData) => void
}

function PriceCol({ value, color }: { value: string | null; color: string }) {
  return value ? (
    <div className="text-sm font-bold" style={{ color }}>{value}</div>
  ) : (
    <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.18)" }}>—</div>
  )
}

export function KatalogCard({ produk, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false)
  const deleteMut = useDeleteKatalog()
  const uploadImage = useUploadKatalogImage()
  const deleteImage = useDeleteKatalogImage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: productsData } = useProducts()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadImage.mutate({ katalogId: produk.id, file })
    e.target.value = ""
  }

  async function handleDelete() {
    if (!confirm(`Hapus produk "${produk.nama}"?`)) return
    await deleteMut.mutateAsync(produk.id)
  }

  const hasHpp = produk.hppTotal != null && produk.hppTotal > 0

  const actualShopeePrice = useMemo(() => {
    if (!produk.shopeeLinks.length || !productsData?.products) return null
    const linkedIds = new Set(produk.shopeeLinks.map(l => l.shopeeItemId))
    const prices = productsData.products
      .filter(p => linkedIds.has(p.productId) && p.priceMin > 0)
      .map(p => p.priceMin)
    return prices.length > 0 ? Math.min(...prices) : null
  }, [produk.shopeeLinks, productsData])

  const shopeeDisplayPrice = actualShopeePrice ?? (produk.hargaShopeeAktual && produk.hargaShopeeAktual > 0 ? produk.hargaShopeeAktual : null)

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Table-style main row */}
      <div
        className="items-center px-5 py-4 gap-3"
        style={{ display: "grid", gridTemplateColumns: COL }}
      >
        {/* Col 1: Image thumbnail */}
        <div className="relative flex-shrink-0">
          <div
            className="w-12 h-12 rounded-[8px] overflow-hidden flex items-center justify-center cursor-pointer"
            style={{
              background: produk.imageUrl ? "transparent" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={() => fileInputRef.current?.click()}
            title="Klik untuk upload gambar"
          >
            {produk.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={produk.imageUrl} alt={produk.nama} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[18px]" style={{ opacity: 0.3 }}>
                {uploadImage.isPending ? "⋯" : "📷"}
              </span>
            )}
          </div>
          {produk.imageUrl && (
            <button
              onClick={() => deleteImage.mutate(produk.id)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
              style={{ background: "rgba(239,68,68,0.85)", color: "white" }}
              title="Hapus gambar"
            >✕</button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Col 2: Name + meta badges only */}
        <div className="min-w-0">
          <div className="text-[15px] font-bold truncate" style={{ color: "rgba(255,255,255,0.9)" }}>
            {produk.nama}
          </div>

          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {produk.kategori && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(139,92,246,0.12)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}
              >
                {produk.kategori}
              </span>
            )}
            {produk.tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {tag}
              </span>
            ))}
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
            {produk.historyStats && produk.historyStats.totalRuns > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}
              >
                🖨️ {produk.historyStats.totalQty} pcs dicetak
              </span>
            )}
            {produk.floorPrice != null && (
              <span className="text-[10px]" style={{ color: "rgba(251,191,36,0.45)" }}>
                Floor: {fmt(produk.floorPrice)}
              </span>
            )}
          </div>
        </div>

        <PriceCol value={produk.offlineA != null ? fmt(produk.offlineA) : null} color="#6ee7b7" />
        <PriceCol value={produk.shopeeA != null ? fmt(produk.shopeeA) : null} color="#fb923c" />
        <PriceCol
          value={shopeeDisplayPrice != null ? fmt(shopeeDisplayPrice) : null}
          color={actualShopeePrice != null ? "#a5b4fc" : "rgba(165,180,252,0.5)"}
        />

        {/* Actions */}
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
          className="px-5 pb-5 space-y-4 pt-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Source Model */}
          {produk.sourceModel && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(165,180,252,0.5)" }}>
                Source / Model Referensi
              </div>
              {/^https?:\/\//.test(produk.sourceModel) ? (
                <a
                  href={produk.sourceModel}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm break-all"
                  style={{ color: "#a5b4fc", textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  {produk.sourceModel}
                </a>
              ) : (
                <div className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {produk.sourceModel}
                </div>
              )}
            </div>
          )}

          {/* Deskripsi */}
          {produk.deskripsi && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(165,180,252,0.5)" }}>
                Deskripsi
              </div>
              <div className="text-sm" style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                {produk.deskripsi}
              </div>
            </div>
          )}

          {/* Plates dari kalkulasi primary */}
          {produk.plates.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(165,180,252,0.5)" }}>
                Part / Plate
                {produk.kalkulasiNama && (
                  <span className="ml-1 font-normal normal-case" style={{ color: "rgba(255,255,255,0.25)" }}>
                    (dari: {produk.kalkulasiNama})
                  </span>
                )}
              </div>
              <div className="rounded-[10px] overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Table header */}
                <div
                  className="grid text-[9px] font-semibold uppercase tracking-wider px-3 py-2"
                  style={{
                    gridTemplateColumns: "1fr 60px 140px 70px 70px",
                    background: "rgba(255,255,255,0.03)",
                    color: "rgba(165,180,252,0.5)",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <span>Nama Part</span>
                  <span>Tipe</span>
                  <span>Printer</span>
                  <span>Gramasi</span>
                  <span>Durasi</span>
                </div>
                {produk.plates.map((plate, i) => (
                  <div
                    key={i}
                    className="grid px-3 py-2 text-xs items-center"
                    style={{
                      gridTemplateColumns: "1fr 60px 140px 70px 70px",
                      borderBottom: i < produk.plates.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    }}
                  >
                    <span style={{ color: plate.namaPart ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)" }}>
                      {plate.namaPart ?? "—"}
                    </span>
                    <span
                      className="font-semibold"
                      style={{ color: plate.tipe === "SLA" ? "#fb923c" : "#6ee7b7" }}
                    >
                      {plate.tipe}
                    </span>
                    <span style={{ color: plate.printer ? "rgba(165,180,252,0.7)" : "rgba(255,255,255,0.2)" }}>
                      {plate.printer ?? "—"}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{plate.gramasi.toFixed(1)}g</span>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{fmtDurasi(plate.durasiJam)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shopee links */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 16 }}>
            <ShopeeLinksSection produkId={produk.id} links={produk.shopeeLinks} />
          </div>

          {/* Kalkulasi link */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 16 }}>
            <KalkulasiLinkSection
              produkId={produk.id}
              currentKalkulasiId={produk.primaryKalkulasiId ?? null}
              currentKalkulasiNama={produk.kalkulasiNama ?? null}
              currentHpp={produk.hppTotal ?? null}
            />
          </div>

          {/* History */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 16 }}>
            <HistorySection produkId={produk.id} />
          </div>
        </div>
      )}
    </div>
  )
}
