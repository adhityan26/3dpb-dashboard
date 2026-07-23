"use client"

import { useState, useMemo } from "react"
import { useCreateInvoice } from "@/lib/hooks/use-invoice"
import { useKatalogList } from "@/lib/hooks/use-katalog"
import type { QuotationItemInput, ChannelHarga, OrderPrefill } from "@/lib/invoice/types"
import type { ProdukInternalData } from "@/lib/katalog/types"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

function parseDiskonInput(input: string, mode: 'Rp' | '%', baseAmount: number): { diskon: number; diskonPct: number | null } {
  const val = parseFloat(input) || 0
  if (mode === '%') {
    const pct = Math.min(100, Math.max(0, val))
    return { diskon: Math.round(baseAmount * pct / 100), diskonPct: pct }
  }
  return { diskon: Math.round(Math.max(0, val)), diskonPct: null }
}

interface LineItem extends QuotationItemInput {
  key: string
  diskon: number
  diskonPct: number | null
  diskonMode: 'Rp' | '%'
}

let _keyCounter = 0
function nextKey() { return `item-${++_keyCounter}` }

interface Props {
  onClose: () => void
  onCreated?: (id?: string) => void
  orderPrefill?: OrderPrefill
}

export function InvoiceForm({ onClose, onCreated, orderPrefill }: Props) {
  const createMut = useCreateInvoice()
  const { data: katalogItems } = useKatalogList()
  const katalog: ProdukInternalData[] = katalogItems ?? []

  const [buyerNama, setBuyerNama] = useState(orderPrefill?.buyerUsername ?? "")
  const [buyerContact, setBuyerContact] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [catatan, setCatatan] = useState("")
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<LineItem[]>(() =>
    orderPrefill
      ? orderPrefill.items.map(i => ({
          key: nextKey(),
          produkInternalId: null,
          namaProduk: i.namaProduk,
          qty: i.qty,
          hargaPerUnit: i.hargaPerUnit,
          channelHarga: "marketplace" as ChannelHarga,
          catatan: null,
          diskon: 0,
          diskonPct: null,
          diskonMode: 'Rp' as const,
        }))
      : []
  )
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  const [diskonGlobal, setDiskonGlobal] = useState(0)
  const [diskonGlobalPct, setDiskonGlobalPct] = useState<number | null>(null)
  const [diskonGlobalMode, setDiskonGlobalMode] = useState<'Rp' | '%'>('Rp')
  const [diskonGlobalInput, setDiskonGlobalInput] = useState("")

  const searchResults = search.trim()
    ? katalog.filter(p => p.nama.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : katalog.slice(0, 6)

  function addFromKatalog(p: ProdukInternalData, channel: ChannelHarga) {
    const tier = p.marginTier ?? "A"
    const offlineTier = tier === "B" ? p.offlineB : tier === "C" ? p.offlineC : p.offlineA
    const shopeeTier  = tier === "B" ? p.shopeeB  : tier === "C" ? p.shopeeC  : p.shopeeA
    const harga = channel === "offline"
      ? (p.hargaOfflineAktual ?? offlineTier ?? 0)
      : (p.hargaShopeeAktual ?? shopeeTier ?? 0)
    setItems(prev => [...prev, {
      key: nextKey(),
      produkInternalId: p.id,
      namaProduk: p.nama,
      qty: 1,
      hargaPerUnit: harga,
      channelHarga: channel,
      catatan: null,
      diskon: 0,
      diskonPct: null,
      diskonMode: 'Rp' as const,
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
      diskon: 0,
      diskonPct: null,
      diskonMode: 'Rp' as const,
    }])
  }

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i))
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  const subtotalProduk = useMemo(
    () => items.reduce((s, i) => s + i.qty * i.hargaPerUnit - i.diskon, 0),
    [items]
  )
  const totalDiskonItem = useMemo(
    () => items.reduce((s, i) => s + i.diskon, 0),
    [items]
  )
  const total = useMemo(
    () => subtotalProduk - diskonGlobal,
    [subtotalProduk, diskonGlobal]
  )

  async function handleSave() {
    if (!buyerNama.trim()) { setError("Nama buyer wajib diisi"); return }
    if (!items.length) { setError("Tambahkan minimal 1 produk"); return }
    const invalidItem = items.find(i => !i.namaProduk.trim() || i.qty < 1 || i.hargaPerUnit <= 0)
    if (invalidItem) { setError("Semua item harus punya nama, qty, dan harga"); return }
    setError(null)
    try {
      const result = await createMut.mutateAsync({
        tanggal: tanggal || null,
        buyerNama: buyerNama.trim(),
        buyerContact: buyerContact.trim() || null,
        catatan: catatan.trim() || null,
        dueDate: dueDate || null,
        shopeeOrderSn: orderPrefill?.shopeeOrderSn ?? null,
        diskonGlobal,
        diskonGlobalPct,
        items: items.map(({ key: _k, diskonMode: _dm, ...rest }) => rest),
      })
      onCreated?.(result.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan")
    }
  }

  const fieldLabel = "text-[10px] font-semibold uppercase tracking-wider mb-1.5"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[720px] max-h-[90vh] flex flex-col rounded-[5px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.97)", border: "1px solid rgba(99,102,241,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
             style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
          <div className="text-[15px] font-bold g-t1">Buat Invoice Baru</div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-base"
                  style={{ color: "var(--g-t4)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--g-t1)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--g-t4)")}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Shopee order banner */}
          {orderPrefill && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[5px] text-xs font-medium"
                 style={{ background: "rgba(238,77,45,0.1)", border: "1px solid rgba(238,77,45,0.25)", color: "#f87171" }}>
              <span>🛍️</span>
              <span>Dari Shopee Order <span className="font-mono font-bold">#{orderPrefill.shopeeOrderSn}</span></span>
            </div>
          )}
          {/* Buyer info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={`${fieldLabel} g-accent`}>Nama Buyer *</div>
              <input type="text" value={buyerNama} onChange={e => setBuyerNama(e.target.value)}
                placeholder="Nama pembeli..." className="glass-input w-full h-10 rounded-[5px] px-3 text-sm" autoFocus />
            </div>
            <div>
              <div className={`${fieldLabel} g-accent`}>No. HP / WA (opsional)</div>
              <input type="text" value={buyerContact} onChange={e => setBuyerContact(e.target.value)}
                placeholder="08xx..." className="glass-input w-full h-10 rounded-[5px] px-3 text-sm" />
            </div>
            <div>
              <div className={`${fieldLabel} g-accent`}>Tanggal Invoice</div>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
                className="glass-input w-full h-10 rounded-[5px] px-3 text-sm" />
            </div>
            <div>
              <div className={`${fieldLabel} g-accent`}>Due Date (opsional)</div>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="glass-input w-full h-10 rounded-[5px] px-3 text-sm" />
            </div>
            <div>
              <div className={`${fieldLabel} g-accent`}>Catatan (opsional)</div>
              <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)}
                placeholder="Catatan untuk buyer..." className="glass-input w-full h-10 rounded-[5px] px-3 text-sm" />
            </div>
          </div>

          {/* Product picker */}
          <div style={{ borderTop: "1px solid var(--g-inner-border)", paddingTop: 20 }}>
            <div className={`${fieldLabel} g-accent mb-2`}>Tambah Produk dari Katalog</div>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Cari produk..." className="glass-input w-full h-9 rounded-[5px] px-3 text-sm mb-2" />
            <div className="space-y-1">
              {searchResults.map(p => (
                <div key={p.id} className="g-inner flex items-center gap-3 px-3 py-2 rounded-[5px]">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate g-t1">{p.nama}</div>
                    <div className="text-[10px] g-t4">
                      {(() => {
                        const tier = p.marginTier ?? "A"
                        const offlineTier = tier === "B" ? p.offlineB : tier === "C" ? p.offlineC : p.offlineA
                        const shopeeTier  = tier === "B" ? p.shopeeB  : tier === "C" ? p.shopeeC  : p.shopeeA
                        const offlinePrice = p.hargaOfflineAktual ?? offlineTier
                        const shopeePrice  = p.hargaShopeeAktual  ?? shopeeTier
                        return (
                          <>
                            Offline {tier}: {offlinePrice ? fmt(offlinePrice) : "—"}
                            {p.hargaOfflineAktual ? <span className="g-t5"> (aktual)</span> : null}
                            {" · "}
                            Shopee {tier}: {shopeePrice ? fmt(shopeePrice) : "—"}
                            {p.hargaShopeeAktual ? <span className="g-t5"> (aktual)</span> : null}
                          </>
                        )
                      })()}
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
                <div className="text-[11px] text-center py-2 g-t5">
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
            <div style={{ borderTop: "1px solid var(--g-inner-border)", paddingTop: 16 }}>
              <div className={`${fieldLabel} g-accent`}>Item Invoice ({items.length})</div>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.key} className="space-y-1">
                    <div className="grid gap-2 items-center"
                         style={{ gridTemplateColumns: "1fr 70px 110px 28px" }}>
                      <input type="text" value={item.namaProduk}
                        onChange={e => updateItem(item.key, { namaProduk: e.target.value })}
                        placeholder="Nama produk"
                        className="glass-input h-9 rounded-[5px] px-3 text-xs" />
                      <input type="number" min="1" value={item.qty}
                        onChange={e => updateItem(item.key, { qty: parseInt(e.target.value) || 1 })}
                        className="glass-input h-9 rounded-[5px] px-3 text-xs" />
                      <input type="number" min="0" value={item.hargaPerUnit || ""}
                        onChange={e => updateItem(item.key, { hargaPerUnit: parseInt(e.target.value) || 0 })}
                        placeholder="Harga/unit"
                        className="glass-input h-9 rounded-[5px] px-3 text-xs" />
                      <button onClick={() => removeItem(item.key)}
                        className="h-9 w-7 rounded-[5px] flex items-center justify-center text-xs"
                        style={{ color: "#f87171", background: "rgba(239,68,68,0.08)" }}>✕</button>
                    </div>
                    {/* Diskon per item */}
                    <div className="flex items-center gap-2 pl-1">
                      <span className="text-[10px] g-t5">Diskon:</span>
                      <div className="flex rounded-[5px] overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
                        {(['Rp', '%'] as const).map(m => (
                          <button key={m} onClick={() => {
                            const base = item.qty * item.hargaPerUnit
                            if (m === '%' && item.diskon > 0 && base > 0) {
                              const pct = Math.round(item.diskon / base * 1000) / 10
                              updateItem(item.key, { diskonMode: m, diskonPct: pct })
                            } else {
                              updateItem(item.key, { diskonMode: m })
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
                          updateItem(item.key, { diskon, diskonPct })
                        }}
                        placeholder="0"
                        className="glass-input h-7 w-20 rounded-[5px] px-2 text-xs" />
                      {item.diskon > 0 && (
                        <span className="text-[10px] g-t4">= -{fmt(item.diskon)}</span>
                      )}
                      <span className="text-[10px] g-t3 ml-auto">{fmt(item.qty * item.hargaPerUnit - item.diskon)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          {items.length > 0 && (
            <div className="rounded-[5px] overflow-hidden"
                 style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <div className="px-4 py-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs g-t3">Subtotal produk</span>
                  <span className="text-xs g-t2">{fmt(subtotalProduk + totalDiskonItem)}</span>
                </div>
                {totalDiskonItem > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs g-t4">- Diskon item</span>
                    <span className="text-xs" style={{ color: "#f87171" }}>-{fmt(totalDiskonItem)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-xs g-t3 shrink-0">- Diskon global</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <div className="flex rounded-[5px] overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
                      {(['Rp', '%'] as const).map(m => (
                        <button key={m} onClick={() => {
                          setDiskonGlobalMode(m)
                          setDiskonGlobalInput("")
                          setDiskonGlobal(0)
                          setDiskonGlobalPct(null)
                        }}
                          className="px-2 py-0.5 text-[9px] font-medium transition-colors"
                          style={diskonGlobalMode === m
                            ? { background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }
                            : { background: "transparent", color: "var(--g-t4)" }}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" min="0"
                      value={diskonGlobalInput}
                      onChange={e => {
                        setDiskonGlobalInput(e.target.value)
                        const { diskon, diskonPct } = parseDiskonInput(e.target.value, diskonGlobalMode, subtotalProduk)
                        setDiskonGlobal(diskon)
                        setDiskonGlobalPct(diskonPct)
                      }}
                      placeholder="0"
                      className="glass-input h-7 w-24 rounded-[5px] px-2 text-xs" />
                    {diskonGlobal > 0 && diskonGlobalMode === '%' && (
                      <span className="text-[10px] g-t4">= -{fmt(diskonGlobal)}</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2"
                     style={{ borderTop: "1px solid rgba(99,102,241,0.15)" }}>
                  <span className="text-xs font-semibold" style={{ color: "rgba(165,180,252,0.7)" }}>TOTAL</span>
                  <span className="text-base font-bold" style={{ color: "#a5b4fc" }}>{fmt(total)}</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs px-3 py-2 rounded-[5px]"
                 style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="g-btn-ghost flex-1 h-10 rounded-[5px] text-sm font-medium">
              Batal
            </button>
            <button onClick={handleSave} disabled={createMut.isPending}
                    className="flex-1 h-10 rounded-[5px] text-sm font-semibold text-white"
                    style={{ background: createMut.isPending ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
              {createMut.isPending ? "Menyimpan..." : "Buat Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
