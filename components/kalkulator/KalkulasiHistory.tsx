"use client"

import { useState } from "react"
import { useKalkulasiList, useDeleteKalkulasi, useDuplicateKalkulasi } from "@/lib/hooks/use-kalkulator"
import type { KalkulasiData, KalkulasiStatus } from "@/lib/kalkulator/types"

const STATUS_COLOR: Record<KalkulasiStatus, string> = {
  AMAN:        "#34d399",
  BAWAH_REKM:  "#fbbf24",
  RUGI:        "#f87171",
  TIDAK_DISET: "rgba(255,255,255,0.25)",
}
const STATUS_LABEL: Record<KalkulasiStatus, string> = {
  AMAN: "🟢", BAWAH_REKM: "🟡", RUGI: "🔴", TIDAK_DISET: "⬜",
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

interface Props {
  onEdit: (k: KalkulasiData) => void
  onLinkProduk: (k: KalkulasiData) => void
}

export function KalkulasiHistory({ onEdit, onLinkProduk }: Props) {
  const { data, isLoading } = useKalkulasiList()
  const deleteMut = useDeleteKalkulasi()
  const dupMut = useDuplicateKalkulasi()
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<KalkulasiStatus | "all">("all")
  const [dupDialog, setDupDialog] = useState<{ id: string; nama: string } | null>(null)
  const [dupNama, setDupNama] = useState("")
  const [dupBatch, setDupBatch] = useState(1)

  const items = data?.items ?? []
  const filtered = items.filter(k => {
    if (filterStatus !== "all" && k.status !== filterStatus) return false
    if (search && !k.nama.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function handleDelete(id: string) {
    if (!confirm("Hapus kalkulasi ini?")) return
    await deleteMut.mutateAsync(id)
  }

  async function handleDuplicate() {
    if (!dupDialog || !dupNama.trim()) return
    await dupMut.mutateAsync({ id: dupDialog.id, nama: dupNama.trim(), batch: dupBatch })
    setDupDialog(null)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.6)" }}>
          Riwayat Tersimpan
        </div>
        <div className="flex-1" />
        {/* Search */}
        <input
          type="text"
          placeholder="Cari..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="glass-input h-7 w-36 rounded-[8px] px-2 text-[10px]"
        />
        {/* Filter */}
        {(["all", "AMAN", "BAWAH_REKM", "RUGI"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="h-7 px-3 rounded-[8px] text-[9px] font-medium transition-all"
            style={filterStatus === s
              ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
              : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }
            }
          >
            {s === "all" ? "Semua" : STATUS_LABEL[s as KalkulasiStatus]}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat...</div>}
      {!isLoading && filtered.length === 0 && (
        <div className="text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.3)" }}>
          {items.length === 0 ? "Belum ada kalkulasi tersimpan" : "Tidak ada hasil"}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(k => (
          <div key={k.id}
               className="flex items-center gap-3 px-4 py-3 rounded-[10px] group transition-all"
               style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
               onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.06)")}
               onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}>

            {/* Status */}
            <span className="text-[14px] flex-shrink-0">{STATUS_LABEL[k.status as KalkulasiStatus]}</span>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {k.nama}
                </span>
                {k.produkLinks.length > 0 && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
                    🔗 {k.produkLinks.length}
                  </span>
                )}
                {k.produkLinks.some(l => l.isPrimary) && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.12)", color: "#34d399" }}>
                    🔑
                  </span>
                )}
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                {k.plates.length} part · batch {k.batch} · {new Date(k.createdAt).toLocaleDateString("id-ID")}
              </div>
            </div>

            {/* Prices */}
            <div className="text-right flex-shrink-0">
              <div className="text-[11px] font-bold" style={{ color: STATUS_COLOR[k.status as KalkulasiStatus] }}>
                {fmt(k.floorPrice)}
              </div>
              <div className="text-[9px]" style={{ color: "rgba(165,180,252,0.5)" }}>
                Shopee A: {fmt(k.shopeeA)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(k)}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
                Edit
              </button>
              <button onClick={() => { setDupNama(k.nama + " (copy)"); setDupBatch(k.batch); setDupDialog({ id: k.id, nama: k.nama }) }}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                Duplikat
              </button>
              <button onClick={() => onLinkProduk(k)}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                🔗
              </button>
              <button onClick={() => handleDelete(k.id)}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Duplicate Dialog */}
      {dupDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
             style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
             onClick={() => setDupDialog(null)}>
          <div className="w-80 rounded-[16px] p-6 space-y-4"
               style={{ background: "rgba(14,14,44,0.95)", border: "1px solid rgba(99,102,241,0.2)" }}
               onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-bold">Duplikat Kalkulasi</div>
            <div>
              <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: "rgba(165,180,252,0.6)" }}>Nama Baru</div>
              <input type="text" value={dupNama} onChange={e => setDupNama(e.target.value)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-[12px]" />
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: "rgba(165,180,252,0.6)" }}>Batch Baru</div>
              <input type="number" min="1" value={dupBatch} onChange={e => setDupBatch(parseInt(e.target.value) || 1)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-[12px]" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDupDialog(null)}
                className="flex-1 h-9 rounded-[8px] text-[11px]"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                Batal
              </button>
              <button onClick={handleDuplicate} disabled={!dupNama.trim() || dupMut.isPending}
                className="flex-1 h-9 rounded-[8px] text-[11px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
                {dupMut.isPending ? "..." : "Duplikat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
