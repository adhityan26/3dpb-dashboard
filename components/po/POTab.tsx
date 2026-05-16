"use client"

import { useState, useRef } from "react"
import { usePOList, useDeletePO, useOCRInvoice } from "@/lib/hooks/use-po"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import { POForm } from "./POForm"
import { PODetail } from "./PODetail"
import type { POListItem, OCRPOResult } from "@/lib/po/types"

const STATUS_CONFIG = {
  DRAFT:     { label: "Draft",    color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.05)"  },
  ORDERED:   { label: "Ordered",  color: "#60a5fa",              bg: "rgba(96,165,250,0.1)"    },
  RECEIVED:  { label: "Diterima", color: "#34d399",              bg: "rgba(52,211,153,0.1)"    },
  CANCELLED: { label: "Batal",    color: "#f87171",              bg: "rgba(239,68,68,0.1)"     },
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export function POTab() {
  const { data: items, isLoading } = usePOList()
  const deleteMut = useDeletePO()
  const ocrMut = useOCRInvoice()
  const fileRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<"list" | "create" | "detail">("list")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ocrDraft, setOcrDraft] = useState<OCRPOResult | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)

  async function handleOCR(file: File) {
    setOcrError(null)
    try {
      const result = await ocrMut.mutateAsync(file)
      setOcrDraft(result)
      setView("create")
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : "OCR gagal")
    }
  }

  if (view === "create") {
    return (
      <POForm
        ocrDraft={ocrDraft}
        onClose={() => { setView("list"); setOcrDraft(null) }}
        onSaved={(id) => { setSelectedId(id); setView("detail") }}
      />
    )
  }

  if (view === "detail" && selectedId) {
    return <PODetail poId={selectedId} onBack={() => { setSelectedId(null); setView("list") }} />
  }

  return (
    <div className="space-y-4">
      <GlassPageHeader title="Purchase Order" subtitle="Kelola pembelian filament dari vendor">
        <div className="flex gap-2">
          {/* OCR Upload */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleOCR(f); e.target.value = "" }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={ocrMut.isPending}
            className="h-9 px-4 rounded-[10px] text-sm font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
          >
            {ocrMut.isPending ? "⏳ Scanning..." : "📷 Scan Invoice"}
          </button>
          <button
            onClick={() => { setOcrDraft(null); setView("create") }}
            className="h-9 px-4 rounded-[10px] text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
          >
            + Buat PO
          </button>
        </div>
      </GlassPageHeader>

      {ocrError && (
        <div className="text-xs px-3 py-2 rounded-[8px]"
             style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
          ⚠️ {ocrError}
        </div>
      )}

      {isLoading && <div className="text-sm text-center py-12" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat...</div>}

      {!isLoading && (items ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-[16px] gap-3"
             style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}>
          <div className="text-4xl">📋</div>
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            Belum ada PO. Upload foto invoice vendor atau buat manual.
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(items ?? []).map((po: POListItem) => {
          const cfg = STATUS_CONFIG[po.status] ?? STATUS_CONFIG.DRAFT
          return (
            <div key={po.id}
                 className="flex items-center gap-4 px-5 py-4 rounded-[12px] group cursor-pointer transition-all"
                 style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                 onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.05)")}
                 onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                 onClick={() => { setSelectedId(po.id); setView("detail") }}>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
                    {po.nomor ?? `PO-${po.id.slice(-6).toUpperCase()}`}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                  {po.filamentItemCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}>
                      🧵 {po.filamentItemCount} filamen
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {po.vendorNama} · {po.itemCount} item · {fmtDate(po.tanggal)}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {fmt(po.grandTotal)}
                </div>
              </div>

              <button
                onClick={e => { e.stopPropagation(); if (confirm(`Hapus PO?`)) deleteMut.mutate(po.id) }}
                className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-[6px] flex items-center justify-center text-xs transition-all"
                style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
              >✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
