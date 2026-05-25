"use client"

import { useRef, useState, useEffect } from "react"
import { useInvoice, useUpdateInvoice, useAddPayment, useDeletePayment, usePaymentMethods } from "@/lib/hooks/use-invoice"
import type { QuotationStatus, QuotationItemInput } from "@/lib/invoice/types"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}
function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

function parseDiskonInput(input: string, mode: 'Rp' | '%', baseAmount: number): { diskon: number; diskonPct: number | null } {
  const val = parseFloat(input) || 0
  if (mode === '%') {
    const pct = Math.min(100, Math.max(0, val))
    return { diskon: Math.round(baseAmount * pct / 100), diskonPct: pct }
  }
  return { diskon: Math.round(Math.max(0, val)), diskonPct: null }
}

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: "Draft",    color: "var(--g-t2)",  bg: "var(--g-inner)",         border: "var(--g-inner-border)" },
  SENT:      { label: "Terkirim", color: "#60a5fa",      bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.2)"  },
  PAID:      { label: "Lunas",    color: "#34d399",      bg: "rgba(52,211,153,0.1)",   border: "rgba(52,211,153,0.2)"  },
  PARTIAL:   { label: "DP",       color: "#fbbf24",      bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.2)"  },
  CANCELLED: { label: "Batal",    color: "#f87171",      bg: "rgba(239,68,68,0.1)",    border: "rgba(239,68,68,0.2)"   },
}

const STATUS_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT:     ["SENT", "CANCELLED"],
  SENT:      ["PARTIAL", "PAID", "CANCELLED"],
  PARTIAL:   ["PAID", "CANCELLED"],
  PAID:      ["CANCELLED"],
  CANCELLED: ["DRAFT"],
}

interface EditItem extends QuotationItemInput {
  key: string
  diskon: number
  diskonPct: number | null
  diskonMode: 'Rp' | '%'
}
let _editKey = 0
function nextEditKey() { return `ei-${++_editKey}` }

interface Props {
  invoiceId: string
  onBack: () => void
  onEdit?: () => void
}

export function InvoiceDetail({ invoiceId, onBack }: Props) {
  const { data: inv, isLoading } = useInvoice(invoiceId)
  const { data: paymentMethods } = usePaymentMethods()
  const updateMut = useUpdateInvoice()
  const addPaymentMut = useAddPayment()
  const deletePaymentMut = useDeletePayment()
  const methods = paymentMethods ?? ["Bank Jago", "Cash", "QRIS", "Shopee", "Tokopedia", "TikTok"]
  const printRef = useRef<HTMLDivElement>(null)
  const [exportingJpeg, setExportingJpeg] = useState(false)

  // Payment form state
  const [showPayForm, setShowPayForm] = useState(false)
  const [payMetode, setPayMetode] = useState("")
  const [payJumlah, setPayJumlah] = useState("")
  const [payTanggal, setPayTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [payCatatan, setPayCatatan] = useState("")
  const [payError, setPayError] = useState<string | null>(null)

  // Ongkir inline edit
  const [ongkirEdit, setOngkirEdit] = useState(false)
  const [ongkirVal, setOngkirVal] = useState("")

  // Edit mode — items + info
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [editOngkir, setEditOngkir] = useState("")
  const [editDueDate, setEditDueDate] = useState("")
  const [editCatatan, setEditCatatan] = useState("")
  const [editBuyerNama, setEditBuyerNama] = useState("")
  const [editBuyerContact, setEditBuyerContact] = useState("")

  // Edit mode — global diskon
  const [editDiskonGlobal, setEditDiskonGlobal] = useState(0)
  const [editDiskonGlobalPct, setEditDiskonGlobalPct] = useState<number | null>(null)
  const [editDiskonGlobalMode, setEditDiskonGlobalMode] = useState<'Rp' | '%'>('Rp')
  const [editDiskonGlobalInput, setEditDiskonGlobalInput] = useState("")

  // Sync edit state when invoice loads
  useEffect(() => {
    if (!inv) return
    setOngkirVal(inv.ongkir > 0 ? String(inv.ongkir) : "")
  }, [inv])

  if (isLoading) return <div className="text-center py-12 text-sm g-t4">Memuat...</div>
  if (!inv) return null

  const invoice = inv
  const cfg = STATUS_CONFIG[invoice.status]
  const transitions = STATUS_TRANSITIONS[invoice.status]
  const canEdit = invoice.status !== "PAID" && invoice.status !== "CANCELLED"
  const hasOngkir = invoice.ongkir > 0
  const hasPayments = invoice.payments.length > 0
  const hasSisa = invoice.sisaBayar > 0 && hasPayments  // only show sisa when there are actual payments

  function updateEditItem(key: string, patch: Partial<EditItem>) {
    setEditItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i))
  }

  function enterEditMode() {
    setEditItems(invoice.items.map(i => ({
      key: nextEditKey(),
      produkInternalId: i.produkInternalId,
      namaProduk: i.namaProduk,
      qty: i.qty,
      hargaPerUnit: i.hargaPerUnit,
      channelHarga: i.channelHarga,
      catatan: i.catatan ?? null,
      diskon: i.diskon ?? 0,
      diskonPct: i.diskonPct ?? null,
      diskonMode: (i.diskonPct != null ? '%' : 'Rp') as 'Rp' | '%',
    })))
    setEditOngkir(invoice.ongkir > 0 ? String(invoice.ongkir) : "")
    setEditDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : "")
    setEditCatatan(invoice.catatan ?? "")
    setEditBuyerNama(invoice.buyerNama)
    setEditBuyerContact(invoice.buyerContact ?? "")
    setEditDiskonGlobal(invoice.diskonGlobal ?? 0)
    setEditDiskonGlobalPct(invoice.diskonGlobalPct ?? null)
    setEditDiskonGlobalMode(invoice.diskonGlobalPct != null ? '%' : 'Rp')
    setEditDiskonGlobalInput(
      invoice.diskonGlobalPct != null ? String(invoice.diskonGlobalPct) :
      (invoice.diskonGlobal ?? 0) > 0 ? String(invoice.diskonGlobal) : ""
    )
    setEditMode(true)
  }

  async function handleSaveEdit() {
    const ongkirNum = parseInt(editOngkir.replace(/\D/g, "")) || 0
    await updateMut.mutateAsync({
      id: invoice.id,
      input: {
        buyerNama: editBuyerNama.trim() || invoice.buyerNama,
        buyerContact: editBuyerContact.trim() || null,
        catatan: editCatatan.trim() || null,
        dueDate: editDueDate || null,
        ongkir: ongkirNum,
        diskonGlobal: editDiskonGlobal,
        diskonGlobalPct: editDiskonGlobalPct,
        items: editItems
          .filter(i => i.namaProduk.trim())
          .map(({ key: _k, diskonMode: _dm, ...rest }) => rest),
      },
    })
    setEditMode(false)
  }

  async function handleStatusChange(newStatus: QuotationStatus) {
    await updateMut.mutateAsync({ id: invoice.id, input: { status: newStatus } })
  }

  async function handleSaveOngkir() {
    const num = parseInt(ongkirVal.replace(/\D/g, "")) || 0
    await updateMut.mutateAsync({ id: invoice.id, input: { ongkir: num } })
    setOngkirEdit(false)
  }

  async function handleSavePayment() {
    const jumlah = parseInt(payJumlah.replace(/\D/g, ""))
    if (!jumlah || jumlah <= 0) { setPayError("Jumlah harus diisi"); return }
    setPayError(null)
    try {
      await addPaymentMut.mutateAsync({
        id: invoice.id,
        input: { tanggal: payTanggal || null, jumlah, metode: payMetode || methods[0] || "Transfer", catatan: payCatatan.trim() || null },
      })
      setPayJumlah(""); setPayCatatan("")
      setPayTanggal(new Date().toISOString().slice(0, 10))
      setShowPayForm(false)
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Gagal menyimpan")
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!confirm("Hapus pembayaran ini?")) return
    await deletePaymentMut.mutateAsync({ id: invoice.id, paymentId })
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
    } finally { setExportingJpeg(false) }
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
      @media print{body{padding:20px}button{display:none!important}}
    </style></head><body>${printRef.current.innerHTML}</body></html>`)
    win.document.close(); win.focus()
    setTimeout(() => win.print(), 300)
  }

  // ── Edit mode render ───────────────────────────────────────────
  if (editMode) {
    const editSubtotal = editItems.reduce((s, i) => s + i.qty * i.hargaPerUnit - i.diskon, 0)
    const editOngkirNum = parseInt(editOngkir.replace(/\D/g, "")) || 0
    const editTotal = editSubtotal - editDiskonGlobal + editOngkirNum

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditMode(false)} className="g-btn-ghost h-8 px-3 rounded-[8px] text-xs font-medium">
            ← Batal Edit
          </button>
          <div className="text-sm font-semibold g-t1">{invoice.nomor}</div>
          <div className="flex-1" />
          <button onClick={handleSaveEdit} disabled={updateMut.isPending}
                  className="h-8 px-4 rounded-[8px] text-xs font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
            {updateMut.isPending ? "Menyimpan..." : "💾 Simpan"}
          </button>
        </div>

        <div className="g-card rounded-[14px] p-5 space-y-4">
          {/* Buyer info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Nama Buyer</div>
              <input type="text" value={editBuyerNama} onChange={e => setEditBuyerNama(e.target.value)}
                     className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">No. HP / WA</div>
              <input type="text" value={editBuyerContact} onChange={e => setEditBuyerContact(e.target.value)}
                     placeholder="08xx..." className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Due Date</div>
              <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                     className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Ongkir</div>
              <input type="number" min="0" value={editOngkir} onChange={e => setEditOngkir(e.target.value)}
                     placeholder="0" className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Catatan</div>
              <input type="text" value={editCatatan} onChange={e => setEditCatatan(e.target.value)}
                     placeholder="Catatan untuk buyer..." className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
            </div>
          </div>

          {/* Items */}
          <div style={{ borderTop: "1px solid var(--g-inner-border)", paddingTop: 16 }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2 g-accent">
              Item ({editItems.length})
            </div>
            <div className="space-y-2">
              {editItems.map(item => (
                <div key={item.key}>
                  <div className="grid gap-2 items-center"
                       style={{ gridTemplateColumns: "1fr 80px 120px 28px" }}>
                    <input type="text" value={item.namaProduk}
                      onChange={e => setEditItems(prev => prev.map(i => i.key === item.key ? { ...i, namaProduk: e.target.value } : i))}
                      placeholder="Nama produk" className="glass-input h-9 rounded-[8px] px-3 text-xs" />
                    <input type="number" min="1" value={item.qty}
                      onChange={e => setEditItems(prev => prev.map(i => i.key === item.key ? { ...i, qty: parseInt(e.target.value) || 1 } : i))}
                      className="glass-input h-9 rounded-[8px] px-3 text-xs" />
                    <input type="number" min="0" value={item.hargaPerUnit || ""}
                      onChange={e => setEditItems(prev => prev.map(i => i.key === item.key ? { ...i, hargaPerUnit: parseInt(e.target.value) || 0 } : i))}
                      placeholder="Harga/unit" className="glass-input h-9 rounded-[8px] px-3 text-xs" />
                    <button onClick={() => setEditItems(prev => prev.filter(i => i.key !== item.key))}
                      className="h-9 w-7 rounded-[6px] flex items-center justify-center text-xs"
                      style={{ color: "#f87171", background: "rgba(239,68,68,0.08)" }}>✕</button>
                  </div>
                  <div className="flex items-center gap-2 pl-1 mt-1">
                    <span className="text-[10px] g-t5">Diskon:</span>
                    <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
                      {(['Rp', '%'] as const).map(m => (
                        <button key={m} onClick={() => {
                          const base = item.qty * item.hargaPerUnit
                          if (m === '%' && item.diskon > 0 && base > 0) {
                            const pct = Math.round(item.diskon / base * 1000) / 10
                            updateEditItem(item.key, { diskonMode: m, diskonPct: pct })
                          } else {
                            updateEditItem(item.key, { diskonMode: m })
                          }
                        }}
                          className="px-2 py-0.5 text-[9px] font-medium transition-colors"
                          style={item.diskonMode === m
                            ? { background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }
                            : { background: "transparent", color: "var(--g-t4)" }}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" min="0"
                      value={item.diskonMode === '%' ? (item.diskonPct ?? 0) : (item.diskon || "")}
                      onChange={e => {
                        const base = item.qty * item.hargaPerUnit
                        const { diskon, diskonPct } = parseDiskonInput(e.target.value, item.diskonMode, base)
                        updateEditItem(item.key, { diskon, diskonPct })
                      }}
                      placeholder="0"
                      className="glass-input h-7 w-20 rounded-[6px] px-2 text-xs" />
                    {item.diskon > 0 && (
                      <span className="text-[10px] g-t4">= -{fmt(item.diskon)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setEditItems(prev => [...prev, { key: nextEditKey(), namaProduk: "", qty: 1, hargaPerUnit: 0, channelHarga: "offline", catatan: null, diskon: 0, diskonPct: null, diskonMode: 'Rp' }])}
              className="mt-2 text-xs font-medium transition-colors"
              style={{ color: "rgba(99,102,241,0.7)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}>
              + Tambah item
            </button>
          </div>

          {/* Running total */}
          {editItems.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-[10px]"
                 style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <div className="text-xs g-t3 space-y-0.5">
                <div>Subtotal: {fmt(editSubtotal)}</div>
                {/* Global diskon in edit mode */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs g-t3 shrink-0">Diskon global:</span>
                  <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
                    {(['Rp', '%'] as const).map(m => (
                      <button key={m} onClick={() => {
                        setEditDiskonGlobalMode(m)
                        setEditDiskonGlobalInput("")
                        setEditDiskonGlobal(0)
                        setEditDiskonGlobalPct(null)
                      }}
                        className="px-2 py-0.5 text-[9px] font-medium transition-colors"
                        style={editDiskonGlobalMode === m
                          ? { background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }
                          : { background: "transparent", color: "var(--g-t4)" }}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" min="0"
                    value={editDiskonGlobalInput}
                    onChange={e => {
                      setEditDiskonGlobalInput(e.target.value)
                      const base = editItems.reduce((s, i) => s + i.qty * i.hargaPerUnit - i.diskon, 0)
                      const { diskon, diskonPct } = parseDiskonInput(e.target.value, editDiskonGlobalMode, base)
                      setEditDiskonGlobal(diskon)
                      setEditDiskonGlobalPct(diskonPct)
                    }}
                    placeholder="0"
                    className="glass-input h-7 w-24 rounded-[6px] px-2 text-xs" />
                  {editDiskonGlobal > 0 && editDiskonGlobalMode === '%' && (
                    <span className="text-[10px] g-t4">= -{fmt(editDiskonGlobal)}</span>
                  )}
                </div>
                {editOngkirNum > 0 && <div>Ongkir: {fmt(editOngkirNum)}</div>}
              </div>
              <span className="text-base font-bold" style={{ color: "#a5b4fc" }}>{fmt(editTotal)}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Normal view ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="g-btn-ghost h-8 px-3 rounded-[8px] text-xs font-medium">
          ← Kembali
        </button>
        {canEdit && (
          <button onClick={enterEditMode}
                  className="h-8 px-3 rounded-[8px] text-xs font-semibold"
                  style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}>
            ✏️ Edit
          </button>
        )}
        {invoice.shopeeOrderSn && (
          <div className="text-xs g-t3">🛍️ Order: #{invoice.shopeeOrderSn}</div>
        )}
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
                style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}>
          {exportingJpeg ? "⋯" : "📸 JPEG"}
        </button>
        <button onClick={handlePrint}
                className="h-8 px-3 rounded-[8px] text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
          🖨️ Print
        </button>
      </div>

      {/* Payment panel */}
      <div className="g-card rounded-[14px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider g-accent">Riwayat Pembayaran</div>
          <div className="flex items-center gap-2">
            {/* Ongkir inline edit */}
            {canEdit && (
              ongkirEdit ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] g-t4">Ongkir:</span>
                  <input type="number" min="0" value={ongkirVal} onChange={e => setOngkirVal(e.target.value)}
                    autoFocus className="glass-input h-7 w-28 rounded-[6px] px-2 text-xs"
                    onKeyDown={e => { if (e.key === "Enter") handleSaveOngkir(); if (e.key === "Escape") setOngkirEdit(false) }} />
                  <button onClick={handleSaveOngkir} disabled={updateMut.isPending}
                    className="h-7 px-2 rounded-[5px] text-xs font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>✓</button>
                  <button onClick={() => setOngkirEdit(false)} className="h-7 px-2 rounded-[5px] text-xs g-btn-ghost">✕</button>
                </div>
              ) : (
                <button onClick={() => setOngkirEdit(true)}
                  className="h-7 px-2.5 rounded-[6px] text-[10px] font-medium g-btn-ghost">
                  {invoice.ongkir > 0 ? `🚚 Ongkir: ${fmt(invoice.ongkir)}` : "+ Ongkir"}
                </button>
              )
            )}
            {!ongkirEdit && (
              <button onClick={() => setShowPayForm(v => !v)}
                      className="h-7 px-3 rounded-[7px] text-xs font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
                + Bayar
              </button>
            )}
          </div>
        </div>

        {/* Payment rows */}
        {invoice.payments.length === 0 && !showPayForm && (
          <div className="text-xs g-t4 py-1">Belum ada pembayaran</div>
        )}
        {invoice.payments.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-[8px]"
               style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
            <div className="text-xs g-t4 flex-shrink-0 w-24">{formatDateShort(p.tanggal)}</div>
            <div className="text-xs font-medium flex-shrink-0"
                 style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", borderRadius: 4, padding: "1px 6px" }}>
              {p.metode}
            </div>
            <div className="text-sm font-bold flex-1 g-t1">{fmt(p.jumlah)}</div>
            {p.catatan && <div className="text-[10px] g-t4 truncate max-w-[120px]">{p.catatan}</div>}
            <button onClick={() => handleDeletePayment(p.id)} disabled={deletePaymentMut.isPending}
              className="h-6 w-6 flex items-center justify-center rounded-[5px] text-[10px] flex-shrink-0"
              style={{ color: "#f87171", background: "rgba(239,68,68,0.08)" }}>✕</button>
          </div>
        ))}

        {/* Add payment form */}
        {showPayForm && (
          <div className="rounded-[10px] p-3 space-y-3"
               style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Metode</div>
                <select value={payMetode || methods[0] || ""} onChange={e => setPayMetode(e.target.value)}
                        className="glass-input w-full h-9 rounded-[8px] px-3 text-xs">
                  {methods.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Jumlah (Rp)</div>
                <input type="number" min="0" value={payJumlah} onChange={e => setPayJumlah(e.target.value)}
                       placeholder={invoice.sisaBayar > 0 ? String(invoice.sisaBayar) : "0"}
                       className="glass-input w-full h-9 rounded-[8px] px-3 text-xs" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Tanggal</div>
                <input type="date" value={payTanggal} onChange={e => setPayTanggal(e.target.value)}
                       className="glass-input w-full h-9 rounded-[8px] px-3 text-xs" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent">Catatan (opsional)</div>
                <input type="text" value={payCatatan} onChange={e => setPayCatatan(e.target.value)}
                       placeholder="Catatan..." className="glass-input w-full h-9 rounded-[8px] px-3 text-xs" />
              </div>
            </div>
            {payError && (
              <div className="text-xs px-2 py-1.5 rounded-[6px]"
                   style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{payError}</div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowPayForm(false); setPayError(null) }}
                      className="g-btn-ghost flex-1 h-8 rounded-[7px] text-xs">Batal</button>
              <button onClick={handleSavePayment} disabled={addPaymentMut.isPending}
                      className="flex-1 h-8 rounded-[7px] text-xs font-semibold text-white"
                      style={{ background: addPaymentMut.isPending ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
                {addPaymentMut.isPending ? "Menyimpan..." : "Simpan Bayar"}
              </button>
            </div>
          </div>
        )}

        {/* Summary — only when there are payments */}
        {hasPayments && (
          <div className="flex items-center gap-4 pt-1 flex-wrap" style={{ borderTop: "1px solid var(--g-inner-border)" }}>
            <span className="text-xs g-t4">Total Bayar:</span>
            <span className="text-sm font-bold" style={{ color: "#34d399" }}>{fmt(invoice.totalPaid)}</span>
            {hasSisa && (
              <>
                <span className="text-xs g-t4">Sisa:</span>
                <span className="text-sm font-bold" style={{ color: "#f87171" }}>{fmt(invoice.sisaBayar)}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* White paper preview */}
      <div className="g-card rounded-[14px] p-5">
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
              {invoice.shopeeOrderSn && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                  Order Shopee: #{invoice.shopeeOrderSn}
                </div>
              )}
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
                {["Produk", "Qty", "Harga/unit", "Subtotal"].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? "left" : "right", fontSize: 10, textTransform: "uppercase",
                    letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
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

          {/* Totals */}
          <div style={{ marginTop: 8 }}>
            {hasOngkir && (
              <>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>Subtotal Produk</span><span>{fmt(invoice.subtotalProduk)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                  <span>Ongkos Kirim</span><span>{fmt(invoice.ongkir)}</span>
                </div>
              </>
            )}

            {/* Diskon breakdown — only show if there's any diskon */}
            {(invoice.diskonGlobal > 0 || invoice.items.some(i => i.diskon > 0)) && (
              <>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>Subtotal produk</span>
                  <span>{fmt(invoice.subtotalProduk + invoice.items.reduce((s, i) => s + (i.diskon ?? 0), 0))}</span>
                </div>
                {invoice.items.some(i => i.diskon > 0) && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                    <span>- Diskon item</span>
                    <span>-{fmt(invoice.items.reduce((s, i) => s + (i.diskon ?? 0), 0))}</span>
                  </div>
                )}
                {invoice.diskonGlobal > 0 && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>- Diskon global{invoice.diskonGlobalPct != null ? ` (${invoice.diskonGlobalPct}%)` : ""}</span>
                    <span>-{fmt(invoice.diskonGlobal)}</span>
                  </div>
                )}
              </>
            )}

            <div style={{ border: "2px solid #111", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(invoice.total)}</div>
            </div>

            {invoice.payments.map((p, idx) => (
              <div key={p.id} style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 4 }}>
                    Pembayaran {idx + 1} · {p.metode}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a" }}>{fmt(p.jumlah)}</div>
                  {p.catatan && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{p.catatan}</div>}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>{formatDate(p.tanggal)}</div>
              </div>
            ))}

            {/* Sisa bayar — only shown in print when there are payments but not fully paid */}
            {hasPayments && hasSisa && (
              <div style={{ marginTop: 8, border: "2px solid #dc2626", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#dc2626" }}>Sisa Bayar</div>
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
