"use client"

import { useState } from "react"
import { useDeleteKatalog } from "@/lib/hooks/use-katalog"
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

  async function handleDelete() {
    if (!confirm(`Hapus produk "${produk.nama}"?`)) return
    await deleteMut.mutateAsync(produk.id)
  }

  const hasHpp = produk.hppTotal != null && produk.hppTotal > 0

  return (
    <div
      className="rounded-[14px] overflow-hidden transition-all"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Main row */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Left: name + deskripsi */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[15px] font-bold truncate"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {produk.nama}
          </div>
          {produk.deskripsi && (
            <div
              className="text-[11px] mt-0.5 truncate"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {produk.deskripsi}
            </div>
          )}

          {/* HPP badge */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {hasHpp ? (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(52,211,153,0.12)",
                  color: "#34d399",
                  border: "1px solid rgba(52,211,153,0.2)",
                }}
              >
                HPP: {fmt(produk.hppTotal!)}
                {produk.kalkulasiNama && (
                  <span style={{ color: "rgba(52,211,153,0.65)" }}>
                    {" "}(dari: {produk.kalkulasiNama})
                  </span>
                )}
              </span>
            ) : (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(251,191,36,0.1)",
                  color: "#fbbf24",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}
              >
                Belum ada kalkulasi
              </span>
            )}

            {/* Shopee link count chip */}
            {produk.shopeeLinks.length > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  color: "#a5b4fc",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                {produk.shopeeLinks.length} Shopee link
              </span>
            )}

          {/* Price pills: offline A + shopee A */}
          {(produk.offlineA != null || produk.shopeeA != null) && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {produk.offlineA != null && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(52,211,153,0.08)",
                    color: "#6ee7b7",
                    border: "1px solid rgba(52,211,153,0.15)",
                  }}
                >
                  Offline: {fmt(produk.offlineA)}
                </span>
              )}
              {produk.shopeeA != null && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(251,146,60,0.1)",
                    color: "#fb923c",
                    border: "1px solid rgba(251,146,60,0.2)",
                  }}
                >
                  Shopee: {fmt(produk.shopeeA)}
                </span>
              )}
              {produk.floorPrice != null && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    color: "#fbbf24",
                    border: "1px solid rgba(245,158,11,0.15)",
                  }}
                >
                  Floor: {fmt(produk.floorPrice)}
                </span>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
            style={{
              background: expanded
                ? "rgba(99,102,241,0.2)"
                : "rgba(255,255,255,0.05)",
              border: expanded
                ? "1px solid rgba(99,102,241,0.35)"
                : "1px solid rgba(255,255,255,0.08)",
              color: expanded ? "#a5b4fc" : "rgba(255,255,255,0.5)",
            }}
          >
            {expanded ? "▲ Tutup" : "▼ Detail"}
          </button>
          <button
            onClick={() => onEdit(produk)}
            className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "#a5b4fc",
            }}
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.15)",
              color: "#f87171",
            }}
          >
            {deleteMut.isPending ? "..." : "🗑️"}
          </button>
        </div>
      </div>

      {/* Expanded sections */}
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
