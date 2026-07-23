"use client"

import type { ShopeeCategoryAttribute } from "@/lib/shopee/types"

export interface AttributeValue {
  value_id?: number
  value_text?: string
}

interface Props {
  attributes: ShopeeCategoryAttribute[]
  values: Record<number, AttributeValue>   // key = attribute_id
  onChange: (attributeId: number, value: AttributeValue) => void
}

export function AttributeFields({ attributes, values, onChange }: Props) {
  if (attributes.length === 0) return null

  return (
    <div className="space-y-3">
      {attributes.map(attr => {
        const current = values[attr.attribute_id]
        const inputStyle = {
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "8px",
          color: "rgba(255,255,255,0.8)",
          fontSize: "13px",
          padding: "7px 10px",
          width: "100%",
          outline: "none",
        } as const

        return (
          <div key={attr.attribute_id}>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              {attr.attribute_name}
              {attr.is_mandatory && <span className="ml-0.5" style={{ color: "#f87171" }}>*</span>}
            </label>

            {attr.input_type === "TEXT_FIELD" && (
              <input
                type="text"
                value={current?.value_text ?? ""}
                onChange={e => onChange(attr.attribute_id, { value_text: e.target.value })}
                placeholder={attr.attribute_name}
                style={inputStyle}
              />
            )}

            {(attr.input_type === "DROP_DOWN" || attr.input_type === "COMBO_BOX") && (
              <select
                value={current?.value_id ?? ""}
                onChange={e => {
                  const opt = attr.attribute_value_list.find(v => v.value_id === Number(e.target.value))
                  if (opt) onChange(attr.attribute_id, { value_id: opt.value_id, value_text: opt.original_value_name })
                  else onChange(attr.attribute_id, {})
                }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">— Pilih —</option>
                {attr.attribute_value_list.map(opt => (
                  <option key={opt.value_id} value={opt.value_id}>
                    {opt.original_value_name}
                  </option>
                ))}
              </select>
            )}

            {attr.input_type === "MULTIPLE_SELECT" && (
              <div
                className="rounded-[5px] max-h-32 overflow-y-auto"
                style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
              >
                {attr.attribute_value_list.map(opt => {
                  const isChecked = current?.value_id === opt.value_id
                  return (
                    <label
                      key={opt.value_id}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            onChange(attr.attribute_id, { value_id: opt.value_id, value_text: opt.original_value_name })
                          } else {
                            onChange(attr.attribute_id, {})
                          }
                        }}
                        className="w-3.5 h-3.5 accent-indigo-500"
                      />
                      <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                        {opt.original_value_name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
