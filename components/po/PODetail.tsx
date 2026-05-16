"use client"

import { usePO, useReceivePO, useUpdatePO } from "@/lib/hooks/use-po"
import type { POStatus } from "@/lib/po/types"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

const STATUS_CONFIG: Record<POStatus, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: "Draft",    color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.05)" },
  ORDERED:   { label: "Ordered",  color: "#60a5fa",              bg: "rgba(96,165,250,0.1)"   },
  RECEIVED:  { label: "Diterima", color: "#34d399",              bg: "rgba(52,211,153,0.1)"   },
  CANCELLED: { label: "Batal",    color: "#f87171",              bg: "rgba(239,68,68,0.1)"    },
}

const TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT:     ["ORDERED", "CANCELLED"],
  ORDERED:   ["RECEIVED", "CANCELLED"],
  RECEIVED:  [],
  CANCELLED: [],
}

interface Props { poId: string; onBack: () => void }

export function PODetail({ poId, onBack }: Props) {
  const { data: po, isLoading } = usePO(poId)
  const receiveMut = useReceivePO()
  const updateMut = useUpdatePO()

  if (isLoading) return <div className="text-sm text-center py-12" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat...</div>
  if (!po) return null

  const cfg = STATUS_CONFIG[po.status]
  const transitions = TRANSITIONS[po.status]
  const poData = po

  async function changeStatus(newStatus: POStatus) {
    if (newStatus === 'RECEIVED') {
      if (!confirm(`Tandai sebagai DITERIMA?\n\nIni akan otomatis membuat ${poData.filamentItemCount} roll filament baru di stok.`)) return
      await receiveMut.mutateAsync(poData.id)
    } else {
      await updateMut.mutateAsync({ id: poData.id, input: { status: newStatus } })
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="h-8 px-3 rounded-[8px] text-xs font-medium"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
          ← Kembali
        </button>
        <div className="flex-1" />
        {transitions.map(s => {
          const c = STATUS_CONFIG[s]
          return (
            <button key={s} onClick={() => changeStatus(s)}
                    disabled={receiveMut.isPending || updateMut.isPending}
                    className="h-8 px-3 rounded-[8px] text-xs font-semibold"
                    style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}33` }}>
              → {c.label}{s === 'RECEIVED' ? ` (${po.filamentItemCount} roll)` : ""}
            </button>
          )
        })}
      </div>

      {/* PO Header */}
      <div className="rounded-[14px] p-5 space-y-3"
           style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-lg font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
              {po.nomor ?? `PO-${po.id.slice(-6).toUpperCase()}`}
            </div>
            <div className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{po.vendorNama}</div>
            <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
              {new Date(po.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          <span className="text-sm px-3 py-1 rounded-full font-semibold"
                style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
          </span>
        </div>
        {po.catatan && (
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{po.catatan}</div>
        )}
      </div>

      {/* Items table */}
      <div className="rounded-[14px] overflow-hidden"
           style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="grid text-[9px] font-semibold uppercase tracking-wider px-4 py-2"
             style={{ gridTemplateColumns: "1fr 50px 80px 50px 90px", background: "rgba(255,255,255,0.03)", color: "rgba(165,180,252,0.5)" }}>
          <span>Produk</span><span>Qty</span><span>Harga</span><span>Disc</span><span className="text-right">Total</span>
        </div>
        {po.items.map(item => (
          <div key={item.id}
               className="grid px-4 py-3 items-start text-xs"
               style={{ gridTemplateColumns: "1fr 50px 80px 50px 90px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.8)" }}>{item.namaProduct}</div>
              {item.kode && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{item.kode}</div>}
              {item.isFilament && (
                <div className="mt-0.5 flex gap-1.5 flex-wrap">
                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}>
                    🧵 {[item.brand, item.material, item.colorName].filter(Boolean).join(" · ")}
                  </span>
                  {po.status !== 'RECEIVED' && (
                    <span className="text-[9px]" style={{ color: "rgba(52,211,153,0.6)" }}>
                      → {Math.floor(item.qty)} roll
                    </span>
                  )}
                </div>
              )}
            </div>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>{item.qty} {item.uom}</span>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>{fmt(item.harga)}</span>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>{item.diskon > 0 ? `${item.diskon}%` : "—"}</span>
            <span className="text-right font-semibold" style={{ color: "#a5b4fc" }}>{fmt(item.total)}</span>
          </div>
        ))}
        <div className="flex justify-between px-4 py-3"
             style={{ borderTop: "2px solid rgba(255,255,255,0.08)", background: "rgba(99,102,241,0.05)" }}>
          <span className="text-xs font-bold" style={{ color: "rgba(165,180,252,0.7)" }}>TOTAL</span>
          <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>{fmt(po.grandTotal)}</span>
        </div>
      </div>

      {po.status === 'RECEIVED' && po.filamentItemCount > 0 && (
        <div className="text-xs px-4 py-3 rounded-[10px]"
             style={{ background: "rgba(52,211,153,0.08)", color: "#34d399", border: "1px solid rgba(52,211,153,0.15)" }}>
          ✅ {po.filamentItemCount} roll filament sudah ditambahkan ke stok saat order diterima
        </div>
      )}
    </div>
  )
}
