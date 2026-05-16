"use client"

import { useState, useRef } from "react"
import type { PlateInput, PrintTipe, FilamentEntry } from "@/lib/kalkulator/types"

interface PlateRow extends PlateInput {
  key: string
}

interface PlateTableProps {
  plates: PlateRow[]
  onChange: (plates: PlateRow[]) => void
}

function parseDurasi(raw: string): number {
  const trimmed = raw.trim()
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

const PRINTERS = [
  "Bambu Lab A1",
  "Bambu Lab A1 Mini",
  "Bambu Lab P1S",
  "Bambu Lab P1P",
  "Bambu Lab X1C",
  "Bambu Lab P2S",
  "Snapmaker U1",
]

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
    updatePlate(key, "durasiJam", parseDurasi(raw))
  }

  // Multi-material helpers
  function toggleMultiMaterial(key: string) {
    const plate = plates.find(p => p.key === key)
    if (!plate) return
    const isMulti = (plate.materials?.length ?? 0) > 0

    if (isMulti) {
      // Switch back to single: clear materials
      onChange(plates.map(p => p.key === key ? { ...p, materials: undefined } : p))
    } else {
      // Switch to multi: seed first entry from existing tipe+gramasi
      const firstEntry: FilamentEntry = {
        brand: "",
        material: plate.tipe === "SLA" ? "Resin" : "PLA+",
        color: "",
        gramasi: plate.gramasi ?? 0,
        isSupport: false,
      }
      onChange(plates.map(p => p.key === key ? { ...p, materials: [firstEntry] } : p))
    }
  }

  function addMaterial(key: string) {
    const plate = plates.find(p => p.key === key)
    if (!plate) return
    const newEntry: FilamentEntry = { brand: "", material: "PLA+", color: "", gramasi: 0, isSupport: false }
    onChange(plates.map(p =>
      p.key === key ? { ...p, materials: [...(p.materials ?? []), newEntry] } : p
    ))
  }

  function updateMaterial(key: string, idx: number, field: keyof FilamentEntry, value: string | number | boolean) {
    onChange(plates.map(p => {
      if (p.key !== key) return p
      const mats = [...(p.materials ?? [])]
      mats[idx] = { ...mats[idx], [field]: value }
      return { ...p, materials: mats }
    }))
  }

  function removeMaterial(key: string, idx: number) {
    onChange(plates.map(p => {
      if (p.key !== key) return p
      const mats = (p.materials ?? []).filter((_, i) => i !== idx)
      // If no materials left, revert to single mode
      return { ...p, materials: mats.length > 0 ? mats : undefined }
    }))
  }

  // Total gramasi accounts for multi-material plates
  const totalGramasi = plates.reduce((s, p) => {
    if ((p.materials?.length ?? 0) > 0) {
      return s + (p.materials ?? []).reduce((ms, m) => ms + (m.gramasi || 0), 0)
    }
    return s + (p.gramasi || 0)
  }, 0)
  const totalDurasi = plates.reduce((s, p) => s + (p.durasiJam || 0), 0)
  const multiPlate = plates.length > 1

  return (
    <div className="space-y-3">

      {plates.map((plate, idx) => {
        const isMultiMode = (plate.materials?.length ?? 0) > 0
        const multiGramasi = isMultiMode
          ? (plate.materials ?? []).reduce((s, m) => s + (m.gramasi || 0), 0)
          : 0

        return (
          <div key={plate.key}
            className="rounded-[10px] p-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>

            {/* Row label for multi-plate */}
            {multiPlate && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold" style={{ color: "rgba(165,180,252,0.5)" }}>
                  Part {idx + 1}
                </span>
                <input
                  type="text"
                  placeholder="Nama part (opsional)"
                  value={plate.namaPart ?? ""}
                  onChange={e => updatePlate(plate.key, "namaPart", e.target.value || undefined)}
                  className="glass-input flex-1 h-8 rounded-[6px] px-3 text-xs"
                />
                {/* Multi-material toggle */}
                <button
                  onClick={() => toggleMultiMaterial(plate.key)}
                  className="h-8 px-2.5 rounded-[6px] text-[10px] font-semibold transition-all flex-shrink-0"
                  style={isMultiMode
                    ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }
                  }
                  title={isMultiMode ? "Kembali ke single material" : "Aktifkan multi-material (AMS)"}
                >
                  {isMultiMode ? "✕ Multi" : "🎨 Multi"}
                </button>
                <button
                  onClick={() => removePlate(plate.key)}
                  className="h-8 w-8 rounded-[6px] flex items-center justify-center text-sm transition-all flex-shrink-0"
                  style={{ color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.7)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Single-plate: show toggle button in its own row */}
            {!multiPlate && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => toggleMultiMaterial(plate.key)}
                  className="h-7 px-2.5 rounded-[6px] text-[10px] font-semibold transition-all"
                  style={isMultiMode
                    ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }
                  }
                  title={isMultiMode ? "Kembali ke single material" : "Aktifkan multi-material (AMS)"}
                >
                  {isMultiMode ? "✕ Multi" : "🎨 Multi"}
                </button>
              </div>
            )}

            {/* SINGLE MATERIAL MODE */}
            {!isMultiMode && (
              <div className="grid gap-2" style={{ gridTemplateColumns: "80px 1fr 1fr" }}>

                {/* Tipe: FDM / SLA */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                       style={{ color: "rgba(165,180,252,0.5)" }}>Tipe</div>
                  <div className="flex gap-1 h-10">
                    {(["FDM", "SLA"] as PrintTipe[]).map(t => (
                      <button
                        key={t}
                        onClick={() => updatePlate(plate.key, "tipe", t)}
                        className="flex-1 rounded-[6px] text-xs font-bold transition-all"
                        style={plate.tipe === t
                          ? { background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                          : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gramasi */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                       style={{ color: "rgba(165,180,252,0.5)" }}>Gramasi (g)</div>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="21"
                    value={plate.gramasi || ""}
                    onChange={e => updatePlate(plate.key, "gramasi", parseFloat(e.target.value) || 0)}
                    className="glass-input w-full h-10 rounded-[8px] px-3 text-sm"
                  />
                </div>

                {/* Durasi */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                       style={{ color: "rgba(165,180,252,0.5)" }}>Durasi</div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="1:30 atau 1.5"
                      value={durasiRaw[plate.key] ?? (plate.durasiJam ? String(parseFloat(plate.durasiJam.toFixed(2))) : "")}
                      onChange={e => handleDurasiChange(plate.key, e.target.value)}
                      className="glass-input w-full h-10 rounded-[8px] px-3 text-sm"
                    />
                    {plate.durasiJam > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
                            style={{ color: "rgba(99,102,241,0.7)" }}>
                        {formatDurasiDisplay(plate.durasiJam)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* MULTI-MATERIAL MODE */}
            {isMultiMode && (
              <div className="space-y-2">
                {/* Header row */}
                <div className="grid text-[9px] font-semibold uppercase tracking-wider px-1"
                     style={{ gridTemplateColumns: "1fr 1fr 1fr 52px 52px 24px", color: "rgba(165,180,252,0.45)", gap: "4px" }}>
                  <span>Brand</span>
                  <span>Material</span>
                  <span>Color</span>
                  <span>Gram</span>
                  <span>Support</span>
                  <span />
                </div>

                {(plate.materials ?? []).map((mat, mIdx) => (
                  <div key={mIdx}
                       className="grid items-center"
                       style={{ gridTemplateColumns: "1fr 1fr 1fr 52px 52px 24px", gap: "4px" }}>
                    <input
                      type="text"
                      placeholder="Bambu"
                      value={mat.brand}
                      onChange={e => updateMaterial(plate.key, mIdx, "brand", e.target.value)}
                      className="glass-input h-8 rounded-[6px] px-2 text-xs w-full"
                    />
                    <input
                      type="text"
                      placeholder="PLA+"
                      value={mat.material}
                      onChange={e => updateMaterial(plate.key, mIdx, "material", e.target.value)}
                      className="glass-input h-8 rounded-[6px] px-2 text-xs w-full"
                    />
                    <input
                      type="text"
                      placeholder="Red"
                      value={mat.color}
                      onChange={e => updateMaterial(plate.key, mIdx, "color", e.target.value)}
                      className="glass-input h-8 rounded-[6px] px-2 text-xs w-full"
                    />
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        value={mat.gramasi || ""}
                        onChange={e => updateMaterial(plate.key, mIdx, "gramasi", parseFloat(e.target.value) || 0)}
                        className="glass-input h-8 rounded-[6px] px-2 text-xs w-full"
                        style={{ paddingRight: "14px" }}
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px]"
                            style={{ color: "rgba(165,180,252,0.4)", pointerEvents: "none" }}>g</span>
                    </div>
                    <div className="flex items-center justify-center h-8">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mat.isSupport ?? false}
                          onChange={e => updateMaterial(plate.key, mIdx, "isSupport", e.target.checked)}
                          className="w-3 h-3 accent-indigo-400"
                        />
                        <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>Sup</span>
                      </label>
                    </div>
                    <button
                      onClick={() => removeMaterial(plate.key, mIdx)}
                      className="h-8 w-6 flex items-center justify-center rounded-[4px] text-xs transition-all flex-shrink-0"
                      style={{ color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.7)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Total gramasi + add button */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => addMaterial(plate.key)}
                    className="text-xs font-medium transition-colors"
                    style={{ color: "rgba(99,102,241,0.7)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
                  >
                    + Tambah Material
                  </button>
                  <span className="text-[10px] font-semibold" style={{ color: "rgba(165,180,252,0.6)" }}>
                    Total: {multiGramasi.toFixed(1)}g
                  </span>
                </div>

                {/* Durasi row (still needed in multi mode) */}
                <div className="mt-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                       style={{ color: "rgba(165,180,252,0.5)" }}>Durasi</div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="1:30 atau 1.5"
                      value={durasiRaw[plate.key] ?? (plate.durasiJam ? String(parseFloat(plate.durasiJam.toFixed(2))) : "")}
                      onChange={e => handleDurasiChange(plate.key, e.target.value)}
                      className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
                    />
                    {plate.durasiJam > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
                            style={{ color: "rgba(99,102,241,0.7)" }}>
                        {formatDurasiDisplay(plate.durasiJam)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Printer selector — always shown */}
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color: "rgba(165,180,252,0.5)" }}>Printer</div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => updatePlate(plate.key, "printer", undefined)}
                  className="h-8 px-3 rounded-[6px] text-xs transition-all"
                  style={!plate.printer
                    ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }
                  }
                >
                  —
                </button>
                {PRINTERS.map(printer => (
                  <button
                    key={printer}
                    onClick={() => updatePlate(plate.key, "printer", printer)}
                    className="h-8 px-3 rounded-[6px] text-xs font-medium transition-all"
                    style={plate.printer === printer
                      ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }
                    }
                  >
                    {printer.replace("Bambu Lab ", "").replace("Snapmaker ", "")}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )
      })}

      {/* Total row (multi-plate only) */}
      {multiPlate && (
        <div className="flex items-center gap-4 px-1"
             style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
          <span className="text-xs font-semibold" style={{ color: "rgba(165,180,252,0.5)" }}>
            TOTAL · {plates.length} parts
          </span>
          <span className="flex-1" />
          <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>
            {totalGramasi.toFixed(1)}g
          </span>
          <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>
            {formatDurasiDisplay(totalDurasi)}
          </span>
        </div>
      )}

      {/* Add plate button */}
      <button
        onClick={addPlate}
        className="text-sm font-medium transition-colors"
        style={{ color: "rgba(99,102,241,0.7)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
      >
        + Tambah Part
      </button>
    </div>
  )
}
