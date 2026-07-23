"use client"

import type { LocalizedValue } from "@/lib/sanity/types"

interface LocalizedFieldProps {
  label: string
  value: LocalizedValue
  onChange: (val: LocalizedValue) => void
  multiline?: boolean
  required?: boolean
}

export function LocalizedField({ label, value, onChange, multiline = false, required = false }: LocalizedFieldProps) {
  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[5px] px-3 py-2 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-indigo-500/60 resize-none"

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex gap-3">
        {(["id", "en"] as const).map((locale) => (
          <div key={locale} className="flex-1 space-y-1">
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              {locale === "id" ? "🇮🇩 Indonesia" : "🇬🇧 English"}
            </div>
            {multiline ? (
              <textarea
                rows={3}
                className={inputClass}
                value={value[locale]}
                onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
              />
            ) : (
              <input
                type="text"
                className={inputClass}
                value={value[locale]}
                onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
