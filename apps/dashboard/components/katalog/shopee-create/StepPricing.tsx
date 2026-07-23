"use client"

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

export function StepPricing({ state, update }: Props) {
  if (state.variantsEnabled) {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-[5px]"
        style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
      >
        <span className="text-xl">⚡</span>
        <div>
          <div className="text-[13px] font-medium" style={{ color: "#fbbf24" }}>Variasi aktif</div>
          <div className="text-[11px] mt-0.5" style={{ color: "rgba(251,191,36,0.6)" }}>
            Harga dan stok diatur per variasi di step berikutnya.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Harga <span style={{ color: "#f87171" }}>*</span>
        </label>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-medium"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Rp
          </span>
          <input
            type="number"
            min={0}
            value={state.price || ""}
            onChange={e => update({ price: Number(e.target.value) })}
            placeholder="0"
            style={{ ...inputStyle, paddingLeft: "36px" }}
          />
        </div>
        {state.price > 0 && (
          <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            Rp {Math.round(state.price).toLocaleString("id-ID")}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Stok <span style={{ color: "#f87171" }}>*</span>
        </label>
        <input
          type="number"
          min={1}
          value={state.stock || ""}
          onChange={e => update({ stock: Number(e.target.value) })}
          placeholder="1"
          style={inputStyle}
        />
      </div>
    </div>
  )
}
