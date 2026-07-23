"use client"

import { useState } from "react"
import { useProdukHistory, useAddHistory, useDeleteHistory } from "@/lib/hooks/use-history"

interface Props {
  produkId: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export function HistorySection({ produkId }: Props) {
  const { data, isLoading } = useProdukHistory(produkId)
  const addMut = useAddHistory(produkId)
  const deleteMut = useDeleteHistory(produkId)

  const [showForm, setShowForm] = useState(false)
  const [qty, setQty] = useState(1)
  const [catatan, setCatatan] = useState("")
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10))

  const items = data?.items ?? []
  const stats = data?.stats

  async function handleAdd() {
    if (qty < 1) return
    await addMut.mutateAsync({
      qty,
      catatan: catatan.trim() || null,
      tanggal: new Date(tanggal).toISOString(),
    })
    setShowForm(false)
    setQty(1)
    setCatatan("")
    setTanggal(new Date().toISOString().slice(0, 10))
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider g-accent">
          Riwayat Cetak
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="h-7 px-3 rounded-[5px] text-[10px] font-medium transition-all"
          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}
        >
          {showForm ? "Batal" : "+ Tambah Cetak"}
        </button>
      </div>

      {/* Stats row */}
      {stats && stats.totalRuns > 0 && (
        <div className="flex gap-5">
          <div>
            <div className="text-[9px] uppercase tracking-wider g-t4">Total Cetak</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: "#34d399" }}>{stats.totalQty} pcs</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider g-t4">Jumlah Run</div>
            <div className="text-sm font-bold mt-0.5 g-t2">{stats.totalRuns}×</div>
          </div>
          {stats.lastPrintedAt && (
            <div>
              <div className="text-[9px] uppercase tracking-wider g-t4">Terakhir Cetak</div>
              <div className="text-sm font-bold mt-0.5 g-t2">{formatDate(stats.lastPrintedAt)}</div>
            </div>
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-[5px] p-3 space-y-2.5"
             style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1 g-accent">Qty (pcs)</div>
              <input
                type="number" min="1" value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="glass-input w-full h-9 rounded-[5px] px-3 text-sm"
              />
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1 g-accent">Tanggal</div>
              <input
                type="date" value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                className="glass-input w-full h-9 rounded-[5px] px-3 text-sm"
              />
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-1 g-accent">Catatan (opsional)</div>
            <input
              type="text" value={catatan} placeholder="Batch pertama, warna biru..."
              onChange={e => setCatatan(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              className="glass-input w-full h-9 rounded-[5px] px-3 text-sm"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={addMut.isPending || qty < 1}
            className="w-full h-9 rounded-[5px] text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
          >
            {addMut.isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      )}

      {/* History list */}
      {isLoading && (
        <div className="text-[11px] text-center py-3 g-t5">Memuat...</div>
      )}
      {!isLoading && items.length === 0 && !showForm && (
        <div className="text-[11px] text-center py-3 g-t5">Belum ada riwayat cetak</div>
      )}
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.id}
               className="g-card flex items-center gap-3 px-3 py-2 rounded-[5px] group">
            <div className="flex-shrink-0 text-sm font-bold" style={{ color: "#34d399", minWidth: 48 }}>
              {item.qty} pcs
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] g-t2">
                {formatDate(item.tanggal)}
              </div>
              {item.catatan && (
                <div className="text-[10px] truncate g-t3">
                  {item.catatan}
                </div>
              )}
            </div>
            <button
              onClick={() => deleteMut.mutate(item.id)}
              disabled={deleteMut.isPending}
              className="opacity-0 group-hover:opacity-100 text-[10px] w-6 h-6 rounded flex items-center justify-center transition-all"
              style={{ color: "rgba(239,68,68,0.6)", background: "rgba(239,68,68,0.08)" }}
            >&#10005;</button>
          </div>
        ))}
      </div>
    </div>
  )
}
