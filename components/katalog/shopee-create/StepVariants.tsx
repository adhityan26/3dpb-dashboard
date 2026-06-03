"use client"

import { useState } from "react"
import { X, Plus } from "lucide-react"
import type { WizardState } from "./ShopeeCreateWizard"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.85)",
  fontSize: "12px",
  padding: "6px 10px",
  outline: "none",
} as const

export function StepVariants({ state, update }: Props) {
  const [optionInput, setOptionInput] = useState("")

  function addOption() {
    const val = optionInput.trim()
    if (!val || state.tierVariationOptions.includes(val)) return
    const newOptions = [...state.tierVariationOptions, val]
    const newModels = newOptions.map((_, i) => {
      const existing = state.models.find(m => m.optionIndex === i)
      return existing ?? { optionIndex: i, price: state.price || 0, stock: state.stock || 1 }
    })
    update({ tierVariationOptions: newOptions, models: newModels })
    setOptionInput("")
  }

  function removeOption(index: number) {
    const newOptions = state.tierVariationOptions.filter((_, i) => i !== index)
    const newModels = newOptions.map((_, i) => {
      const existing = state.models.find(m => m.optionIndex === i)
      return { ...(existing ?? { price: state.price || 0, stock: state.stock || 1 }), optionIndex: i }
    })
    update({ tierVariationOptions: newOptions, models: newModels })
  }

  function updateModel(optionIndex: number, field: "price" | "stock", value: number) {
    update({
      models: state.models.map(m =>
        m.optionIndex === optionIndex ? { ...m, [field]: value } : m,
      ),
    })
  }

  return (
    <div className="space-y-4">
      {/* Nama variasi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Nama Variasi <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5 font-normal" style={{ color: "rgba(255,255,255,0.25)" }}>Contoh: Ukuran, Warna</span>
        </label>
        <input
          type="text"
          value={state.tierVariationName}
          onChange={e => update({ tierVariationName: e.target.value })}
          placeholder="Ukuran"
          style={{ ...inputStyle, width: "100%", fontSize: "13px", padding: "8px 12px" }}
        />
      </div>

      {/* Opsi variasi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Opsi <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5 font-normal" style={{ color: "rgba(255,255,255,0.25)" }}>Min. 2</span>
        </label>
        <div className="flex gap-2 mb-2 flex-wrap">
          {state.tierVariationOptions.map((opt, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px]"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}
            >
              {opt}
              <button
                onClick={() => removeOption(i)}
                className="hover:opacity-70 transition-opacity"
                aria-label={`Hapus opsi ${opt}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={optionInput}
            onChange={e => setOptionInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption() }}}
            placeholder="Tambah opsi..."
            style={{ ...inputStyle, flex: 1, fontSize: "13px", padding: "8px 12px" }}
          />
          <button
            onClick={addOption}
            className="px-3 py-2 rounded-[8px] flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
            style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}
            aria-label="Tambah opsi"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabel harga & stok per opsi */}
      {state.tierVariationOptions.length > 0 && (
        <div>
          <label className="block text-[11px] font-medium mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
            Harga & Stok per Opsi
          </label>
          <div
            className="rounded-[10px] overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="grid text-[10px] font-semibold px-3 py-2"
              style={{
                gridTemplateColumns: "1fr 110px 90px",
                gap: "8px",
                background: "rgba(255,255,255,0.03)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              <span>{state.tierVariationName || "Opsi"}</span>
              <span>Harga (Rp)</span>
              <span>Stok</span>
            </div>
            {state.tierVariationOptions.map((opt, i) => {
              const model = state.models.find(m => m.optionIndex === i)
              return (
                <div
                  key={i}
                  className="grid items-center px-3 py-2"
                  style={{
                    gridTemplateColumns: "1fr 110px 90px",
                    gap: "8px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>{opt}</span>
                  <input
                    type="number"
                    min={0}
                    value={model?.price || ""}
                    onChange={e => updateModel(i, "price", Number(e.target.value))}
                    placeholder="0"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min={1}
                    value={model?.stock || ""}
                    onChange={e => updateModel(i, "stock", Number(e.target.value))}
                    placeholder="1"
                    style={inputStyle}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
