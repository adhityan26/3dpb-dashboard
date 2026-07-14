"use client"

import { useRef, useState, useEffect } from "react"
import { useKalkulasiList, useKomponenPresets } from "@/lib/hooks/use-kalkulator"
import type { PackingType } from "@/lib/kalkulator/types"
import type { KomponenRow } from "@/lib/kalkulator/form-v2"

interface Props {
  packingType?: PackingType
  onPackingChange: (t?: PackingType) => void
  rows: KomponenRow[]
  onRowsChange: (rows: KomponenRow[]) => void
  packingRates: Record<string, number>
}

const PACKING_SIZES: (PackingType | "none")[] = ["none", "S", "M", "L", "XL"]

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

function packingCostOf(
  k: { packingType?: string | null; komponenKustom?: { nama: string; harga: number }[] },
  packingRates: Record<string, number>,
): number {
  if (k.packingType) return packingRates[k.packingType] ?? 0
  return k.komponenKustom?.find(r => /^Packing (S|M|L|XL)$/.test(r.nama))?.harga ?? 0
}

export function KomponenSection({ packingType, onPackingChange, rows, onRowsChange, packingRates }: Props) {
  const kkIdRef = useRef(0)
  function nextId() { return `kk-${++kkIdRef.current}` }
  const { data: presets } = useKomponenPresets()

  // Kalkulasi picker
  const { data: kalkulasiResult } = useKalkulasiList()
  const kalkulasiList = Array.isArray(kalkulasiResult)
    ? kalkulasiResult
    : (kalkulasiResult as { items?: { id: string; nama: string; floorPrice: number; hppTotal: number; packingType?: string | null; komponenKustom?: { nama: string; harga: number }[] }[] } | null)?.items ?? []
  const [kalkPickerOpen, setKalkPickerOpen] = useState(false)
  const [kalkSearch, setKalkSearch] = useState("")
  const kalkPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!kalkPickerOpen) return
    function onClickOutside(e: MouseEvent) {
      if (kalkPickerRef.current && !kalkPickerRef.current.contains(e.target as Node)) {
        setKalkPickerOpen(false)
        setKalkSearch("")
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [kalkPickerOpen])

  const filteredKalk = kalkSearch.trim()
    ? kalkulasiList.filter(k => k.nama.toLowerCase().includes(kalkSearch.toLowerCase())).slice(0, 8)
    : kalkulasiList.slice(0, 8)

  function addFromKalkulasi(k: { id: string; nama: string; floorPrice: number; packingType?: string | null; komponenKustom?: { nama: string; harga: number }[] }) {
    // Use floorPrice (includes jual markup) minus packing — master handles its own packing
    const packingCost = packingCostOf(k, packingRates)
    const harga = Math.round(k.floorPrice - packingCost)
    onRowsChange([...rows, {
      id: nextId(),
      nama: k.nama,
      harga,
      qty: 1,
    }])
    setKalkPickerOpen(false)
    setKalkSearch("")
  }

  return (
    <div className="space-y-5">

      {/* Packing */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">Packing</div>
        <div className="flex gap-2 flex-wrap">
          {PACKING_SIZES.map(size => {
            const isSelected = size === "none" ? !packingType : packingType === size
            const price = size === "none" ? null : packingRates[size]
            return (
              <button
                key={size}
                onClick={() => onPackingChange(size === "none" ? undefined : size as PackingType)}
                className="flex flex-col items-center rounded-[10px] px-4 py-2.5 transition-all"
                style={isSelected
                  ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)" }
                  : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }
                }
              >
                <span className="text-base font-bold" style={{ color: isSelected ? "#c7d2fe" : "var(--g-t2)" }}>
                  {size === "none" ? "—" : size}
                </span>
                {price != null && (
                  <span className="text-[11px] mt-0.5" style={{ color: isSelected ? "rgba(165,180,252,0.7)" : "var(--g-t4)" }}>
                    {(price / 1000).toFixed(1)}k
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Komponen Elektronik / Custom */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">Komponen Elektronik / Custom</div>

        {/* Preset chips */}
        {(presets ?? []).filter(p => p.isActive).length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {(presets ?? []).filter(p => p.isActive).map(p => (
              <button key={p.id}
                onClick={() => onRowsChange([...rows, { id: nextId(), nama: p.nama, harga: p.harga, qty: 1 }])}
                className="rounded-[10px] px-3 py-2 text-xs transition-all"
                style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}>
                + {p.nama} <span className="g-t4">({(p.harga / 1000).toFixed(1)}k)</span>
              </button>
            ))}
          </div>
        )}

        {rows.map(kk => (
          <div key={kk.id} className="grid gap-2 mb-2 items-center"
               style={{ gridTemplateColumns: "1fr 90px 60px 32px" }}>
            <input
              type="text"
              placeholder="LED Strip, MCU..."
              value={kk.nama}
              onChange={e => onRowsChange(rows.map(r => r.id === kk.id ? { ...r, nama: e.target.value } : r))}
              className="glass-input w-full h-9 rounded-[6px] px-3 text-xs"
            />
            <input
              type="number"
              min="0"
              placeholder="Harga"
              value={kk.harga || ""}
              onChange={e => onRowsChange(rows.map(r => r.id === kk.id ? { ...r, harga: parseInt(e.target.value) || 0 } : r))}
              className="glass-input w-full h-9 rounded-[6px] px-3 text-xs"
            />
            <input
              type="number"
              min="1"
              placeholder="Qty"
              value={kk.qty}
              onChange={e => onRowsChange(rows.map(r => r.id === kk.id ? { ...r, qty: parseInt(e.target.value) || 1 } : r))}
              className="glass-input w-full h-9 rounded-[6px] px-3 text-xs"
            />
            <button
              onClick={() => onRowsChange(rows.filter(r => r.id !== kk.id))}
              className="h-9 w-8 rounded-[6px] flex items-center justify-center text-sm"
              style={{ color: "var(--g-t4)", background: "var(--g-inner)" }}
            >✕</button>
          </div>
        ))}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onRowsChange([...rows, { id: nextId(), nama: "", harga: 0, qty: 1 }])}
            className="text-sm font-medium transition-colors"
            style={{ color: "rgba(99,102,241,0.7)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
          >
            + Tambah manual
          </button>

          {/* Kalkulasi sub-component picker */}
          <div ref={kalkPickerRef} className="relative">
            <button
              onClick={() => setKalkPickerOpen(v => !v)}
              className="text-sm font-medium transition-colors flex items-center gap-1"
              style={{ color: "rgba(99,102,241,0.7)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
            >
              📊 Dari kalkulasi
            </button>

            {kalkPickerOpen && (
              <div className="absolute z-50 bottom-full mb-1 left-0 w-72 rounded-[10px] shadow-2xl overflow-hidden"
                   style={{
                     background: "rgba(10, 10, 30, 0.92)",
                     backdropFilter: "blur(20px) saturate(1.8)",
                     WebkitBackdropFilter: "blur(20px) saturate(1.8)",
                     border: "1px solid rgba(99,102,241,0.25)",
                     boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                   }}>
                <div className="p-2 border-b" style={{ borderColor: "rgba(99,102,241,0.2)" }}>
                  <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5 g-accent">
                    Pilih kalkulasi — Floor Price masuk, packing dikecualikan
                  </div>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Cari kalkulasi..."
                    value={kalkSearch}
                    onChange={e => setKalkSearch(e.target.value)}
                    className="glass-input w-full h-8 rounded-[6px] px-2 text-xs"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredKalk.length === 0 && (
                    <div className="text-[10px] text-center py-3 g-t5">Tidak ditemukan</div>
                  )}
                  {filteredKalk.map(k => {
                    const packingCost = packingCostOf(k, packingRates)
                    const hargaMasuk = Math.round(k.floorPrice - packingCost)
                    return (
                      <button
                        key={k.id}
                        onClick={() => addFromKalkulasi(k)}
                        className="w-full text-left px-3 py-2.5 text-xs transition-all flex justify-between items-center gap-2"
                        style={{ color: "var(--g-t1)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--g-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                      >
                        <div className="min-w-0">
                          <div className="truncate">{k.nama}</div>
                          <div className="text-[9px] g-t4">
                            Floor {fmt(k.floorPrice ?? 0)}
                            {packingCost > 0 && ` − packing ${fmt(packingCost)}`}
                          </div>
                        </div>
                        <span className="flex-shrink-0 font-semibold" style={{ color: "#a5b4fc" }}>
                          {fmt(hargaMasuk)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
