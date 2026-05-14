"use client"

import { useRef, useState } from "react"
import { useInvoice, useUpdateInvoice } from "@/lib/hooks/use-invoice"
import type { QuotationStatus } from "@/lib/invoice/types"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: "Draft",    color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)" },
  SENT:      { label: "Terkirim", color: "#60a5fa",              bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.2)"  },
  PAID:      { label: "Lunas",    color: "#34d399",              bg: "rgba(52,211,153,0.1)",   border: "rgba(52,211,153,0.2)"  },
  PARTIAL:   { label: "DP",       color: "#fbbf24",              bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.2)"  },
  CANCELLED: { label: "Batal",    color: "#f87171",              bg: "rgba(239,68,68,0.1)",    border: "rgba(239,68,68,0.2)"   },
}

const STATUS_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT:     ["SENT", "CANCELLED"],
  SENT:      ["PAID", "PARTIAL", "CANCELLED"],
  PARTIAL:   ["PAID", "CANCELLED"],
  PAID:      [],
  CANCELLED: ["DRAFT"],
}

interface Props {
  invoiceId: string
  onBack: () => void
  onEdit?: () => void
}

export function InvoiceDetail({ invoiceId, onBack }: Props) {
  const { data: inv, isLoading } = useInvoice(invoiceId)
  const updateMut = useUpdateInvoice()
  const printRef = useRef<HTMLDivElement>(null)
  const [showDpForm, setShowDpForm] = useState(false)
  const [dpAmount, setDpAmount] = useState("")
  const [exportingJpeg, setExportingJpeg] = useState(false)

  if (isLoading) return <div className="text-center py-12 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat...</div>
  if (!inv) return null

  // inv is guaranteed non-null from here on
  const invoice = inv
  const cfg = STATUS_CONFIG[invoice.status]
  const transitions = STATUS_TRANSITIONS[invoice.status]

  async function handleStatusChange(newStatus: QuotationStatus) {
    if (newStatus === "PARTIAL") { setShowDpForm(true); return }
    await updateMut.mutateAsync({ id: invoice.id, input: { status: newStatus } })
  }

  async function handleSetDp() {
    const amount = parseInt(dpAmount.replace(/\D/g, ""))
    if (!amount || amount <= 0) return
    await updateMut.mutateAsync({ id: invoice.id, input: { status: "PARTIAL", dpAmount: amount, dpTanggal: new Date().toISOString() } })
    setShowDpForm(false)
    setDpAmount("")
  }

  async function handleExportJpeg() {
    if (!printRef.current) return
    setExportingJpeg(true)
    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" })
      const link = document.createElement("a")
      link.download = `${invoice.nomor}-${invoice.buyerNama.replace(/\s+/g, "-")}.jpg`
      link.href = canvas.toDataURL("image/jpeg", 0.92)
      link.click()
    } finally {
      setExportingJpeg(false)
    }
  }

  function handlePrint() {
    if (!printRef.current) return
    const win = window.open("", "_blank", "width=640,height=900")
    if (!win) return
    win.document.write(`<html><head><title>${invoice.nomor}</title><meta charset="utf-8"/><style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;font-size:13px;color:#111;padding:32px}
      h1{font-size:20px;font-weight:700}table{width:100%;border-collapse:collapse}
      th{font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:left}
      th.r,td.r{text-align:right}td{padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12px}
      .total-box{border:2px solid #111;border-radius:8px;padding:14px;margin-top:16px;display:flex;justify-content:space-between;align-items:center}
      .total-box .lbl{font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#555}
      .total-box .val{font-size:20px;font-weight:700}
      @media print{body{padding:20px}button{display:none!important}}
    </style></head><body>${printRef.current.innerHTML}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="h-8 px-3 rounded-[8px] text-xs font-medium"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
          ← Kembali
        </button>
        <div className="flex-1" />
        {transitions.map(s => (
          <button key={s} onClick={() => handleStatusChange(s)}
                  disabled={updateMut.isPending}
                  className="h-8 px-3 rounded-[8px] text-xs font-semibold"
                  style={{ background: STATUS_CONFIG[s].bg, color: STATUS_CONFIG[s].color, border: `1px solid ${STATUS_CONFIG[s].border}` }}>
            → {STATUS_CONFIG[s].label}
          </button>
        ))}
        <button onClick={handleExportJpeg} disabled={exportingJpeg}
                className="h-8 px-3 rounded-[8px] text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>
          {exportingJpeg ? "⋯" : "📸 JPEG"}
        </button>
        <button onClick={handlePrint}
                className="h-8 px-3 rounded-[8px] text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
          🖨️ Print
        </button>
      </div>

      {/* DP form */}
      {showDpForm && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-[10px]"
             style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
          <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>Jumlah DP:</span>
          <input type="text" value={dpAmount} onChange={e => setDpAmount(e.target.value)}
            placeholder="Rp 50.000" className="glass-input h-8 w-40 rounded-[7px] px-3 text-xs" />
          <button onClick={handleSetDp}
                  className="h-8 px-3 rounded-[7px] text-xs font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>Simpan DP</button>
          <button onClick={() => setShowDpForm(false)}
                  className="h-8 px-3 rounded-[7px] text-xs"
                  style={{ color: "rgba(255,255,255,0.4)" }}>Batal</button>
        </div>
      )}

      {/* White paper preview */}
      <div className="rounded-[14px] p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div ref={printRef} className="bg-white rounded-[10px] p-8" style={{ color: "#111" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{invoice.nomor}</h1>
              <div style={{ fontSize: 12, color: "#666" }}>Tanggal: {formatDate(invoice.tanggal)}</div>
              {invoice.dueDate && <div style={{ fontSize: 12, color: "#666" }}>Due: {formatDate(invoice.dueDate)}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{invoice.buyerNama}</div>
              {invoice.buyerContact && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{invoice.buyerContact}</div>}
              <div style={{ marginTop: 6, display: "inline-block", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                padding: "2px 8px", borderRadius: 4, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                {cfg.label}
              </div>
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "2px solid #111", marginBottom: 14 }} />

          {/* Items table */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Produk</th>
                <th style={{ textAlign: "right", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Qty</th>
                <th style={{ textAlign: "right", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Harga/unit</th>
                <th style={{ textAlign: "right", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map(item => (
                <tr key={item.id}>
                  <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
                    {item.namaProduk}
                    {item.catatan && <div style={{ fontSize: 10, color: "#999" }}>{item.catatan}</div>}
                  </td>
                  <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, textAlign: "right" }}>{item.qty}</td>
                  <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, textAlign: "right" }}>{fmt(item.hargaPerUnit)}</td>
                  <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, textAlign: "right" }}>{fmt(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total boxes */}
          <div style={{ display: "grid", gridTemplateColumns: invoice.dpAmount != null ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12 }}>
            <div style={{ border: "2px solid #111", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 4 }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(invoice.total)}</div>
            </div>
            {invoice.dpAmount != null && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 4 }}>DP Dibayar</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{fmt(invoice.dpAmount)}</div>
                {invoice.dpTanggal && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{formatDate(invoice.dpTanggal)}</div>}
              </div>
            )}
            {invoice.dpAmount != null && (
              <div style={{ border: "2px solid #dc2626", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#dc2626", marginBottom: 4 }}>Sisa Bayar</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>{fmt(invoice.sisaBayar)}</div>
              </div>
            )}
          </div>

          {invoice.catatan && (
            <div style={{ marginTop: 16, fontSize: 11, color: "#666", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 6 }}>
              Catatan: {invoice.catatan}
            </div>
          )}

          <div style={{ marginTop: 20, fontSize: 11, color: "#aaa", textAlign: "center" }}>
            Dibuat dengan 3PB Ops · {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>
    </div>
  )
}
