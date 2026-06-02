"use client"

import { useRef, useState, useEffect } from "react"
import { useKalkulasiList } from "@/lib/hooks/use-kalkulator"
import type { PackingType, KalkulatorRates } from "@/lib/kalkulator/types"

export interface AksesoriState {
  packingType?: PackingType
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  komponenKustom: { id: string; nama: string; harga: number; qty: number }[]
}

interface Props {
  value: AksesoriState
  onChange: (v: AksesoriState) => void
  rates: Pick<KalkulatorRates, "packing" | "gantungan" | "switchPerPcs" | "labelPerLembar">
}

const PACKING_SIZES: (PackingType | "none")[] = ["none", "S", "M", "L", "XL"]

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

export function AksesoriSection({ value, onChange, rates }: Props) {
  const kkIdRef = useRef(0)
  function nextKkId() { return `kk-${++kkIdRef.current}` }

  function set(partial: Partial<AksesoriState>) {
    onChange({ ...value, ...partial })
  }

  const gantunganTypes = Object.keys(rates.gantungan)

  // Kalkulasi picker for sub-component
  const { data: kalkulasiResult } = useKalkulasiList()
  const kalkulasiList = Array.isArray(kalkulasiResult)
    ? kalkulasiResult
    : (kalkulasiResult as { items?: { id: string; nama: string; floorPrice: number; hppTotal: number; packingType?: string | null }[] } | null)?.items ?? []
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

  function addFromKalkulasi(k: { id: string; nama: string; floorPrice: number; packingType?: string | null }) {
    // Use floorPrice (includes jual markup) minus packing — master handles its own packing
    const packingCost = k.packingType ? (rates.packing[k.packingType] ?? 0) : 0
    const harga = Math.round(k.floorPrice - packingCost)
    set({ komponenKustom: [...value.komponenKustom, {
      id: nextKkId(),
      nama: k.nama,
      harga,
      qty: 1,
    }]})
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
            const isSelected = size === "none" ? !value.packingType : value.packingType === size
            const price = size === "none" ? null : rates.packing[size]
            return (
              <button
                key={size}
                onClick={() => set({ packingType: size === "none" ? undefined : size as PackingType })}
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

      {/* Gantungan */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">Gantungan</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => set({ gantunganType: undefined })}
            className="rounded-[10px] px-4 py-2.5 text-sm font-medium transition-all"
            style={!value.gantunganType
              ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#c7d2fe" }
              : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }
            }
          >
            —
          </button>
          {gantunganTypes.map(type => {
            const isSelected = value.gantunganType === type
            const price = rates.gantungan[type]
            const label = type.replace(/_/g, " ")
            return (
              <button
                key={type}
                onClick={() => set({ gantunganType: type })}
                className="flex flex-col items-center rounded-[10px] px-4 py-2.5 transition-all"
                style={isSelected
                  ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)" }
                  : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }
                }
              >
                <span className="text-sm font-medium capitalize"
                      style={{ color: isSelected ? "#c7d2fe" : "var(--g-t2)" }}>
                  {label}
                </span>
                <span className="text-[11px] mt-0.5"
                      style={{ color: isSelected ? "rgba(165,180,252,0.7)" : "var(--g-t4)" }}>
                  {(price / 1000).toFixed(1)}k
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Switch + Label */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">Aksesori Lain</div>

        {/* Switch row */}
        <div className="flex items-center gap-3 py-3 px-4 rounded-[10px]"
             style={{ background: value.switchQty > 0 ? "rgba(99,102,241,0.08)" : "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
          <input
            type="checkbox"
            checked={value.switchQty > 0}
            onChange={e => set({ switchQty: e.target.checked ? 1 : 0 })}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="flex-1 text-sm" style={{ color: "var(--g-t2)" }}>
            Switch (clicker)
          </span>
          {value.switchQty > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => set({ switchQty: Math.max(1, value.switchQty - 1) })}
                className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold"
                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
              >−</button>
              <span className="text-sm font-bold w-5 text-center" style={{ color: "#a5b4fc" }}>{value.switchQty}</span>
              <button
                onClick={() => set({ switchQty: value.switchQty + 1 })}
                className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold"
                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
              >+</button>
            </div>
          )}
          <span className="text-xs" style={{ color: "var(--g-t3)" }}>
            {value.switchQty > 0
              ? `Rp ${(value.switchQty * rates.switchPerPcs).toLocaleString("id-ID")}`
              : `Rp ${rates.switchPerPcs.toLocaleString("id-ID")}/pcs`}
          </span>
        </div>

        {/* Label row */}
        <div className="flex items-center gap-3 py-3 px-4 rounded-[10px]"
             style={{ background: value.hasLabel ? "rgba(99,102,241,0.08)" : "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
          <input
            type="checkbox"
            checked={value.hasLabel}
            onChange={e => set({ hasLabel: e.target.checked })}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="flex-1 text-sm" style={{ color: "var(--g-t2)" }}>Label / Sticker</span>
          <span className="text-xs" style={{ color: "var(--g-t3)" }}>
            Rp {rates.labelPerLembar.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      {/* Komponen Kustom */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">Komponen Elektronik / Custom</div>

        {value.komponenKustom.map(kk => (
          <div key={kk.id} className="grid gap-2 mb-2 items-center"
               style={{ gridTemplateColumns: "1fr 90px 60px 32px" }}>
            <input
              type="text"
              placeholder="LED Strip, MCU..."
              value={kk.nama}
              onChange={e => set({ komponenKustom: value.komponenKustom.map(k => k.id === kk.id ? { ...k, nama: e.target.value } : k) })}
              className="glass-input w-full h-9 rounded-[6px] px-3 text-xs"
            />
            <input
              type="number"
              min="0"
              placeholder="Harga"
              value={kk.harga || ""}
              onChange={e => set({ komponenKustom: value.komponenKustom.map(k => k.id === kk.id ? { ...k, harga: parseInt(e.target.value) || 0 } : k) })}
              className="glass-input w-full h-9 rounded-[6px] px-3 text-xs"
            />
            <input
              type="number"
              min="1"
              placeholder="Qty"
              value={kk.qty}
              onChange={e => set({ komponenKustom: value.komponenKustom.map(k => k.id === kk.id ? { ...k, qty: parseInt(e.target.value) || 1 } : k) })}
              className="glass-input w-full h-9 rounded-[6px] px-3 text-xs"
            />
            <button
              onClick={() => set({ komponenKustom: value.komponenKustom.filter(k => k.id !== kk.id) })}
              className="h-9 w-8 rounded-[6px] flex items-center justify-center text-sm"
              style={{ color: "var(--g-t4)", background: "var(--g-inner)" }}
            >✕</button>
          </div>
        ))}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => set({ komponenKustom: [...value.komponenKustom, { id: nextKkId(), nama: "", harga: 0, qty: 1 }] })}
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
                    const packingCost = k.packingType ? (rates.packing[k.packingType] ?? 0) : 0
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
