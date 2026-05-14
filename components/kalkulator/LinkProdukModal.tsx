"use client"

import { useState } from "react"
import {
  useKatalogList,
  useSetKatalogKalkulasi,
  useCreateKatalog,
} from "@/lib/hooks/use-katalog"
import type { KalkulasiData } from "@/lib/kalkulator/types"
import type { ProdukInternalData } from "@/lib/katalog/types"

interface Props {
  kalkulasi: KalkulasiData
  onClose: () => void
}

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

export function LinkProdukModal({ kalkulasi, onClose }: Props) {
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [newNama, setNewNama] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)

  const { data } = useKatalogList()
  const items: ProdukInternalData[] = data ?? []

  const setKalkulasi = useSetKatalogKalkulasi()
  const createKatalog = useCreateKatalog()

  const filtered = search.trim()
    ? items.filter(p => p.nama.toLowerCase().includes(search.toLowerCase()))
    : items

  async function handlePilih(katalogId: string) {
    await setKalkulasi.mutateAsync({ katalogId, kalkulasiId: kalkulasi.id })
    onClose()
  }

  async function handleCreateAndLink() {
    const trimmedNama = newNama.trim()
    if (!trimmedNama) {
      setCreateError("Nama produk wajib diisi.")
      return
    }
    setCreateError(null)
    try {
      const created = await createKatalog.mutateAsync({ nama: trimmedNama })
      await setKalkulasi.mutateAsync({ katalogId: created.id, kalkulasiId: kalkulasi.id })
      onClose()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Gagal menyimpan.")
    }
  }

  const isPending = setKalkulasi.isPending || createKatalog.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[440px] max-h-[80vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{
          background: "rgba(14,14,44,0.97)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
        >
          <div>
            <div className="text-[14px] font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
              🔗 Pilih Produk Katalog
            </div>
            <div className="text-[11px] mt-0.5 truncate max-w-[320px]" style={{ color: "rgba(165,180,252,0.5)" }}>
              {kalkulasi.nama}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-base transition-all"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <input
            type="text"
            placeholder="Cari produk katalog..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
            autoFocus
          />
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {filtered.length === 0 && !showCreate && (
            <div className="text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.25)" }}>
              {items.length === 0 ? "Belum ada produk di katalog." : "Tidak ada produk ditemukan."}
            </div>
          )}

          {filtered.map(p => {
            const isCurrent = p.primaryKalkulasiId === kalkulasi.id
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-3 rounded-[10px] transition-all"
                style={{
                  background: isCurrent ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isCurrent ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.88)" }}>
                    {p.nama}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {p.hppTotal != null
                      ? `HPP saat ini: ${fmt(p.hppTotal)}${p.kalkulasiNama ? ` (${p.kalkulasiNama})` : ""}`
                      : "Belum ada HPP"}
                  </div>
                </div>
                {isCurrent ? (
                  <span
                    className="text-[10px] px-2.5 py-1 rounded-full flex-shrink-0 font-medium"
                    style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
                  >
                    ✓ Aktif
                  </span>
                ) : (
                  <button
                    onClick={() => handlePilih(p.id)}
                    disabled={isPending}
                    className="h-7 px-3 rounded-[8px] text-[10px] font-semibold text-white flex-shrink-0 transition-all"
                    style={{
                      background: isPending ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #5055e8, #7c84f8)",
                      cursor: isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    Pilih
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Create new */}
        <div className="flex-shrink-0 px-5 py-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {!showCreate ? (
            <button
              onClick={() => { setShowCreate(true); setNewNama("") }}
              className="w-full h-9 rounded-[10px] text-[11px] font-medium transition-all flex items-center justify-center gap-1.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px dashed rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.45)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"
                e.currentTarget.style.color = "#a5b4fc"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"
                e.currentTarget.style.color = "rgba(255,255,255,0.45)"
              }}
            >
              + Buat Produk Baru &amp; Hubungkan
            </button>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.6)" }}>
                Nama Produk Baru
              </div>
              <input
                type="text"
                value={newNama}
                onChange={e => { setNewNama(e.target.value); setCreateError(null) }}
                onKeyDown={e => e.key === "Enter" && handleCreateAndLink()}
                placeholder="Contoh: Flexi Shark..."
                className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
                autoFocus
              />
              {createError && (
                <div
                  className="text-[10px] px-3 py-1.5 rounded-[7px]"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#f87171",
                  }}
                >
                  ⚠️ {createError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 h-9 rounded-[9px] text-[11px] transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  Batal
                </button>
                <button
                  onClick={handleCreateAndLink}
                  disabled={isPending || !newNama.trim()}
                  className="flex-1 h-9 rounded-[9px] text-[11px] font-semibold text-white transition-all"
                  style={{
                    background: isPending || !newNama.trim() ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #5055e8, #7c84f8)",
                    cursor: isPending || !newNama.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Menyimpan..." : "Buat & Hubungkan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
