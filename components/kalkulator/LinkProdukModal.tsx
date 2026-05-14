"use client"

import { useState } from "react"
import { useAddProdukLink, useRemoveProdukLink, useSetPrimaryLink } from "@/lib/hooks/use-kalkulator"
import { useProducts } from "@/lib/hooks/use-products"
import type { KalkulasiData, KalkulasiProdukData } from "@/lib/kalkulator/types"

interface Props {
  kalkulasi: KalkulasiData
  onClose: () => void
}

type ModalTab = "shopee" | "manual"

export function LinkProdukModal({ kalkulasi, onClose }: Props) {
  const [tab, setTab] = useState<ModalTab>("shopee")
  const [search, setSearch] = useState("")
  const [manualNama, setManualNama] = useState("")
  const [isPrimary, setIsPrimary] = useState(false)

  const addLink = useAddProdukLink()
  const removeLink = useRemoveProdukLink()
  const setPrimary = useSetPrimaryLink()

  const { data: productsData } = useProducts()
  const allProducts = productsData?.products ?? []
  const searchedProducts = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const linkedShopeeIds = new Set(
    kalkulasi.produkLinks
      .filter(l => l.shopeeItemId)
      .map(l => l.shopeeItemId as string)
  )

  async function handleLinkShopee(productId: string) {
    if (linkedShopeeIds.has(productId)) return
    await addLink.mutateAsync({
      kalkulasiId: kalkulasi.id,
      input: { shopeeItemId: productId, isPrimary },
    })
  }

  async function handleLinkManual() {
    if (!manualNama.trim()) return
    await addLink.mutateAsync({
      kalkulasiId: kalkulasi.id,
      input: { namaManual: manualNama.trim(), isPrimary },
    })
    setManualNama("")
  }

  async function handleRemove(linkId: string) {
    await removeLink.mutateAsync({ kalkulasiId: kalkulasi.id, linkId })
  }

  async function handleSetPrimary(link: KalkulasiProdukData) {
    await setPrimary.mutateAsync({ kalkulasiId: kalkulasi.id, linkId: link.id })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-96 max-h-[80vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.96)", border: "1px solid rgba(99,102,241,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
        >
          <div>
            <div className="text-[13px] font-bold">🔗 Link ke Produk</div>
            <div className="text-[10px] mt-0.5" style={{ color: "rgba(165,180,252,0.5)" }}>
              {kalkulasi.nama}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[16px]"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            ✕
          </button>
        </div>

        {/* Current links */}
        {kalkulasi.produkLinks.length > 0 && (
          <div
            className="px-5 py-3"
            style={{ borderBottom: "1px solid rgba(99,102,241,0.08)" }}
          >
            <div
              className="text-[9px] font-semibold uppercase mb-2"
              style={{ color: "rgba(165,180,252,0.5)" }}
            >
              Terhubung ({kalkulasi.produkLinks.length})
            </div>
            {kalkulasi.produkLinks.map(link => (
              <div key={link.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-[10px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {link.shopeeItemId ? `Shopee: ${link.shopeeItemId}` : link.namaManual}
                </span>
                {link.isPrimary ? (
                  <span
                    className="text-[8px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#34d399" }}
                  >
                    🔑 Primary
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetPrimary(link)}
                    className="text-[8px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}
                  >
                    Set Primary
                  </button>
                )}
                <button
                  onClick={() => handleRemove(link.id)}
                  className="text-[10px]"
                  style={{ color: "rgba(239,68,68,0.5)" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {(
            [
              ["shopee", "Produk Shopee"],
              ["manual", "Nama Manual"],
            ] as [ModalTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 py-2.5 text-[11px] font-medium border-b-2 transition-colors"
              style={
                tab === key
                  ? { borderColor: "#6366f1", color: "#a5b4fc" }
                  : { borderColor: "transparent", color: "rgba(255,255,255,0.4)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* isPrimary toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={e => setIsPrimary(e.target.checked)}
              className="accent-indigo-500"
            />
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              Set sebagai referensi harga utama (Primary)
            </span>
          </label>

          {tab === "shopee" && (
            <>
              <input
                type="text"
                placeholder="🔍 Cari produk Shopee..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="glass-input w-full h-8 rounded-[8px] px-3 text-[11px]"
              />
              <div className="space-y-1">
                {searchedProducts.slice(0, 8).map(p => {
                  const linked = linkedShopeeIds.has(p.productId)
                  return (
                    <div
                      key={p.productId}
                      className="flex items-center gap-2 p-2 rounded-[8px] cursor-pointer transition-all"
                      style={{
                        background: linked ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${linked ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
                      }}
                      onClick={() => !linked && handleLinkShopee(p.productId)}
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[10px] font-medium truncate"
                          style={{ color: "rgba(255,255,255,0.8)" }}
                        >
                          {p.name}
                        </div>
                        <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {p.productId}
                        </div>
                      </div>
                      {linked ? (
                        <span className="text-[9px]" style={{ color: "#a5b4fc" }}>
                          ✓ Linked
                        </span>
                      ) : (
                        <span className="text-[9px]" style={{ color: "rgba(99,102,241,0.6)" }}>
                          + Link
                        </span>
                      )}
                    </div>
                  )
                })}
                {searchedProducts.length === 0 && (
                  <div
                    className="text-[10px] text-center py-3"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Tidak ada produk ditemukan
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "manual" && (
            <div className="space-y-3">
              <div
                className="text-[10px]"
                style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}
              >
                Untuk produk yang belum listing di Shopee. Bisa di-update ke produk Shopee nanti.
              </div>
              <input
                type="text"
                placeholder="Nama produk..."
                value={manualNama}
                onChange={e => setManualNama(e.target.value)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-[12px]"
              />
              <button
                onClick={handleLinkManual}
                disabled={!manualNama.trim() || addLink.isPending}
                className="w-full h-9 rounded-[8px] text-[11px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
              >
                {addLink.isPending ? "Menyimpan..." : "+ Tambah Manual"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
