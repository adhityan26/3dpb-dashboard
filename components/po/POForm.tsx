"use client"

import { useState } from "react"
import { useCreatePO } from "@/lib/hooks/use-po"
import type { OCRPOResult, POItemInput } from "@/lib/po/types"

interface Props {
  ocrDraft?: OCRPOResult | null
  onClose: () => void
  onSaved: (id: string) => void
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

// Detect if item is filament/resin by keywords
function detectFilament(nama: string): { isFilament: boolean; brand?: string; material?: string; colorName?: string } {
  const n = nama.toLowerCase()
  const isFilament = n.includes('filament') || n.includes('resin') || n.includes('pla') || n.includes('petg') || n.includes('tpu') || n.includes('abs')
  if (!isFilament) return { isFilament: false }

  let brand: string | undefined
  if (n.includes('bambu') || n.includes('bambulab')) brand = 'BambuLab'
  else if (n.includes('esun') || n.includes('e-sun')) brand = 'eSUN'
  else if (n.includes('sunlu')) brand = 'Sunlu'
  else if (n.includes('polymaker')) brand = 'Polymaker'

  let material: string | undefined
  if (n.includes('pla+') || n.includes('pla plus')) material = 'PLA+'
  else if (n.includes('pla')) material = 'PLA'
  else if (n.includes('petg')) material = 'PETG'
  else if (n.includes('tpu')) material = 'TPU'
  else if (n.includes('abs')) material = 'ABS'
  else if (n.includes('resin')) material = 'Resin'

  // Extract color from the end of the name
  const colorKeywords = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'gray', 'grey', 'orange', 'purple', 'brown', 'pink', 'beige', 'clear', 'natural', 'solid black', 'solid white', 'fire engine', 'pine green', 'light brown', 'very peri', 'bambu green']
  let colorName: string | undefined
  for (const c of colorKeywords) {
    if (n.includes(c)) { colorName = c.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); break }
  }

  return { isFilament: true, brand, material, colorName }
}

type ItemWithKey = POItemInput & { key: string }

export function POForm({ ocrDraft, onClose, onSaved }: Props) {
  const createMut = useCreatePO()

  const [vendorNama, setVendorNama] = useState(ocrDraft?.vendorNama ?? "")
  const [nomor, setNomor] = useState(ocrDraft?.nomor ?? "")
  const [tanggal, setTanggal] = useState(
    ocrDraft?.tanggal ?? new Date().toISOString().slice(0, 10)
  )
  const [catatan, setCatatan] = useState("")
  const [items, setItems] = useState<ItemWithKey[]>(() => {
    if (ocrDraft?.items?.length) {
      return ocrDraft.items.map((item, i) => {
        const detected = detectFilament(item.namaProduct)
        return {
          key: `ocr-${i}`,
          namaProduct: item.namaProduct,
          kode: item.kode ?? null,
          qty: item.qty,
          uom: item.uom ?? 'EA',
          harga: item.harga,
          diskon: item.diskon ?? 0,
          total: item.total,
          isFilament: item.isFilament ?? detected.isFilament,
          brand: item.brand ?? detected.brand ?? null,
          material: item.material ?? detected.material ?? null,
          colorName: item.colorName ?? detected.colorName ?? null,
          filamentCatalogId: null,
        }
      })
    }
    return []
  })
  const [error, setError] = useState<string | null>(null)

  let keyCounter = items.length
  function nextKey() { return `item-${++keyCounter}` }

  function addItem() {
    setItems(prev => [...prev, {
      key: nextKey(), namaProduct: "", kode: null, qty: 1, uom: "EA",
      harga: 0, diskon: 0, total: 0, isFilament: false,
      brand: null, material: null, colorName: null, filamentCatalogId: null,
    }])
  }

  function updateItem(key: string, field: string, value: unknown) {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item
      const updated = { ...item, [field]: value }
      // Auto-detect filament on name change
      if (field === 'namaProduct' && typeof value === 'string') {
        const detected = detectFilament(value)
        if (detected.isFilament && !item.isFilament) {
          Object.assign(updated, { isFilament: true, brand: detected.brand ?? null, material: detected.material ?? null, colorName: detected.colorName ?? null })
        }
      }
      // Recalc total on qty/harga/diskon change
      if (['qty', 'harga', 'diskon'].includes(field)) {
        const q = field === 'qty' ? Number(value) : updated.qty
        const h = field === 'harga' ? Number(value) : updated.harga
        const d = field === 'diskon' ? Number(value) : (updated.diskon ?? 0)
        updated.total = q * h * (1 - d / 100)
      }
      return updated
    }))
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  const grandTotal = items.reduce((s, i) => s + (i.total || 0), 0)

  async function handleSave() {
    if (!vendorNama.trim()) { setError("Nama vendor wajib diisi"); return }
    if (!items.length) { setError("Tambahkan minimal 1 item"); return }
    setError(null)
    try {
      const result = await createMut.mutateAsync({
        vendorNama: vendorNama.trim(),
        nomor: nomor.trim() || null,
        tanggal: tanggal || undefined,
        catatan: catatan.trim() || null,
        items: items.map(({ key: _k, ...rest }) => rest),
      })
      onSaved(result.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan")
    }
  }

  const fl = "text-[10px] font-semibold uppercase tracking-wider mb-1"
  const fc = { color: "rgba(165,180,252,0.6)" }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="h-8 px-3 rounded-[8px] text-xs font-medium"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
          ← Kembali
        </button>
        <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
          {ocrDraft ? "📷 Review Hasil Scan" : "Buat Purchase Order"}
        </div>
      </div>

      {/* PO Header */}
      <div className="grid grid-cols-2 gap-4 p-4 rounded-[12px]"
           style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="col-span-2 md:col-span-1">
          <div className={fl} style={fc}>Vendor / Supplier *</div>
          <input type="text" value={vendorNama} onChange={e => setVendorNama(e.target.value)}
            placeholder="Indo Cart, Tokopedia..." className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" autoFocus />
        </div>
        <div>
          <div className={fl} style={fc}>Nomor Invoice</div>
          <input type="text" value={nomor} onChange={e => setNomor(e.target.value)}
            placeholder="RGB.2603897" className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" />
        </div>
        <div>
          <div className={fl} style={fc}>Tanggal</div>
          <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
            className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" />
        </div>
        <div className="col-span-2">
          <div className={fl} style={fc}>Catatan (opsional)</div>
          <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)}
            placeholder="..." className="glass-input w-full h-9 rounded-[10px] px-3 text-sm" />
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider flex-1" style={{ color: "rgba(165,180,252,0.6)" }}>
            Item ({items.length})
          </div>
          <button onClick={addItem} className="text-xs font-medium transition-colors"
                  style={{ color: "rgba(99,102,241,0.7)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}>
            + Tambah Item
          </button>
        </div>

        {items.map(item => (
          <div key={item.key} className="rounded-[10px] p-3 space-y-2"
               style={{ background: item.isFilament ? "rgba(99,102,241,0.05)" : "rgba(255,255,255,0.03)", border: `1px solid ${item.isFilament ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.07)"}` }}>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <input type="text" value={item.namaProduct}
                  onChange={e => updateItem(item.key, 'namaProduct', e.target.value)}
                  placeholder="Nama produk..."
                  className="glass-input w-full h-8 rounded-[8px] px-3 text-xs" />
              </div>
              <input type="text" value={item.kode ?? ""}
                onChange={e => updateItem(item.key, 'kode', e.target.value || null)}
                placeholder="Kode" style={{ width: 100 }}
                className="glass-input h-8 rounded-[8px] px-2 text-xs" />
              <button onClick={() => removeItem(item.key)}
                className="h-8 w-7 rounded-[6px] flex items-center justify-center text-xs flex-shrink-0"
                style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>✕</button>
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: "60px 80px 80px 60px 100px" }}>
              <div>
                <div className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Qty</div>
                <input type="number" min="0.1" step="0.1" value={item.qty}
                  onChange={e => updateItem(item.key, 'qty', parseFloat(e.target.value) || 0)}
                  className="glass-input w-full h-8 rounded-[6px] px-2 text-xs" />
              </div>
              <div>
                <div className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Harga/unit</div>
                <input type="number" min="0" value={item.harga}
                  onChange={e => updateItem(item.key, 'harga', parseFloat(e.target.value) || 0)}
                  className="glass-input w-full h-8 rounded-[6px] px-2 text-xs" />
              </div>
              <div>
                <div className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Diskon%</div>
                <input type="number" min="0" max="100" value={item.diskon}
                  onChange={e => updateItem(item.key, 'diskon', parseFloat(e.target.value) || 0)}
                  className="glass-input w-full h-8 rounded-[6px] px-2 text-xs" />
              </div>
              <div>
                <div className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>UOM</div>
                <input type="text" value={item.uom}
                  onChange={e => updateItem(item.key, 'uom', e.target.value)}
                  className="glass-input w-full h-8 rounded-[6px] px-2 text-xs" />
              </div>
              <div>
                <div className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Total</div>
                <div className="h-8 flex items-center text-xs font-bold" style={{ color: "#a5b4fc" }}>
                  {fmt(item.total)}
                </div>
              </div>
            </div>

            {/* Filament toggle + fields */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={item.isFilament ?? false}
                  onChange={e => updateItem(item.key, 'isFilament', e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-500" />
                <span className="text-[10px]" style={{ color: item.isFilament ? "#a5b4fc" : "rgba(255,255,255,0.4)" }}>
                  🧵 Filament
                </span>
              </label>
              {item.isFilament && (
                <>
                  <input type="text" value={item.brand ?? ""} placeholder="Brand"
                    onChange={e => updateItem(item.key, 'brand', e.target.value || null)}
                    style={{ width: 80 }} className="glass-input h-7 rounded-[6px] px-2 text-[10px]" />
                  <input type="text" value={item.material ?? ""} placeholder="Material"
                    onChange={e => updateItem(item.key, 'material', e.target.value || null)}
                    style={{ width: 70 }} className="glass-input h-7 rounded-[6px] px-2 text-[10px]" />
                  <input type="text" value={item.colorName ?? ""} placeholder="Warna"
                    onChange={e => updateItem(item.key, 'colorName', e.target.value || null)}
                    style={{ width: 80 }} className="glass-input h-7 rounded-[6px] px-2 text-[10px]" />
                  <span className="text-[9px]" style={{ color: "rgba(52,211,153,0.6)" }}>
                    → {Math.floor(item.qty)} roll baru
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      {items.length > 0 && (
        <div className="flex justify-between items-center px-4 py-3 rounded-[10px]"
             style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <span className="text-xs font-semibold" style={{ color: "rgba(165,180,252,0.7)" }}>GRAND TOTAL</span>
          <span className="text-base font-bold" style={{ color: "#a5b4fc" }}>{fmt(grandTotal)}</span>
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
          {createMut.isPending ? "Menyimpan..." : "Simpan PO"}
        </button>
      </div>
    </div>
  )
}
