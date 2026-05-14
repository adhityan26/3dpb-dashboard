"use client"

import { useRef } from "react"
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

export function AksesoriSection({ value, onChange, rates }: Props) {
  const kkIdRef = useRef(0)
  function nextKkId() { return `kk-${++kkIdRef.current}` }

  function set(partial: Partial<AksesoriState>) {
    onChange({ ...value, ...partial })
  }

  const gantunganTypes = Object.keys(rates.gantungan)

  return (
    <div className="space-y-5">

      {/* Packing */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Packing</div>
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
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                <span className="text-base font-bold" style={{ color: isSelected ? "#c7d2fe" : "rgba(255,255,255,0.5)" }}>
                  {size === "none" ? "—" : size}
                </span>
                {price != null && (
                  <span className="text-[11px] mt-0.5" style={{ color: isSelected ? "rgba(165,180,252,0.7)" : "rgba(255,255,255,0.35)" }}>
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
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Gantungan</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => set({ gantunganType: undefined })}
            className="rounded-[10px] px-4 py-2.5 text-sm font-medium transition-all"
            style={!value.gantunganType
              ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#c7d2fe" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
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
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                <span className="text-sm font-medium capitalize"
                      style={{ color: isSelected ? "#c7d2fe" : "rgba(255,255,255,0.6)" }}>
                  {label}
                </span>
                <span className="text-[11px] mt-0.5"
                      style={{ color: isSelected ? "rgba(165,180,252,0.7)" : "rgba(255,255,255,0.35)" }}>
                  {(price / 1000).toFixed(1)}k
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Switch + Label */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Aksesori Lain</div>

        {/* Switch row */}
        <div className="flex items-center gap-3 py-3 px-4 rounded-[10px]"
             style={{ background: value.switchQty > 0 ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="checkbox"
            checked={value.switchQty > 0}
            onChange={e => set({ switchQty: e.target.checked ? 1 : 0 })}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="flex-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
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
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            {value.switchQty > 0
              ? `Rp ${(value.switchQty * rates.switchPerPcs).toLocaleString("id-ID")}`
              : `Rp ${rates.switchPerPcs.toLocaleString("id-ID")}/pcs`}
          </span>
        </div>

        {/* Label row */}
        <div className="flex items-center gap-3 py-3 px-4 rounded-[10px]"
             style={{ background: value.hasLabel ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="checkbox"
            checked={value.hasLabel}
            onChange={e => set({ hasLabel: e.target.checked })}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="flex-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Label / Sticker</span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            Rp {rates.labelPerLembar.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      {/* Komponen Kustom */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Komponen Elektronik / Custom</div>

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
              style={{ color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)" }}
            >✕</button>
          </div>
        ))}

        <button
          onClick={() => set({ komponenKustom: [...value.komponenKustom, { id: nextKkId(), nama: "", harga: 0, qty: 1 }] })}
          className="text-sm font-medium transition-colors"
          style={{ color: "rgba(99,102,241,0.7)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
        >
          + Tambah komponen
        </button>
      </div>

    </div>
  )
}
