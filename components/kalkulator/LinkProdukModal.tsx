"use client"

import { useState } from "react"
import {
  useKalkulasi,
  useAddProdukLink,
  useRemoveProdukLink,
  useSetPrimaryLink,
} from "@/lib/hooks/use-kalkulator"
import { useProducts } from "@/lib/hooks/use-products"
import type { KalkulasiData, KalkulasiProdukData } from "@/lib/kalkulator/types"

interface Props {
  kalkulasi: KalkulasiData   // used as initial + for id/nama — always read LIVE data below
  onClose: () => void
}

type ModalTab = "shopee" | "manual"

export function LinkProdukModal({ kalkulasi, onClose }: Props) {
  const [tab, setTab] = useState<ModalTab>("shopee")
  const [search, setSearch] = useState("")
  const [manualNama, setManualNama] = useState("")
  const [isPrimary, setIsPrimary] = useState(false)
  const [dupError, setDupError] = useState<string | null>(null)

  // Live data — always fresh after mutations invalidate the cache
  const { data: liveData } = useKalkulasi(kalkulasi.id)
  const links: KalkulasiProdukData[] = liveData?.produkLinks ?? kalkulasi.produkLinks

  const addLink = useAddProdukLink()
  const removeLink = useRemoveProdukLink()
  const setPrimary = useSetPrimaryLink()

  const { data: productsData } = useProducts()
  const allProducts = productsData?.products ?? []
  const searchedProducts = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const linkedShopeeIds = new Set(links.filter(l => l.shopeeItemId).map(l => l.shopeeItemId as string))
  const linkedManualNames = new Set(links.filter(l => l.namaManual).map(l => (l.namaManual as string).toLowerCase()))

  async function handleLinkShopee(productId: string) {
    if (linkedShopeeIds.has(productId)) return
    await addLink.mutateAsync({ kalkulasiId: kalkulasi.id, input: { shopeeItemId: productId, isPrimary } })
  }

  async function handleLinkManual() {
    const nama = manualNama.trim()
    if (!nama) return
    if (linkedManualNames.has(nama.toLowerCase())) {
      setDupError(`"${nama}" sudah terhubung ke kalkulasi ini.`)
      return
    }
    setDupError(null)
    await addLink.mutateAsync({ kalkulasiId: kalkulasi.id, input: { namaManual: nama, isPrimary } })
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
        <div className="px-5 py-4 flex items-center justify-between"
             style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
          <div>
            <div className="text-sm font-bold">🔗 Link ke Produk</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(165,180,252,0.5)" }}>
              {liveData?.nama ?? kalkulasi.nama}
            </div>
          </div>
          <button onClick={onClose} className="text-base w-7 h-7 flex items-center justify-center rounded-full transition-all"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
            ✕
          </button>
        </div>

        {/* Current links */}
        {links.length > 0 && (
          <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(99,102,241,0.08)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                 style={{ color: "rgba(165,180,252,0.5)" }}>
              Terhubung ({links.length})
            </div>
            {links.map(link => (
              <div key={link.id} className="flex items-center gap-2 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.8)" }}>
                    {link.namaManual ?? (link.shopeeItemId ? `${link.shopeeItemId}` : "—")}
                  </div>
                  {link.shopeeItemId && (
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>Shopee</div>
                  )}
                  {link.namaManual && (
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>Manual</div>
                  )}
                </div>
                {link.isPrimary ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{ background: "rgba(34,197,94,0.15)", color: "#34d399" }}>
                    🔑 Primary
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetPrimary(link)}
                    disabled={setPrimary.isPending}
                    className="text-[10px] px-2 py-0.5 rounded-full transition-all flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(165,180,252,0.8)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
                  >
                    Set Primary
                  </button>
                )}
                <button
                  onClick={() => handleRemove(link.id)}
                  disabled={removeLink.isPending}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 transition-all"
                  style={{ color: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.08)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(239,68,68,0.5)")}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {([["shopee", "Produk Shopee"], ["manual", "Nama Manual"]] as [ModalTab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors"
              style={tab === key
                ? { borderColor: "#6366f1", color: "#a5b4fc" }
                : { borderColor: "transparent", color: "rgba(255,255,255,0.4)" }
              }>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* isPrimary toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)}
                   className="w-4 h-4 accent-indigo-500" />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              Set sebagai referensi harga utama (Primary)
            </span>
          </label>

          {tab === "shopee" && (
            <>
              <input type="text" placeholder="🔍 Cari produk Shopee..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
              <div className="space-y-1">
                {searchedProducts.slice(0, 8).map(p => {
                  const linked = linkedShopeeIds.has(p.productId)
                  return (
                    <div key={p.productId}
                         className="flex items-center gap-2 p-2.5 rounded-[8px] transition-all"
                         style={{
                           background: linked ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)",
                           border: `1px solid ${linked ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
                           cursor: linked ? "default" : "pointer",
                         }}
                         onClick={() => !linked && handleLinkShopee(p.productId)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {p.name}
                        </div>
                        <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{p.productId}</div>
                      </div>
                      {linked
                        ? <span className="text-xs flex-shrink-0" style={{ color: "#a5b4fc" }}>✓ Linked</span>
                        : <span className="text-xs flex-shrink-0" style={{ color: "rgba(99,102,241,0.6)" }}>+ Link</span>
                      }
                    </div>
                  )
                })}
                {searchedProducts.length === 0 && (
                  <div className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Tidak ada produk ditemukan
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "manual" && (
            <div className="space-y-3">
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                Untuk produk yang belum listing di Shopee.
              </div>
              <input type="text" placeholder="Nama produk..." value={manualNama}
                onChange={e => { setManualNama(e.target.value); setDupError(null) }}
                onKeyDown={e => e.key === "Enter" && handleLinkManual()}
                className="glass-input w-full h-10 rounded-[8px] px-3 text-sm" />
              {dupError && (
                <div className="text-xs px-3 py-2 rounded-[6px]"
                     style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                  ⚠️ {dupError}
                </div>
              )}
              <button
                onClick={handleLinkManual}
                disabled={!manualNama.trim() || addLink.isPending}
                className="w-full h-10 rounded-[8px] text-sm font-semibold text-white transition-all"
                style={{
                  background: manualNama.trim() && !addLink.isPending
                    ? "linear-gradient(135deg, #5055e8, #7c84f8)"
                    : "rgba(99,102,241,0.3)",
                  cursor: manualNama.trim() && !addLink.isPending ? "pointer" : "not-allowed",
                }}>
                {addLink.isPending ? "Menyimpan..." : "+ Tambah Manual"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
