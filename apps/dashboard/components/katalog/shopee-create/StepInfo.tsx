"use client"

import { useShopeeAttributes } from "@/lib/hooks/use-shopee-create"
import { CategoryPicker } from "./CategoryPicker"
import { AttributeFields } from "./AttributeFields"
import type { WizardState } from "./ShopeeCreateWizard"
import type { AttributeValue } from "./AttributeFields"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

const labelStyle = { color: "rgba(255,255,255,0.5)" } as const
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

export function StepInfo({ state, update }: Props) {
  const { data: attributes = [], isLoading: attrsLoading } = useShopeeAttributes(state.categoryId)

  function handleAttributeChange(attributeId: number, value: AttributeValue) {
    update({
      attributeValues: { ...state.attributeValues, [attributeId]: value },
    })
  }

  return (
    <div className="space-y-4">
      {/* Nama produk */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Nama Produk <span style={{ color: "#f87171" }}>*</span>
        </label>
        <input
          type="text"
          value={state.itemName}
          onChange={e => update({ itemName: e.target.value })}
          maxLength={120}
          placeholder="Nama produk (maks 120 karakter)"
          style={inputStyle}
        />
        <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
          {state.itemName.length}/120
        </div>
      </div>

      {/* Kategori */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Kategori <span style={{ color: "#f87171" }}>*</span>
          {state.categoryId && (
            <span className="ml-2 text-[10px]" style={{ color: "#4ade80" }}>✓ dipilih</span>
          )}
        </label>
        <CategoryPicker
          selectedCategoryId={state.categoryId}
          onSelect={(categoryId, path) => update({ categoryId, categoryPath: path, attributeValues: {} })}
        />
        {state.categoryPath.length > 0 && (
          <div className="text-[10px] mt-1" style={{ color: "rgba(165,180,252,0.5)" }}>
            {state.categoryPath.map(p => p.name).join(" › ")}
          </div>
        )}
      </div>

      {/* Attributes (hanya muncul setelah kategori dipilih) */}
      {state.categoryId && (
        <div>
          <label className="block text-[11px] font-medium mb-2" style={labelStyle}>
            Atribut Kategori
          </label>
          {attrsLoading ? (
            <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat atribut...</div>
          ) : (
            <AttributeFields
              attributes={attributes}
              values={state.attributeValues}
              onChange={handleAttributeChange}
            />
          )}
        </div>
      )}

      {/* Kondisi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Kondisi <span style={{ color: "#f87171" }}>*</span>
        </label>
        <div className="flex gap-2">
          {(["NEW", "USED"] as const).map(c => (
            <button
              key={c}
              onClick={() => update({ condition: c })}
              className="px-4 py-2 rounded-[5px] text-[12px] font-medium transition-all"
              style={{
                background: state.condition === c ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${state.condition === c ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
                color: state.condition === c ? "#a5b4fc" : "rgba(255,255,255,0.45)",
              }}
            >
              {c === "NEW" ? "Baru" : "Bekas"}
            </button>
          ))}
        </div>
      </div>

      {/* Deskripsi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Deskripsi <span style={{ color: "rgba(255,255,255,0.25)" }}>(opsional)</span>
        </label>
        <textarea
          value={state.description}
          onChange={e => update({ description: e.target.value })}
          rows={4}
          placeholder="Deskripsi produk..."
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>
    </div>
  )
}
