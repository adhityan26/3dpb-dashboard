"use client"

import { useState, useEffect } from "react"
import { useKalkulatorRates, useUpdateRates } from "@/lib/hooks/use-kalkulator"

interface RateField {
  key: string
  label: string
  suffix: string
  description?: string
}

const MAIN_RATES: RateField[] = [
  { key: "kalk.fdm.hppPerGram",  label: "FDM — HPP/gram",      suffix: "Rp/g",   description: "Biaya filament FDM per gram" },
  { key: "kalk.fdm.jualPerGram", label: "FDM — Jual/gram",     suffix: "Rp/g",   description: "Harga jual FDM per gram (untuk kalkulasi offline A)" },
  { key: "kalk.sla.hppPerGram",  label: "SLA — HPP/gram",      suffix: "Rp/g",   description: "Biaya resin SLA per gram" },
  { key: "kalk.sla.jualPerGram", label: "SLA — Jual/gram",     suffix: "Rp/g",   description: "Harga jual SLA per gram" },
  { key: "kalk.mesin.perJam",    label: "Mesin/jam",            suffix: "Rp/jam", description: "Biaya mesin + listrik + depresiasi per jam print" },
  { key: "kalk.adminEcommerce",  label: "Admin E-commerce",    suffix: "×",       description: "Faktor biaya marketplace (1.2 = 20% admin + fee)" },
  { key: "kalk.switch.perPcs",   label: "Switch/pcs",          suffix: "Rp",      description: "Harga clicker/switch per pcs" },
  { key: "kalk.label.perLembar", label: "Label/lembar",        suffix: "Rp",      description: "Harga stiker/label per lembar" },
]

const PACKING_SIZES = ["S", "M", "L", "XL"]
const GANTUNGAN_TYPES = ["kew_kew", "ring", "rantai", "tali"]

export function KalkulatorSettingsCard() {
  const { data: rates, isLoading } = useKalkulatorRates()
  const updateMut = useUpdateRates()

  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!rates) return
    setValues({
      "kalk.fdm.hppPerGram":  String(rates.fdmHppPerGram),
      "kalk.fdm.jualPerGram": String(rates.fdmJualPerGram),
      "kalk.sla.hppPerGram":  String(rates.slaHppPerGram),
      "kalk.sla.jualPerGram": String(rates.slaJualPerGram),
      "kalk.mesin.perJam":    String(rates.mesinPerJam),
      "kalk.adminEcommerce":  String(rates.adminEcommerce),
      "kalk.switch.perPcs":   String(rates.switchPerPcs),
      "kalk.label.perLembar": String(rates.labelPerLembar),
      ...Object.fromEntries(PACKING_SIZES.map(s => [`kalk.packing.${s}`, String(rates.packing[s] ?? "")])),
      ...Object.fromEntries(GANTUNGAN_TYPES.map(g => [`kalk.gantungan.${g}`, String(rates.gantungan[g] ?? "")])),
    })
  }, [rates])

  async function handleSave() {
    const updates = Object.entries(values)
      .filter(([, v]) => v.trim() !== "")
      .map(([key, value]) => ({ key, value: value.trim() }))
    await updateMut.mutateAsync(updates)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const fieldLabel = "block text-xs font-medium mb-1"
  const fieldColor = { color: "rgba(255,255,255,0.6)" }

  if (isLoading) return (
    <div className="text-sm text-center py-8" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat rates...</div>
  )

  return (
    <div className="rounded-[16px] p-5 space-y-5"
         style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>⚙️ Parameter Kalkulator Harga</div>
          <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            Biaya produksi & aksesori yang digunakan dalam kalkulasi HPP
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMut.isPending}
          className="h-8 px-4 rounded-[8px] text-xs font-semibold text-white"
          style={{ background: saved ? "rgba(52,211,153,0.3)" : "linear-gradient(135deg, #5055e8, #7c84f8)" }}
        >
          {updateMut.isPending ? "Menyimpan..." : saved ? "✓ Tersimpan" : "Simpan"}
        </button>
      </div>

      {/* Main rates */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(165,180,252,0.6)" }}>
          Biaya Produksi
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MAIN_RATES.map(f => (
            <div key={f.key}>
              <label className={fieldLabel} style={fieldColor}>{f.label}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={values[f.key] ?? ""}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  className="glass-input flex-1 h-9 rounded-[8px] px-3 text-sm"
                />
                <span className="text-xs flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>{f.suffix}</span>
              </div>
              {f.description && (
                <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>{f.description}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Packing rates */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(165,180,252,0.6)" }}>
          Harga Packing Box
        </div>
        <div className="grid grid-cols-4 gap-2">
          {PACKING_SIZES.map(s => (
            <div key={s}>
              <label className={fieldLabel} style={fieldColor}>Box {s}</label>
              <input
                type="number" min="0" step="100"
                value={values[`kalk.packing.${s}`] ?? ""}
                onChange={e => setValues(v => ({ ...v, [`kalk.packing.${s}`]: e.target.value }))}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Gantungan rates */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(165,180,252,0.6)" }}>
          Harga Gantungan
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GANTUNGAN_TYPES.map(g => (
            <div key={g}>
              <label className={fieldLabel} style={fieldColor}>{g.replace(/_/g, " ")}</label>
              <input
                type="number" min="0" step="50"
                value={values[`kalk.gantungan.${g}`] ?? ""}
                onChange={e => setValues(v => ({ ...v, [`kalk.gantungan.${g}`]: e.target.value }))}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
