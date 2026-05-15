"use client"

import { useState } from "react"
import { useInvoiceList, useDeleteInvoice } from "@/lib/hooks/use-invoice"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import { InvoiceForm } from "@/components/invoice/InvoiceForm"
import { InvoiceDetail } from "@/components/invoice/InvoiceDetail"
import type { QuotationStatus } from "@/lib/invoice/types"

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: "Draft",     color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.05)",  border: "rgba(255,255,255,0.1)"  },
  SENT:      { label: "Terkirim",  color: "#60a5fa",               bg: "rgba(96,165,250,0.1)",     border: "rgba(96,165,250,0.2)"   },
  PAID:      { label: "Lunas",     color: "#34d399",               bg: "rgba(52,211,153,0.1)",     border: "rgba(52,211,153,0.2)"   },
  PARTIAL:   { label: "DP",        color: "#fbbf24",               bg: "rgba(251,191,36,0.1)",     border: "rgba(251,191,36,0.2)"   },
  CANCELLED: { label: "Batal",     color: "#f87171",               bg: "rgba(239,68,68,0.1)",      border: "rgba(239,68,68,0.2)"    },
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export function InvoiceClientPage() {
  const { data: items, isLoading } = useInvoiceList()
  const deleteMut = useDeleteInvoice()
  const [showForm, setShowForm] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<QuotationStatus | "all">("all")

  const allItems = items ?? []
  const filtered = filterStatus === "all" ? allItems : allItems.filter(i => i.status === filterStatus)

  async function handleDelete(id: string, nomor: string) {
    if (!confirm(`Hapus invoice ${nomor}?`)) return
    await deleteMut.mutateAsync(id)
  }

  if (viewId) {
    return (
      <InvoiceDetail
        invoiceId={viewId}
        onBack={() => setViewId(null)}
        onEdit={() => { setViewId(null); setShowForm(true) }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <GlassPageHeader title="Invoice" subtitle="Kelola quotation dan invoice untuk buyer">
        <button
          onClick={() => setShowForm(true)}
          className="h-9 px-4 rounded-[10px] text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
        >
          + Buat Invoice
        </button>
      </GlassPageHeader>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "DRAFT", "SENT", "PAID", "PARTIAL", "CANCELLED"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="h-7 px-3 rounded-[8px] text-xs font-medium transition-all"
            style={filterStatus === s
              ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
              : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }
            }
          >
            {s === "all" ? "Semua" : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Invoice list */}
      {isLoading && (
        <div className="text-sm text-center py-12" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat...</div>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-[16px] gap-3"
             style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}>
          <div className="text-4xl">📄</div>
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            {filterStatus === "all" ? "Belum ada invoice. Buat invoice pertama →" : "Tidak ada invoice dengan status ini"}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(inv => {
          const cfg = STATUS_CONFIG[inv.status]
          return (
            <div
              key={inv.id}
              className="flex items-center gap-4 px-5 py-4 rounded-[12px] group transition-all cursor-pointer"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              onClick={() => setViewId(inv.id)}
            >
              {/* Nomor + buyer */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>{inv.nomor}</span>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                  >
                    {cfg.label}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {inv.buyerNama}{inv.buyerContact ? ` · ${inv.buyerContact}` : ""} · {inv.itemCount} produk
                </div>
              </div>

              {/* Date */}
              <div className="text-xs flex-shrink-0 text-right" style={{ color: "rgba(255,255,255,0.35)" }}>
                <div>{formatDate(inv.tanggal)}</div>
                {inv.dueDate && <div className="text-[10px] mt-0.5">Due: {formatDate(inv.dueDate)}</div>}
              </div>

              {/* Total */}
              <div className="text-right flex-shrink-0 min-w-[100px]">
                <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>{fmt(inv.total)}</div>
                {inv.dpAmount != null && (
                  <div className="text-[10px] mt-0.5" style={{ color: "rgba(251,191,36,0.7)" }}>
                    DP: {fmt(inv.dpAmount)} · Sisa: {fmt(inv.sisaBayar)}
                  </div>
                )}
              </div>

              {/* Delete */}
              <button
                onClick={e => { e.stopPropagation(); handleDelete(inv.id, inv.nomor) }}
                disabled={deleteMut.isPending}
                className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-[6px] flex items-center justify-center text-xs flex-shrink-0 transition-all"
                style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Create invoice form modal */}
      {showForm && (
        <InvoiceForm onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}
