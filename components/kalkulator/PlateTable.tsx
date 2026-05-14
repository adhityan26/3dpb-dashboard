"use client"

import { useState, useRef } from "react"
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

export function PlateTable({ plates, onChange }: PlateTableProps) {
  const [durasiRaw, setDurasiRaw] = useState<Record<string, string>>({})
  const keyCounterRef = useRef(0)
  function nextKey() { return `plate-${++keyCounterRef.current}` }

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

  function updatePlate<K extends keyof PlateInput>(key: string, field: K, value: PlateInput[K]) {
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
           style={{ gridTemplateColumns: multiPlate ? "1fr 60px 70px 80px 28px" : "60px 70px 80px", color: "rgba(165,180,252,0.6)" }}>
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
