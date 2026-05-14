"use client"

import { useState, useMemo } from "react"
import { useCreateInvoice } from "@/lib/hooks/use-invoice"
import { useKatalogList } from "@/lib/hooks/use-katalog"
import type { QuotationItemInput, ChannelHarga } from "@/lib/invoice/types"
import type { ProdukInternalData } from "@/lib/katalog/types"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

interface LineItem extends QuotationItemInput {
  key: string
}

let _keyCounter = 0
function nextKey() { return `item-${++_keyCounter}` }

interface Props {
  onClose: () => void
  onCreated?: (id: string) => void
}

export function InvoiceForm({ onClose, onCreated }: Props) {
  const createMut = useCreateInvoice()
  const { data: katalogItems } = useKatalogList()
  const katalog: ProdukInternalData[] = katalogItems ?? []

  const [buyerNama, setBuyerNama] = useState("")
  const [buyerContact, setBuyerContact] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [catatan, setCatatan] = useState("")
  const [items, setItems] = useState<LineItem[]>([])
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  const searchResults = search.trim()
    ? katalog.filter(p => p.nama.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : katalog.slice(0, 6)

  function addFromKatalog(p: ProdukInternalData, channel: ChannelHarga) {
    const harga = channel === "offline" ? (p.offlineA ?? 0) : (p.shopeeA ?? 0)
    setItems(prev => [...prev, {
      key: nextKey(),
      produkInternalId: p.id,
      namaProduk: p.nama,
      qty: 1,
      hargaPerUnit: harga,
      channelHarga: channel,
      catatan: null,
    }])
    setSearch("")
  }

  function addBlank() {
    setItems(prev => [...prev, {
      key: nextKey(),
      produkInternalId: null,
      namaProduk: "",
      qty: 1,
      hargaPerUnit: 0,
      channelHarga: "marketplace",
      catatan: null,
    }])
  }

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i))
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  const total = useMemo(() => items.reduce((s, i) => s + i.qty * i.hargaPerUnit, 0), [items])

  async function handleSave() {
    if (!buyerNama.trim()) { setError("Nama buyer wajib diisi"); return }
    if (!items.length) { setError("Tambahkan minimal 1 produk"); return }
    const invalidItem = items.find(i => !i.namaProduk.trim() || i.qty < 1 || i.hargaPerUnit <= 0)
    if (invalidItem) { setError("Semua item harus punya nama, qty, dan harga"); return }
    setError(null)
    try {
      const result = await createMut.mutateAsync({
        buyerNama: buyerNama.trim(),
        buyerContact: buyerContact.trim() || null,
        catatan: catatan.trim() || null,
        dueDate: dueDate || null,
        items: items.map(({ key: _k, ...rest }) => rest),
      })
      onCreated?.(result.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan")
    }
  }

  const fieldLabel = "text-[10px] font-semibold uppercase tracking-wider mb-1.5"
  const fieldColor = { color: "rgba(165,180,252,0.6)" }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[720px] max-h-[90vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.97)", border: "1px solid rgba(99,102,241,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
             style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
          <div className="text-[15px] font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>Buat Invoice Baru</div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-base"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Buyer info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={fieldLabel} style={fieldColor}>Nama Buyer *</div>
              <input type="text" value={buyerNama} onChange={e => setBuyerNama(e.target.value)}
                placeholder="Nama pembeli..." className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" autoFocus />
            </div>
            <div>
              <div className={fieldLabel} style={fieldColor}>No. HP / WA (opsional)</div>
              <input type="text" value={buyerContact} onChange={e => setBuyerContact(e.target.value)}
                placeholder="08xx..." className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" />
            </div>
            <div>
              <div className={fieldLabel} style={fieldColor}>Due Date (opsional)</div>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" />
            </div>
            <div>
              <div className={fieldLabel} style={fieldColor}>Catatan (opsional)</div>
              <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)}
                placeholder="Catatan untuk buyer..." className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" />
            </div>
          </div>

          {/* Product picker */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
            <div className={fieldLabel} style={fieldColor}>Tambah Produk dari Katalog</div>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Cari produk..." className="glass-input w-full h-9 rounded-[8px] px-3 text-sm mb-2" />
            <div className="space-y-1">
              {searchResults.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-[8px]"
                     style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.8)" }}>{p.nama}</div>
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Offline: {p.offlineA ? fmt(p.offlineA) : "—"} · Marketplace: {p.shopeeA ? fmt(p.shopeeA) : "—"}
                    </div>
                  </div>
                  <button onClick={() => addFromKatalog(p, "offline")}
                    className="h-6 px-2 rounded-[5px] text-[9px] font-medium"
                    style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>
                    + Offline
                  </button>
                  <button onClick={() => addFromKatalog(p, "marketplace")}
                    className="h-6 px-2 rounded-[5px] text-[9px] font-medium"
                    style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}>
                    + Marketplace
                  </button>
                </div>
              ))}
              {searchResults.length === 0 && (
                <div className="text-[11px] text-center py-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Tidak ada produk ditemukan di katalog
                </div>
              )}
            </div>
            <button onClick={addBlank} className="mt-2 text-xs font-medium transition-colors"
                    style={{ color: "rgba(99,102,241,0.6)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.6)")}>
              + Tambah item manual
            </button>
          </div>

          {/* Line items */}
          {items.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
              <div className={fieldLabel} style={fieldColor}>Item Invoice ({items.length})</div>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.key} className="grid gap-2 items-center"
                       style={{ gridTemplateColumns: "1fr 80px 110px 28px" }}>
                    <input type="text" value={item.namaProduk}
                      onChange={e => updateItem(item.key, { namaProduk: e.target.value })}
                      placeholder="Nama produk"
                      className="glass-input h-9 rounded-[8px] px-3 text-xs" />
                    <input type="number" min="1" value={item.qty}
                      onChange={e => updateItem(item.key, { qty: parseInt(e.target.value) || 1 })}
                      className="glass-input h-9 rounded-[8px] px-3 text-xs" />
                    <input type="number" min="0" value={item.hargaPerUnit || ""}
                      onChange={e => updateItem(item.key, { hargaPerUnit: parseInt(e.target.value) || 0 })}
                      placeholder="Harga/unit"
                      className="glass-input h-9 rounded-[8px] px-3 text-xs" />
                    <button onClick={() => removeItem(item.key)}
                      className="h-9 w-7 rounded-[6px] flex items-center justify-center text-xs"
                      style={{ color: "#f87171", background: "rgba(239,68,68,0.08)" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-between items-center px-3 py-3 rounded-[10px]"
                 style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <span className="text-xs font-semibold" style={{ color: "rgba(165,180,252,0.7)" }}>TOTAL</span>
              <span className="text-base font-bold" style={{ color: "#a5b4fc" }}>{fmt(total)}</span>
            </div>
          )}

          {error && (
            <div className="text-xs px-3 py-2 rounded-[8px]"
                 style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 h-10 rounded-[10px] text-sm font-medium"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
              Batal
            </button>
            <button onClick={handleSave} disabled={createMut.isPending}
                    className="flex-1 h-10 rounded-[10px] text-sm font-semibold text-white"
                    style={{ background: createMut.isPending ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
              {createMut.isPending ? "Menyimpan..." : "Buat Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
