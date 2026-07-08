# Kalkulator Harga — Plan 2: Core UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Kalkulator UI — calculator form with plate table + accessories, real-time results panel, history list, link-to-product modal, Filamen Harga per Tipe section, and Settings additions.

**Architecture:** All components are client-side (`"use client"`). Real-time formula preview uses `hitungKalkulasi()` imported directly (no API call) so results update on every keystroke. Save/Load/Delete use the React Query hooks from Plan 1. Split layout on desktop (form left, results right), stacked on mobile. History below the split.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, TypeScript, @tanstack/react-query, Glass UI (existing CSS classes)

**Requires Plan 1** to be deployed (hooks + API available).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `components/kalkulator/PlateTable.tsx` | Multi-plate input (gramasi, durasi, tipe) |
| Create | `components/kalkulator/AksesoriSection.tsx` | Packing/gantungan/switch/label/custom komponen |
| Create | `components/kalkulator/HasilPanel.tsx` | Results display (HPP, floor, offline/shopee prices) |
| Create | `components/kalkulator/KalkulasiForm.tsx` | Form container: wires PlateTable + Aksesori + nama/batch/margin |
| Create | `components/kalkulator/KalkulasiHistory.tsx` | Saved calculations list |
| Create | `components/kalkulator/LinkProdukModal.tsx` | Link/create product from calculation |
| Create | `components/kalkulator/KalkulasiTab.tsx` | Main tab: split layout + history |
| Modify | `app/(dashboard)/produk/page.tsx` | Add "🧮 Kalkulator" third sub-tab |
| Create | `components/kalkulator/FilamentHargaTable.tsx` | FDM + SLA price per brand/grade |
| Modify | `components/filamen/FilamenTab.tsx` | Add "Harga Tipe" sub-tab |
| Modify | `app/(dashboard)/settings/page.tsx` | Add KalkulatorSettings card |
| Create | `components/kalkulator/KalkulatorSettings.tsx` | Edit rates + gantungan types |

---

### Task 1: PlateTable Component

**Files:**
- Create: `components/kalkulator/PlateTable.tsx`

The plate table is the core input — user adds one row per "part" of the product (e.g., Body, Face, Eye Insert). Each row: optional name, FDM/SLA type, total gramasi (from slicer), total durasi. Duration accepts "1:30" (= 1.5h) or "1.5".

- [ ] **Step 1: Create `components/kalkulator/PlateTable.tsx`**

```tsx
"use client"

import { useState, useCallback } from "react"
import type { PlateInput, PrintTipe } from "@/lib/kalkulator/types"

interface PlateRow extends PlateInput {
  key: string
}

interface PlateTableProps {
  plates: PlateRow[]
  onChange: (plates: PlateRow[]) => void
}

function parseDurasi(raw: string): number {
  const trimmed = raw.trim()
  // HH:MM format → decimal hours
  if (trimmed.includes(":")) {
    const [h, m] = trimmed.split(":").map(Number)
    return (h || 0) + (m || 0) / 60
  }
  return parseFloat(trimmed) || 0
}

function formatDurasiDisplay(jam: number): string {
  if (!jam) return ""
  const h = Math.floor(jam)
  const m = Math.round((jam - h) * 60)
  return m === 0 ? `${h}j` : `${h}j ${m}m`
}

const TIPE_LABELS: Record<PrintTipe, string> = { FDM: "FDM", SLA: "SLA" }

let keyCounter = 0
function nextKey() { return `plate-${++keyCounter}` }

export function PlateTable({ plates, onChange }: PlateTableProps) {
  const [durasiRaw, setDurasiRaw] = useState<Record<string, string>>({})

  function addPlate() {
    const key = nextKey()
    onChange([...plates, { key, tipe: "FDM", gramasi: 0, durasiJam: 0 }])
    setDurasiRaw(prev => ({ ...prev, [key]: "" }))
  }

  function removePlate(key: string) {
    if (plates.length <= 1) return
    onChange(plates.filter(p => p.key !== key))
    setDurasiRaw(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function updatePlate(key: string, field: keyof PlateInput, value: any) {
    onChange(plates.map(p => p.key === key ? { ...p, [field]: value } : p))
  }

  function handleDurasiChange(key: string, raw: string) {
    setDurasiRaw(prev => ({ ...prev, [key]: raw }))
    const parsed = parseDurasi(raw)
    updatePlate(key, "durasiJam", parsed)
  }

  const totalGramasi = plates.reduce((s, p) => s + (p.gramasi || 0), 0)
  const totalDurasi = plates.reduce((s, p) => s + (p.durasiJam || 0), 0)
  const multiPlate = plates.length > 1

  return (
    <div>
      {/* Header */}
      <div className={`grid gap-2 mb-2 text-[9px] font-semibold uppercase tracking-wider`}
           style={{ gridTemplateColumns: multiPlate ? "1fr 60px 70px 80px 28px" : "70px 80px", color: "rgba(165,180,252,0.6)" }}>
        {multiPlate && <span>Nama Part</span>}
        <span>Tipe</span>
        <span>Gramasi (g)</span>
        <span>Durasi</span>
        {multiPlate && <span></span>}
      </div>

      {/* Rows */}
      {plates.map((plate) => (
        <div key={plate.key}
          className={`grid gap-2 mb-2 items-center`}
          style={{ gridTemplateColumns: multiPlate ? "1fr 60px 70px 80px 28px" : "60px 70px 80px" }}>

          {multiPlate && (
            <input
              type="text"
              placeholder="Body, Face... (opsional)"
              value={plate.namaPart ?? ""}
              onChange={e => updatePlate(plate.key, "namaPart", e.target.value || undefined)}
              className="glass-input w-full h-8 rounded-[8px] px-2 text-[11px]"
            />
          )}

          {/* Tipe: FDM / SLA */}
          <div className="flex gap-1">
            {(["FDM", "SLA"] as PrintTipe[]).map(t => (
              <button
                key={t}
                onClick={() => updatePlate(plate.key, "tipe", t)}
                className="flex-1 h-8 rounded-[6px] text-[9px] font-bold transition-all"
                style={plate.tipe === t
                  ? { background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                }
              >
                {t}
              </button>
            ))}
          </div>

          {/* Gramasi */}
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="21"
            value={plate.gramasi || ""}
            onChange={e => updatePlate(plate.key, "gramasi", parseFloat(e.target.value) || 0)}
            className="glass-input w-full h-8 rounded-[8px] px-2 text-[11px]"
          />

          {/* Durasi */}
          <div className="relative">
            <input
              type="text"
              placeholder="1:30 or 1.5"
              value={durasiRaw[plate.key] ?? (plate.durasiJam ? String(plate.durasiJam) : "")}
              onChange={e => handleDurasiChange(plate.key, e.target.value)}
              className="glass-input w-full h-8 rounded-[8px] px-2 text-[11px]"
            />
            {plate.durasiJam > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px]"
                    style={{ color: "rgba(99,102,241,0.7)" }}>
                {formatDurasiDisplay(plate.durasiJam)}
              </span>
            )}
          </div>

          {/* Remove */}
          {multiPlate && (
            <button
              onClick={() => removePlate(plate.key)}
              className="h-8 w-7 rounded-[6px] flex items-center justify-center text-[12px] transition-all"
              style={{ color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.7)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {/* Total row (only when multi-plate) */}
      {multiPlate && (
        <div className="flex items-center gap-2 mt-1 pt-2"
             style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-[9px] font-semibold" style={{ color: "rgba(165,180,252,0.5)" }}>TOTAL</span>
          <span className="flex-1 text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>{plates.length} parts</span>
          <span className="text-[11px] font-bold" style={{ color: "#a5b4fc", width: 70, textAlign: "right" }}>
            {totalGramasi.toFixed(1)}g
          </span>
          <span className="text-[11px] font-bold" style={{ color: "#a5b4fc", width: 80, textAlign: "right" }}>
            {formatDurasiDisplay(totalDurasi)}
          </span>
          <div style={{ width: 28 }} />
        </div>
      )}

      {/* Add plate button */}
      <button
        onClick={addPlate}
        className="mt-2 text-[11px] font-medium transition-colors"
        style={{ color: "rgba(99,102,241,0.7)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
      >
        + Tambah Part
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/kalkulator/PlateTable.tsx
git commit -m "feat(kalkulator-ui): PlateTable component with HH:MM duration parse"
```

---

### Task 2: AksesoriSection Component

**Files:**
- Create: `components/kalkulator/AksesoriSection.tsx`

- [ ] **Step 1: Create `components/kalkulator/AksesoriSection.tsx`**

```tsx
"use client"

import type { PackingType } from "@/lib/kalkulator/types"
import type { KalkulatorRates } from "@/lib/kalkulator/types"

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

let kkId = 0
function nextKkId() { return `kk-${++kkId}` }

const PACKING_SIZES: (PackingType | "none")[] = ["none", "S", "M", "L", "XL"]

export function AksesoriSection({ value, onChange, rates }: Props) {
  function set(partial: Partial<AksesoriState>) {
    onChange({ ...value, ...partial })
  }

  const gantunganTypes = Object.keys(rates.gantungan)

  return (
    <div className="space-y-5">

      {/* Packing */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Packing</div>
        <div className="flex gap-2 flex-wrap">
          {PACKING_SIZES.map(size => {
            const isSelected = size === "none" ? !value.packingType : value.packingType === size
            const price = size === "none" ? null : rates.packing[size]
            return (
              <button
                key={size}
                onClick={() => set({ packingType: size === "none" ? undefined : size as PackingType })}
                className="flex flex-col items-center rounded-[8px] px-3 py-2 transition-all"
                style={isSelected
                  ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                <span className="text-[13px] font-800" style={{ color: isSelected ? "#c7d2fe" : "rgba(255,255,255,0.5)" }}>
                  {size === "none" ? "—" : size}
                </span>
                {price != null && (
                  <span className="text-[8px] mt-0.5" style={{ color: isSelected ? "rgba(165,180,252,0.6)" : "rgba(255,255,255,0.25)" }}>
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
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Gantungan</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => set({ gantunganType: undefined })}
            className="rounded-[8px] px-3 py-2 text-[10px] transition-all"
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
                className="flex flex-col items-center rounded-[8px] px-3 py-2 transition-all"
                style={isSelected
                  ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                <span className="text-[10px] font-medium capitalize"
                      style={{ color: isSelected ? "#c7d2fe" : "rgba(255,255,255,0.5)" }}>
                  {label}
                </span>
                <span className="text-[8px]"
                      style={{ color: isSelected ? "rgba(165,180,252,0.6)" : "rgba(255,255,255,0.25)" }}>
                  {(price / 1000).toFixed(1)}k
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Switch + Label */}
      <div className="space-y-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Aksesori Lain</div>

        {/* Switch row */}
        <div className="flex items-center gap-3 py-2 px-3 rounded-[8px]"
             style={{ background: value.switchQty > 0 ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="checkbox"
            checked={value.switchQty > 0}
            onChange={e => set({ switchQty: e.target.checked ? 1 : 0 })}
            className="w-3.5 h-3.5 accent-indigo-500"
          />
          <span className="flex-1 text-[10px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            Switch (clicker)
          </span>
          {value.switchQty > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => set({ switchQty: Math.max(1, value.switchQty - 1) })}
                className="w-6 h-6 rounded flex items-center justify-center text-[12px] font-bold"
                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
              >−</button>
              <span className="text-[11px] font-bold w-4 text-center" style={{ color: "#a5b4fc" }}>{value.switchQty}</span>
              <button
                onClick={() => set({ switchQty: value.switchQty + 1 })}
                className="w-6 h-6 rounded flex items-center justify-center text-[12px] font-bold"
                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
              >+</button>
            </div>
          )}
          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {value.switchQty > 0
              ? `Rp ${(value.switchQty * rates.switchPerPcs).toLocaleString("id-ID")}`
              : `Rp ${rates.switchPerPcs.toLocaleString("id-ID")}/pcs`}
          </span>
        </div>

        {/* Label row */}
        <div className="flex items-center gap-3 py-2 px-3 rounded-[8px]"
             style={{ background: value.hasLabel ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="checkbox"
            checked={value.hasLabel}
            onChange={e => set({ hasLabel: e.target.checked })}
            className="w-3.5 h-3.5 accent-indigo-500"
          />
          <span className="flex-1 text-[10px]" style={{ color: "rgba(255,255,255,0.7)" }}>Label / Sticker</span>
          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Rp {rates.labelPerLembar.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      {/* Komponen Kustom */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.6)" }}>Komponen Elektronik / Custom</div>

        {value.komponenKustom.map(kk => (
          <div key={kk.id} className="grid gap-2 mb-2 items-center"
               style={{ gridTemplateColumns: "1fr 80px 50px 28px" }}>
            <input
              type="text"
              placeholder="LED Strip, MCU..."
              value={kk.nama}
              onChange={e => set({ komponenKustom: value.komponenKustom.map(k => k.id === kk.id ? { ...k, nama: e.target.value } : k) })}
              className="glass-input w-full h-7 rounded-[6px] px-2 text-[10px]"
            />
            <input
              type="number"
              min="0"
              placeholder="Harga"
              value={kk.harga || ""}
              onChange={e => set({ komponenKustom: value.komponenKustom.map(k => k.id === kk.id ? { ...k, harga: parseInt(e.target.value) || 0 } : k) })}
              className="glass-input w-full h-7 rounded-[6px] px-2 text-[10px]"
            />
            <input
              type="number"
              min="1"
              placeholder="Qty"
              value={kk.qty}
              onChange={e => set({ komponenKustom: value.komponenKustom.map(k => k.id === kk.id ? { ...k, qty: parseInt(e.target.value) || 1 } : k) })}
              className="glass-input w-full h-7 rounded-[6px] px-2 text-[10px]"
            />
            <button
              onClick={() => set({ komponenKustom: value.komponenKustom.filter(k => k.id !== kk.id) })}
              className="h-7 w-7 rounded-[6px] flex items-center justify-center text-[11px]"
              style={{ color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)" }}
            >✕</button>
          </div>
        ))}

        <button
          onClick={() => set({ komponenKustom: [...value.komponenKustom, { id: nextKkId(), nama: "", harga: 0, qty: 1 }] })}
          className="text-[11px] font-medium transition-colors"
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
```

- [ ] **Step 2: Commit**

```bash
git add components/kalkulator/AksesoriSection.tsx
git commit -m "feat(kalkulator-ui): AksesoriSection (packing/gantungan/switch/label/custom)"
```

---

### Task 3: HasilPanel Component

**Files:**
- Create: `components/kalkulator/HasilPanel.tsx`

- [ ] **Step 1: Create `components/kalkulator/HasilPanel.tsx`**

```tsx
"use client"

import type { HasilKalkulasi, KalkulasiStatus } from "@/lib/kalkulator/types"

interface Props {
  hasil: HasilKalkulasi | null
  hargaShopeeAktual?: number
  isLoading?: boolean
}

const STATUS_CONFIG: Record<KalkulasiStatus, { label: string; color: string; bg: string; border: string }> = {
  AMAN:       { label: "🟢 Aman",          color: "#34d399", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.2)"  },
  BAWAH_REKM: { label: "🟡 Bawah Rekm.",   color: "#fbbf24", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.2)"  },
  RUGI:       { label: "🔴 Rugi!",          color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)"   },
  TIDAK_DISET:{ label: "⬜ —",             color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5"
         style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span className="text-[11px]" style={{ color: color ?? "rgba(255,255,255,0.8)", fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  )
}

export function HasilPanel({ hasil, hargaShopeeAktual, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 rounded-[8px]" style={{ background: "rgba(255,255,255,0.04)" }} />
        ))}
      </div>
    )
  }

  if (!hasil) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center"
           style={{ color: "rgba(255,255,255,0.2)" }}>
        <div className="text-3xl mb-3">🧮</div>
        <div className="text-[12px]">Isi form di kiri untuk melihat hasil kalkulasi</div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[hasil.status]

  return (
    <div className="space-y-4">

      {/* Hero: Floor Price + Rekm Shopee A */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[10px] p-3 text-center"
             style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="text-[8px] font-semibold uppercase tracking-wider mb-1"
               style={{ color: "rgba(251,191,36,0.6)" }}>Floor Price</div>
          <div className="text-[15px] font-800" style={{ color: "#fbbf24" }}>
            {fmt(hasil.floorPrice)}
          </div>
          <div className="text-[8px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>batas diskon</div>
        </div>
        <div className="rounded-[10px] p-3 text-center"
             style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <div className="text-[8px] font-semibold uppercase tracking-wider mb-1"
               style={{ color: "rgba(165,180,252,0.6)" }}>Rekm. Shopee A</div>
          <div className="text-[15px] font-800" style={{ color: "#a5b4fc" }}>
            {fmt(hasil.shopeeA)}
          </div>
          <div className="text-[8px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>target ideal</div>
        </div>
      </div>

      {/* HPP Breakdown */}
      <div className="rounded-[10px] p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.5)" }}>HPP Breakdown</div>
        <Row label="HPP Produksi (cetak)" value={fmt(hasil.hppProduksi)} />
        <Row label="HPP Komponen (aksesori)" value={fmt(hasil.hppKomponen)} />
        <Row label="HPP Total" value={fmt(hasil.hppTotal)} bold color="#e5e7eb" />
      </div>

      {/* Harga Lengkap */}
      <div className="rounded-[10px] p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2"
             style={{ color: "rgba(165,180,252,0.5)" }}>Harga Lengkap</div>
        <Row label="Floor Price" value={fmt(hasil.floorPrice)} color="#fbbf24" />
        <Row label="Offline A · B · C"
             value={`${fmt(hasil.offlineA)} · ${fmt(hasil.offlineB)} · ${fmt(hasil.offlineC)}`}
             color="#34d399" />
        <Row label="Shopee A · B · C"
             value={`${fmt(hasil.shopeeA)} · ${fmt(hasil.shopeeB)} · ${fmt(hasil.shopeeC)}`}
             color="#a5b4fc" />
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, paddingTop: 4 }}>
          <Row label="Margin Offline A" value={fmtPct(hasil.marginOfflineA)} color="#34d399" />
          <Row label="Margin Shopee A (net)" value={fmtPct(hasil.marginShopeeA)} color="#a5b4fc" />
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, paddingTop: 4 }}>
          <Row label="Reseller standard" value={fmt(hasil.resellerStd)} />
          <Row label="Reseller bulk" value={fmt(hasil.resellerBulk)} />
        </div>
      </div>

      {/* Status vs Shopee Aktual */}
      {hargaShopeeAktual !== undefined && hargaShopeeAktual > 0 && (
        <div className="rounded-[10px] p-3" style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.border}` }}>
          <div className="flex justify-between items-center mb-2">
            <div className="text-[9px] font-semibold uppercase tracking-wider"
                 style={{ color: "rgba(255,255,255,0.5)" }}>vs Harga Shopee Saat Ini</div>
            <span className="text-[10px] font-bold" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
          </div>
          <Row label="Harga Shopee saat ini" value={fmt(hargaShopeeAktual)} bold />
          <Row label="vs Floor Price"
               value={`${hargaShopeeAktual >= hasil.floorPrice ? "+" : ""}${fmt(hargaShopeeAktual - hasil.floorPrice)}`}
               color={hargaShopeeAktual >= hasil.floorPrice ? "#34d399" : "#f87171"} />
          <Row label="vs Rekm. Shopee A"
               value={`${hargaShopeeAktual >= hasil.shopeeA ? "+" : ""}${fmt(hargaShopeeAktual - hasil.shopeeA)}`}
               color={hargaShopeeAktual >= hasil.shopeeA ? "#34d399" : "#f87171"} />
        </div>
      )}

    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/kalkulator/HasilPanel.tsx
git commit -m "feat(kalkulator-ui): HasilPanel with HPP breakdown, pricing table, status"
```

---

### Task 4: KalkulasiForm — Wire Input + Real-time Preview

**Files:**
- Create: `components/kalkulator/KalkulasiForm.tsx`

The form connects all input components and calls `hitungKalkulasi()` locally (no API) for real-time preview. Calls API only for Save.

- [ ] **Step 1: Create `components/kalkulator/KalkulasiForm.tsx`**

```tsx
"use client"

import { useState, useMemo, useCallback } from "react"
import { PlateTable } from "./PlateTable"
import { AksesoriSection } from "./AksesoriSection"
import { HasilPanel } from "./HasilPanel"
import { hitungKalkulasi } from "@/lib/kalkulator/formula"
import { useCreateKalkulasi, useUpdateKalkulasi, useKalkulatorRates } from "@/lib/hooks/use-kalkulator"
import type { KalkulasiData, KalkulasiInput, MarginTier, HasilKalkulasi } from "@/lib/kalkulator/types"
import type { AksesoriState } from "./AksesoriSection"

interface PlateRow {
  key: string
  namaPart?: string
  tipe: "FDM" | "SLA"
  gramasi: number
  durasiJam: number
}

const DEFAULT_AKSESORI: AksesoriState = {
  packingType: undefined,
  gantunganType: undefined,
  switchQty: 0,
  hasLabel: false,
  komponenKustom: [],
}

const DEFAULT_PLATE: PlateRow = { key: "plate-init-1", tipe: "FDM", gramasi: 0, durasiJam: 0 }

interface Props {
  initial?: KalkulasiData          // load existing for edit
  onSaved?: (k: KalkulasiData) => void
}

export function KalkulasiForm({ initial, onSaved }: Props) {
  const { data: ratesData } = useKalkulatorRates()
  const createMut = useCreateKalkulasi()
  const updateMut = useUpdateKalkulasi()

  const [nama, setNama] = useState(initial?.nama ?? "")
  const [batch, setBatch] = useState(initial?.batch ?? 1)
  const [marginTier, setMarginTier] = useState<MarginTier>(initial?.marginTier ?? "A")
  const [hargaShopee, setHargaShopee] = useState(initial?.hargaShopeeAktual ?? undefined as number | undefined)
  const [hargaShopeeStr, setHargaShopeeStr] = useState(initial?.hargaShopeeAktual ? String(initial.hargaShopeeAktual) : "")
  const [plates, setPlates] = useState<PlateRow[]>(
    initial?.plates.map(p => ({ key: `p-${p.id}`, namaPart: p.namaPart ?? undefined, tipe: p.tipe as "FDM"|"SLA", gramasi: p.gramasi, durasiJam: p.durasiJam }))
    ?? [DEFAULT_PLATE]
  )
  const [aksesori, setAksesori] = useState<AksesoriState>(
    initial ? {
      packingType: initial.packingType as any,
      gantunganType: initial.gantunganType ?? undefined,
      switchQty: initial.switchQty,
      hasLabel: initial.hasLabel,
      komponenKustom: initial.komponenKustom.map(k => ({ id: k.id, nama: k.nama, harga: k.harga, qty: k.qty })),
    } : DEFAULT_AKSESORI
  )

  // Real-time calculation — no API call
  const hasil: HasilKalkulasi | null = useMemo(() => {
    if (!ratesData) return null
    const validPlates = plates.filter(p => p.gramasi > 0 && p.durasiJam > 0)
    if (validPlates.length === 0) return null
    try {
      return hitungKalkulasi(
        validPlates,
        {
          packingType: aksesori.packingType,
          gantunganType: aksesori.gantunganType,
          switchQty: aksesori.switchQty,
          hasLabel: aksesori.hasLabel,
          komponenKustom: aksesori.komponenKustom,
        },
        Math.max(1, batch),
        ratesData,
        marginTier,
        hargaShopee && hargaShopee > 0 ? hargaShopee : undefined
      )
    } catch { return null }
  }, [plates, aksesori, batch, marginTier, hargaShopee, ratesData])

  const isEditing = !!initial

  async function handleSave() {
    if (!nama.trim() || plates.filter(p => p.gramasi > 0).length === 0) return
    const input: KalkulasiInput = {
      nama: nama.trim(),
      batch: Math.max(1, batch),
      marginTier,
      hargaShopeeAktual: hargaShopee && hargaShopee > 0 ? hargaShopee : undefined,
      packingType: aksesori.packingType,
      gantunganType: aksesori.gantunganType,
      switchQty: aksesori.switchQty,
      hasLabel: aksesori.hasLabel,
      plates: plates.filter(p => p.gramasi > 0).map(p => ({
        namaPart: p.namaPart,
        tipe: p.tipe,
        gramasi: p.gramasi,
        durasiJam: p.durasiJam,
      })),
      komponenKustom: aksesori.komponenKustom.filter(k => k.nama && k.harga > 0).map(k => ({
        nama: k.nama,
        harga: k.harga,
        qty: k.qty,
      })),
    }

    let saved: KalkulasiData
    if (isEditing && initial) {
      saved = await updateMut.mutateAsync({ id: initial.id, input })
    } else {
      saved = await createMut.mutateAsync(input)
    }
    onSaved?.(saved)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const hasValidInput = nama.trim().length > 0 && plates.some(p => p.gramasi > 0)

  const rates = ratesData ?? { packing: { S: 1500, M: 2500, L: 5000, XL: 8000 }, gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 }, switchPerPcs: 2500, labelPerLembar: 750 }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* LEFT: Input */}
      <div className="space-y-5">

        {/* Nama + Batch + Margin */}
        <div className="space-y-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
                 style={{ color: "rgba(165,180,252,0.6)" }}>Nama Kalkulasi</div>
            <input
              type="text"
              placeholder='e.g. "Flexi Shark 10pcs"'
              value={nama}
              onChange={e => setNama(e.target.value)}
              className="glass-input w-full h-9 rounded-[10px] px-3 text-[12px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color: "rgba(165,180,252,0.6)" }}>Batch (unit)</div>
              <input
                type="number"
                min="1"
                value={batch}
                onChange={e => setBatch(parseInt(e.target.value) || 1)}
                className="glass-input w-full h-9 rounded-[10px] px-3 text-[12px]"
              />
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color: "rgba(165,180,252,0.6)" }}>Margin</div>
              <div className="flex gap-2">
                {(["A", "B", "C"] as MarginTier[]).map(tier => (
                  <button
                    key={tier}
                    onClick={() => setMarginTier(tier)}
                    className="flex-1 h-9 rounded-[8px] text-[11px] font-bold transition-all"
                    style={marginTier === tier
                      ? { background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "#c7d2fe" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                    }
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Plate Table */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2"
               style={{ color: "rgba(165,180,252,0.6)" }}>Part / Plate</div>
          <PlateTable plates={plates} onChange={setPlates} />
        </div>

        {/* Aksesori */}
        <AksesoriSection value={aksesori} onChange={setAksesori} rates={rates} />

        {/* Harga Shopee */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
               style={{ color: "rgba(165,180,252,0.6)" }}>Harga Shopee Saat Ini
            <span className="ml-1 font-normal normal-case" style={{ color: "rgba(255,255,255,0.25)" }}>(opsional)</span>
          </div>
          <input
            type="text"
            placeholder="Rp 35.000"
            value={hargaShopeeStr}
            onChange={e => {
              setHargaShopeeStr(e.target.value)
              const n = parseInt(e.target.value.replace(/\D/g, ""))
              setHargaShopee(n > 0 ? n : undefined)
            }}
            className="glass-input w-full h-9 rounded-[10px] px-3 text-[12px]"
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!hasValidInput || isSaving}
          className="w-full h-11 rounded-[12px] text-[13px] font-semibold text-white transition-all"
          style={{
            background: hasValidInput && !isSaving ? "linear-gradient(135deg, #5055e8, #7c84f8)" : "rgba(99,102,241,0.3)",
            boxShadow: hasValidInput && !isSaving ? "0 4px 16px rgba(99,102,241,0.4)" : "none",
            cursor: hasValidInput && !isSaving ? "pointer" : "not-allowed",
          }}
        >
          {isSaving ? "Menyimpan..." : isEditing ? "💾 Update Kalkulasi" : "💾 Simpan Kalkulasi"}
        </button>
      </div>

      {/* RIGHT: Results */}
      <div className="rounded-[14px] p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.1)" }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-4"
             style={{ color: "rgba(165,180,252,0.5)" }}>Hasil Kalkulasi</div>
        <HasilPanel hasil={hasil} hargaShopeeAktual={hargaShopee} isLoading={!ratesData} />
      </div>

    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/kalkulator/KalkulasiForm.tsx
git commit -m "feat(kalkulator-ui): KalkulasiForm with real-time preview + save"
```

---

### Task 5: KalkulasiHistory Component

**Files:**
- Create: `components/kalkulator/KalkulasiHistory.tsx`

- [ ] **Step 1: Create `components/kalkulator/KalkulasiHistory.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useKalkulasiList, useDeleteKalkulasi, useDuplicateKalkulasi } from "@/lib/hooks/use-kalkulator"
import type { KalkulasiData, KalkulasiStatus } from "@/lib/kalkulator/types"

const STATUS_COLOR: Record<KalkulasiStatus, string> = {
  AMAN:        "#34d399",
  BAWAH_REKM:  "#fbbf24",
  RUGI:        "#f87171",
  TIDAK_DISET: "rgba(255,255,255,0.25)",
}
const STATUS_LABEL: Record<KalkulasiStatus, string> = {
  AMAN: "🟢", BAWAH_REKM: "🟡", RUGI: "🔴", TIDAK_DISET: "⬜",
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

interface Props {
  onEdit: (k: KalkulasiData) => void
  onLinkProduk: (k: KalkulasiData) => void
}

export function KalkulasiHistory({ onEdit, onLinkProduk }: Props) {
  const { data, isLoading } = useKalkulasiList()
  const deleteMut = useDeleteKalkulasi()
  const dupMut = useDuplicateKalkulasi()
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<KalkulasiStatus | "all">("all")
  const [dupDialog, setDupDialog] = useState<{ id: string; nama: string } | null>(null)
  const [dupNama, setDupNama] = useState("")
  const [dupBatch, setDupBatch] = useState(1)

  const items = data?.items ?? []
  const filtered = items.filter(k => {
    if (filterStatus !== "all" && k.status !== filterStatus) return false
    if (search && !k.nama.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function handleDelete(id: string) {
    if (!confirm("Hapus kalkulasi ini?")) return
    await deleteMut.mutateAsync(id)
  }

  async function handleDuplicate() {
    if (!dupDialog || !dupNama.trim()) return
    await dupMut.mutateAsync({ id: dupDialog.id, nama: dupNama.trim(), batch: dupBatch })
    setDupDialog(null)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.6)" }}>
          Riwayat Tersimpan
        </div>
        <div className="flex-1" />
        {/* Search */}
        <input
          type="text"
          placeholder="Cari..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="glass-input h-7 w-36 rounded-[8px] px-2 text-[10px]"
        />
        {/* Filter */}
        {(["all", "AMAN", "BAWAH_REKM", "RUGI"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="h-7 px-3 rounded-[8px] text-[9px] font-medium transition-all"
            style={filterStatus === s
              ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
              : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }
            }
          >
            {s === "all" ? "Semua" : STATUS_LABEL[s as KalkulasiStatus]}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat...</div>}
      {!isLoading && filtered.length === 0 && (
        <div className="text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.3)" }}>
          {items.length === 0 ? "Belum ada kalkulasi tersimpan" : "Tidak ada hasil"}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(k => (
          <div key={k.id}
               className="flex items-center gap-3 px-4 py-3 rounded-[10px] group transition-all"
               style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
               onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.06)")}
               onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}>

            {/* Status */}
            <span className="text-[14px] flex-shrink-0">{STATUS_LABEL[k.status as KalkulasiStatus]}</span>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {k.nama}
                </span>
                {k.produkLinks.length > 0 && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
                    🔗 {k.produkLinks.length}
                  </span>
                )}
                {k.produkLinks.some(l => l.isPrimary) && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.12)", color: "#34d399" }}>
                    🔑
                  </span>
                )}
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                {k.plates.length} part · batch {k.batch} · {new Date(k.createdAt).toLocaleDateString("id-ID")}
              </div>
            </div>

            {/* Prices */}
            <div className="text-right flex-shrink-0">
              <div className="text-[11px] font-bold" style={{ color: STATUS_COLOR[k.status as KalkulasiStatus] }}>
                {fmt(k.floorPrice)}
              </div>
              <div className="text-[9px]" style={{ color: "rgba(165,180,252,0.5)" }}>
                Shopee A: {fmt(k.shopeeA)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(k)}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
                Edit
              </button>
              <button onClick={() => { setDupNama(k.nama + " (copy)"); setDupBatch(k.batch); setDupDialog({ id: k.id, nama: k.nama }) }}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                Duplikat
              </button>
              <button onClick={() => onLinkProduk(k)}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                🔗
              </button>
              <button onClick={() => handleDelete(k.id)}
                className="h-7 px-2 rounded-[6px] text-[9px] font-medium"
                style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Duplicate Dialog */}
      {dupDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
             style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
             onClick={() => setDupDialog(null)}>
          <div className="w-80 rounded-[16px] p-6 space-y-4"
               style={{ background: "rgba(14,14,44,0.95)", border: "1px solid rgba(99,102,241,0.2)" }}
               onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-bold">Duplikat Kalkulasi</div>
            <div>
              <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: "rgba(165,180,252,0.6)" }}>Nama Baru</div>
              <input type="text" value={dupNama} onChange={e => setDupNama(e.target.value)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-[12px]" />
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: "rgba(165,180,252,0.6)" }}>Batch Baru</div>
              <input type="number" min="1" value={dupBatch} onChange={e => setDupBatch(parseInt(e.target.value) || 1)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-[12px]" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDupDialog(null)}
                className="flex-1 h-9 rounded-[8px] text-[11px]"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                Batal
              </button>
              <button onClick={handleDuplicate} disabled={!dupNama.trim() || dupMut.isPending}
                className="flex-1 h-9 rounded-[8px] text-[11px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
                {dupMut.isPending ? "..." : "Duplikat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/kalkulator/KalkulasiHistory.tsx
git commit -m "feat(kalkulator-ui): KalkulasiHistory with search/filter/edit/duplicate/delete"
```

---

### Task 6: LinkProdukModal Component

**Files:**
- Create: `components/kalkulator/LinkProdukModal.tsx`

- [ ] **Step 1: Create `components/kalkulator/LinkProdukModal.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useAddProdukLink, useRemoveProdukLink, useSetPrimaryLink } from "@/lib/hooks/use-kalkulator"
import { useProducts } from "@/lib/hooks/use-products"
import type { KalkulasiData, KalkulasiProdukData } from "@/lib/kalkulator/types"

interface Props {
  kalkulasi: KalkulasiData
  onClose: () => void
}

type ModalTab = "shopee" | "manual"

export function LinkProdukModal({ kalkulasi, onClose }: Props) {
  const [tab, setTab] = useState<ModalTab>("shopee")
  const [search, setSearch] = useState("")
  const [manualNama, setManualNama] = useState("")
  const [isPrimary, setIsPrimary] = useState(false)

  const addLink = useAddProdukLink()
  const removeLink = useRemoveProdukLink()
  const setPrimary = useSetPrimaryLink()

  // Use existing products hook
  const { data: productsData } = useProducts()
  const allProducts = productsData?.products ?? []
  const searchedProducts = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const linkedShopeeIds = new Set(kalkulasi.produkLinks.filter(l => l.shopeeItemId).map(l => l.shopeeItemId))

  async function handleLinkShopee(itemId: string, name: string) {
    if (linkedShopeeIds.has(itemId)) return
    await addLink.mutateAsync({
      kalkulasiId: kalkulasi.id,
      input: { shopeeItemId: itemId, isPrimary },
    })
  }

  async function handleLinkManual() {
    if (!manualNama.trim()) return
    await addLink.mutateAsync({
      kalkulasiId: kalkulasi.id,
      input: { namaManual: manualNama.trim(), isPrimary },
    })
    setManualNama("")
  }

  async function handleRemove(linkId: string) {
    await removeLink.mutateAsync({ kalkulasiId: kalkulasi.id, linkId })
  }

  async function handleSetPrimary(link: KalkulasiProdukData) {
    await setPrimary.mutateAsync({ kalkulasiId: kalkulasi.id, linkId: link.id })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
         onClick={onClose}>
      <div className="w-96 max-h-[80vh] flex flex-col rounded-[20px] overflow-hidden"
           style={{ background: "rgba(14,14,44,0.96)", border: "1px solid rgba(99,102,241,0.2)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between"
             style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
          <div>
            <div className="text-[13px] font-bold">🔗 Link ke Produk</div>
            <div className="text-[10px] mt-0.5" style={{ color: "rgba(165,180,252,0.5)" }}>
              {kalkulasi.nama}
            </div>
          </div>
          <button onClick={onClose} className="text-[16px]" style={{ color: "rgba(255,255,255,0.3)" }}>✕</button>
        </div>

        {/* Current links */}
        {kalkulasi.produkLinks.length > 0 && (
          <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(99,102,241,0.08)" }}>
            <div className="text-[9px] font-semibold uppercase mb-2" style={{ color: "rgba(165,180,252,0.5)" }}>
              Terhubung ({kalkulasi.produkLinks.length})
            </div>
            {kalkulasi.produkLinks.map(link => (
              <div key={link.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-[10px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {link.shopeeItemId ? `Shopee: ${link.shopeeItemId}` : link.namaManual}
                </span>
                {link.isPrimary
                  ? <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.12)", color: "#34d399" }}>🔑 Primary</span>
                  : <button onClick={() => handleSetPrimary(link)} className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}>Set Primary</button>
                }
                <button onClick={() => handleRemove(link.id)} className="text-[10px]" style={{ color: "rgba(239,68,68,0.5)" }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {([["shopee", "Produk Shopee"], ["manual", "Nama Manual"]] as [ModalTab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-2.5 text-[11px] font-medium border-b-2 transition-colors"
              style={tab === key
                ? { borderColor: "#6366f1", color: "#a5b4fc" }
                : { borderColor: "transparent", color: "rgba(255,255,255,0.4)" }
              }>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* isPrimary toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} className="accent-indigo-500" />
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>Set sebagai referensi harga utama (Primary)</span>
          </label>

          {tab === "shopee" && (
            <>
              <input type="text" placeholder="🔍 Cari produk Shopee..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="glass-input w-full h-8 rounded-[8px] px-3 text-[11px]" />
              <div className="space-y-1">
                {searchedProducts.slice(0, 8).map(p => {
                  const linked = linkedShopeeIds.has(p.itemId)
                  return (
                    <div key={p.itemId} className="flex items-center gap-2 p-2 rounded-[8px] cursor-pointer transition-all"
                         style={{ background: linked ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${linked ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}` }}
                         onClick={() => !linked && handleLinkShopee(p.itemId, p.name)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-medium truncate" style={{ color: "rgba(255,255,255,0.8)" }}>{p.name}</div>
                        <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.3)" }}>{p.itemId}</div>
                      </div>
                      {linked
                        ? <span className="text-[9px]" style={{ color: "#a5b4fc" }}>✓ Linked</span>
                        : <span className="text-[9px]" style={{ color: "rgba(99,102,241,0.6)" }}>+ Link</span>
                      }
                    </div>
                  )
                })}
                {searchedProducts.length === 0 && (
                  <div className="text-[10px] text-center py-3" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Tidak ada produk ditemukan
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "manual" && (
            <div className="space-y-3">
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                Untuk produk yang belum listing di Shopee. Bisa di-update ke produk Shopee nanti.
              </div>
              <input type="text" placeholder="Nama produk..." value={manualNama}
                onChange={e => setManualNama(e.target.value)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-[12px]" />
              <button onClick={handleLinkManual} disabled={!manualNama.trim() || addLink.isPending}
                className="w-full h-9 rounded-[8px] text-[11px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
                {addLink.isPending ? "Menyimpan..." : "+ Tambah Manual"}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
```

**Note:** `useProducts` from `@/lib/hooks/use-products` — check if this hook already exists. If not, the modal still works; just the Shopee product search list will be empty.

- [ ] **Step 2: Check if `useProducts` hook exists, if not create a minimal version**

```bash
grep -rn "useProducts\|use-products" lib/hooks/ 2>/dev/null | head -5
```

If it doesn't exist, create `lib/hooks/use-products.ts` with:
```typescript
'use client'
import { useQuery } from '@tanstack/react-query'
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{ products: { itemId: string; name: string }[] }>
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add components/kalkulator/LinkProdukModal.tsx
git commit -m "feat(kalkulator-ui): LinkProdukModal (Shopee + manual, isPrimary)"
```

---

### Task 7: KalkulasiTab + Wire into Produk Page

**Files:**
- Create: `components/kalkulator/KalkulasiTab.tsx`
- Modify: `app/(dashboard)/produk/page.tsx`

- [ ] **Step 1: Create `components/kalkulator/KalkulasiTab.tsx`**

```tsx
"use client"

import { useState } from "react"
import { KalkulasiForm } from "./KalkulasiForm"
import { KalkulasiHistory } from "./KalkulasiHistory"
import { LinkProdukModal } from "./LinkProdukModal"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { KalkulasiData } from "@/lib/kalkulator/types"

export function KalkulasiTab() {
  const [editingKalk, setEditingKalk] = useState<KalkulasiData | null>(null)
  const [linkingKalk, setLinkingKalk] = useState<KalkulasiData | null>(null)
  const [savedKalk, setSavedKalk] = useState<KalkulasiData | null>(null)

  function handleEdit(k: KalkulasiData) {
    setEditingKalk(k)
    setSavedKalk(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function handleSaved(k: KalkulasiData) {
    setSavedKalk(k)
    setEditingKalk(null)
  }

  function handleNew() {
    setEditingKalk(null)
    setSavedKalk(null)
  }

  return (
    <div className="space-y-6">
      <GlassPageHeader
        title="Kalkulator Harga"
        subtitle="Hitung HPP, Floor Price, dan rekomendasi harga jual per produk"
      >
        {editingKalk && (
          <button
            onClick={handleNew}
            className="h-8 px-3 rounded-[8px] text-[11px]"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          >
            + Kalkulasi Baru
          </button>
        )}
      </GlassPageHeader>

      {/* Success banner */}
      {savedKalk && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-[10px]"
             style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <span className="text-[13px]">✅</span>
          <span className="text-[11px] flex-1" style={{ color: "#34d399" }}>
            Kalkulasi "<strong>{savedKalk.nama}</strong>" berhasil disimpan!
          </span>
          <button
            onClick={() => setLinkingKalk(savedKalk)}
            className="text-[10px] px-2 py-1 rounded-[6px]"
            style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
          >
            🔗 Link Produk
          </button>
          <button onClick={() => setSavedKalk(null)} style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Calculator Form */}
      <KalkulasiForm
        key={editingKalk?.id ?? "new"}
        initial={editingKalk ?? undefined}
        onSaved={handleSaved}
      />

      {/* History */}
      <div className="pt-4" style={{ borderTop: "1px solid rgba(99,102,241,0.1)" }}>
        <KalkulasiHistory
          onEdit={handleEdit}
          onLinkProduk={k => setLinkingKalk(k)}
        />
      </div>

      {/* Link Produk Modal */}
      {linkingKalk && (
        <LinkProdukModal
          kalkulasi={linkingKalk}
          onClose={() => setLinkingKalk(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Modify `app/(dashboard)/produk/page.tsx` — add Kalkulator tab**

Read the file first. Find the state declaration and tab buttons section. Make these changes:

**Change state type:**
```tsx
// FROM:
const [produkTab, setProdukTab] = useState<"produk" | "filamen">("produk")

// TO:
const [produkTab, setProdukTab] = useState<"produk" | "filamen" | "kalkulator">("produk")
```

**Add import at top:**
```tsx
import { KalkulasiTab } from "@/components/kalkulator/KalkulasiTab"
```

**Add third tab button** (after the Filamen button):
```tsx
<button
  onClick={() => setProdukTab("kalkulator")}
  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
    produkTab === "kalkulator"
      ? "border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
      : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
  }`}
>
  🧮 Kalkulator
</button>
```

**Add conditional render** (alongside the existing filamen/produk conditionals):
```tsx
{produkTab === "kalkulator" ? (
  <KalkulasiTab />
) : produkTab === "filamen" ? (
  <FilamenTab />
) : (
  <>
    {/* existing produk content */}
  </>
)}
```

- [ ] **Step 3: Run tests to make sure nothing broken**

```bash
npm test -- --passWithNoTests 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add components/kalkulator/ "app/(dashboard)/produk/page.tsx"
git commit -m "feat(kalkulator-ui): KalkulasiTab + wire into Produk page as third sub-tab"
```

---

### Task 8: Build + Deploy + Verify

- [ ] **Step 1: Build**

```bash
./deploy.sh build 2>&1 | grep -E "error|TypeScript|✅|❌" | head -20
```

Expected: `✅  Deploy berhasil!`

Fix any TypeScript errors before continuing.

- [ ] **Step 2: Reconnect**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker network connect homelab shopee-dashboard 2>/dev/null || true
```

- [ ] **Step 3: Verify in browser**

Open `http://shopee.homelab.lan` → halaman Produk → klik tab **🧮 Kalkulator**. Confirm:
- [ ] Tab "🧮 Kalkulator" muncul dan bisa diklik ✅
- [ ] Form input muncul: nama, batch, plates table, aksesori ✅
- [ ] Tambah part di plate table berfungsi ✅
- [ ] Pilih packing, gantungan, switch works ✅
- [ ] Hasil muncul real-time di panel kanan saat gramasi/durasi diisi ✅
- [ ] Tombol Simpan aktif ketika ada nama + gramasi ✅
- [ ] Setelah simpan → muncul di riwayat ✅
- [ ] Edit dari riwayat → load ke form ✅
- [ ] Duplikat kalkulasi works ✅

- [ ] **Step 4: Push**

```bash
git push
```
