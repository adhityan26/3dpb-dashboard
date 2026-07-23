"use client"

import { useShopeeLogistics } from "@/lib/hooks/use-shopee-create"
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
  fontSize: "13px",
  padding: "8px 12px",
  width: "100%",
  outline: "none",
} as const

export function StepShipping({ state, update }: Props) {
  const { data: logistics = [], isLoading } = useShopeeLogistics()

  function toggleLogistic(id: number) {
    const sel = state.selectedLogistics
    update({
      selectedLogistics: sel.includes(id)
        ? sel.filter(l => l !== id)
        : [...sel, id],
    })
  }

  return (
    <div className="space-y-4">
      {/* Berat */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Berat <span style={{ color: "#f87171" }}>*</span>
        </label>
        <div className="relative">
          <input
            type="number"
            min={0}
            step={0.1}
            value={state.weight || ""}
            onChange={e => update({ weight: Number(e.target.value) })}
            placeholder="0.3"
            style={{ ...inputStyle, paddingRight: "40px" }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            kg
          </span>
        </div>
      </div>

      {/* Dimensi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Dimensi Paket <span style={{ color: "rgba(255,255,255,0.25)" }}>(opsional, cm)</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["packageLength", "packageWidth", "packageHeight"] as const).map((key, i) => (
            <div key={key} className="relative">
              <input
                type="number"
                min={0}
                value={state[key] || ""}
                onChange={e => update({ [key]: Number(e.target.value) } as Partial<WizardState>)}
                placeholder={["P", "L", "T"][i]}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Jasa kirim */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Jasa Kirim <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
            (pilih min. 1)
          </span>
        </label>
        <div
          className="rounded-[5px] overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
        >
          {isLoading && (
            <div className="px-3 py-4 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Memuat jasa kirim...
            </div>
          )}
          {logistics.map(l => {
            const isSelected = state.selectedLogistics.includes(l.logistic_id)
            return (
              <label
                key={l.logistic_id}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleLogistic(l.logistic_id)}
                  className="w-3.5 h-3.5 accent-indigo-500"
                />
                <span className="text-[12px]" style={{ color: isSelected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}>
                  {l.logistic_name}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Toggle variasi */}
      <div
        className="flex items-center justify-between p-3 rounded-[5px]"
        style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}
      >
        <div>
          <div className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Aktifkan Variasi</div>
          <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            Contoh: ukuran S/M/L, warna
          </div>
        </div>
        <button
          onClick={() => update({ variantsEnabled: !state.variantsEnabled })}
          className="relative w-10 h-6 rounded-full transition-colors"
          style={{ background: state.variantsEnabled ? "rgba(99,102,241,0.7)" : "rgba(255,255,255,0.15)" }}
          aria-label={state.variantsEnabled ? "Nonaktifkan variasi" : "Aktifkan variasi"}
        >
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: state.variantsEnabled ? "translateX(20px)" : "translateX(2px)" }}
          />
        </button>
      </div>
    </div>
  )
}
