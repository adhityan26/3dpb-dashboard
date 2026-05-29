"use client"

import { useState, useEffect } from "react"
import { useKalkulatorRates, useUpdateRates, useFilamentHarga, useUpsertFilamentHarga, useDeleteFilamentHarga, useRecomputeFilamentHarga } from "@/lib/hooks/use-kalkulator"
import type { FilamentHargaData } from "@/lib/kalkulator/types"

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

  const { data: filamentHargaList } = useFilamentHarga()
  const upsertFilamentHarga = useUpsertFilamentHarga()
  const deleteFilamentHarga = useDeleteFilamentHarga()
  const recompute = useRecomputeFilamentHarga()
  const [fhBrand, setFhBrand] = useState('')
  const [fhMaterial, setFhMaterial] = useState('')
  const [fhHarga, setFhHarga] = useState('')
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)

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
      "kalk.failureRate.pct":   String(rates.failureRatePct),
      "kalk.failureSpread.pct": String(rates.failureSpreadPct),
      "kalk.testLayer.pct":     String(rates.testLayerPct),
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

  if (isLoading) return (
    <div className="text-sm text-center py-8 g-t4">Memuat rates...</div>
  )

  return (
    <div className="rounded-[16px] p-5 space-y-5 g-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold g-t1">⚙️ Parameter Kalkulator Harga</div>
          <div className="text-xs mt-0.5 g-t4">
            Biaya produksi &amp; aksesori yang digunakan dalam kalkulasi HPP
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
        <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">
          Biaya Produksi
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MAIN_RATES.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium mb-1 g-label">{f.label}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={values[f.key] ?? ""}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  className="glass-input flex-1 h-9 rounded-[8px] px-3 text-sm"
                />
                <span className="text-xs flex-shrink-0 g-t4">{f.suffix}</span>
              </div>
              {f.description && (
                <div className="text-[10px] mt-0.5 g-t5">{f.description}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Packing rates */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">
          Harga Packing Box
        </div>
        <div className="grid grid-cols-4 gap-2">
          {PACKING_SIZES.map(s => (
            <div key={s}>
              <label className="block text-xs font-medium mb-1 g-label">Box {s}</label>
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
        <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">
          Harga Gantungan
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GANTUNGAN_TYPES.map(g => (
            <div key={g}>
              <label className="block text-xs font-medium mb-1 g-label">{g.replace(/_/g, " ")}</label>
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

      {/* Failure Rate & Risk params */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">
          Failure Rate &amp; Risiko
        </div>
        <div className="space-y-4">
          {/* Failure Rate */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium g-label">Failure Rate</label>
              <span className="text-xs font-mono g-t1">{values["kalk.failureRate.pct"] ?? "12"}%</span>
            </div>
            <input
              type="range" min="0" max="50" step="1"
              value={values["kalk.failureRate.pct"] ?? "12"}
              onChange={e => setValues(v => ({ ...v, "kalk.failureRate.pct": e.target.value }))}
              className="w-full accent-indigo-500"
            />
            <div className="text-[10px] mt-0.5 g-t5">Persentase kemungkinan print gagal (default 12%)</div>
          </div>

          {/* Failure Spread */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium g-label">Failure Spread — siapa yang menanggung?</label>
              <span className="text-xs font-mono g-t1">
                {values["kalk.failureSpread.pct"] ?? "50"}% customer
              </span>
            </div>
            <input
              type="range" min="0" max="100" step="5"
              value={values["kalk.failureSpread.pct"] ?? "50"}
              onChange={e => setValues(v => ({ ...v, "kalk.failureSpread.pct": e.target.value }))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] g-t5">
              <span>0% = owner menanggung semua</span>
              <span>100% = customer menanggung semua</span>
            </div>
          </div>

          {/* Test Layer */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium g-label">Test Layer / Prototype</label>
              <span className="text-xs font-mono g-t1">{values["kalk.testLayer.pct"] ?? "5"}% gramasi</span>
            </div>
            <input
              type="range" min="0" max="20" step="1"
              value={values["kalk.testLayer.pct"] ?? "5"}
              onChange={e => setValues(v => ({ ...v, "kalk.testLayer.pct": e.target.value }))}
              className="w-full accent-indigo-500"
            />
            <div className="text-[10px] mt-0.5 g-t5">Biaya cetak prototype/test layer masuk HPP owner (default 5%)</div>
          </div>
        </div>
      </div>

      {/* ── FilamentHarga Catalog ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold g-t2">🧵 Harga Filamen per Gram</div>
          <button
            onClick={async () => {
              setRecomputeMsg(null)
              const res = await recompute.mutateAsync()
              setRecomputeMsg(`✓ ${res.updated} rate diperbarui dari spool`)
              setTimeout(() => setRecomputeMsg(null), 4000)
            }}
            disabled={recompute.isPending}
            className="text-xs px-2.5 py-1 rounded-md transition-colors"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}
          >
            {recompute.isPending ? "Menghitung..." : "🔄 Hitung ulang dari PO"}
          </button>
        </div>
        {recomputeMsg && <div className="text-xs text-green-400">{recomputeMsg}</div>}
        <p className="text-xs g-t4">
          Rate ini dipakai di kalkulator HPP per plate. Auto-update saat PO diterima (moving average dari harga beli spool).
        </p>

        {/* Table */}
        <div className="space-y-1">
          {(filamentHargaList ?? []).map((f: FilamentHargaData) => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
                 style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
              <span className="text-xs g-t2 flex-1">{f.brand} · {f.material}</span>
              <span className="text-xs font-mono g-t1">Rp {f.hargaPerGram}/g</span>
              {f.spoolCount > 0 ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                  ⚡ {f.spoolCount} spool
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full g-t5"
                      style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
                  ✏️ manual
                </span>
              )}
              <button
                onClick={() => deleteFilamentHarga.mutate(f.id)}
                className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1"
              >✕</button>
            </div>
          ))}
          {(filamentHargaList ?? []).length === 0 && (
            <div className="text-xs g-t5 text-center py-2">Belum ada data. Receive PO atau tambah manual.</div>
          )}
        </div>

        {/* Form tambah manual */}
        <div className="flex gap-2 flex-wrap items-end pt-1">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] g-t4 uppercase tracking-wide">Brand</label>
            <input value={fhBrand} onChange={e => setFhBrand(e.target.value)}
              placeholder="eSUN" className="glass-input text-xs px-2 py-1.5 rounded-md w-24" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] g-t4 uppercase tracking-wide">Material</label>
            <input value={fhMaterial} onChange={e => setFhMaterial(e.target.value)}
              placeholder="PLA+" className="glass-input text-xs px-2 py-1.5 rounded-md w-24" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] g-t4 uppercase tracking-wide">Rp/gram</label>
            <input type="number" value={fhHarga} onChange={e => setFhHarga(e.target.value)}
              placeholder="280" className="glass-input text-xs px-2 py-1.5 rounded-md w-20" />
          </div>
          <button
            onClick={async () => {
              if (!fhBrand.trim() || !fhMaterial.trim() || !fhHarga) return
              await upsertFilamentHarga.mutateAsync({ brand: fhBrand.trim(), material: fhMaterial.trim(), hargaPerGram: parseFloat(fhHarga) })
              setFhBrand(''); setFhMaterial(''); setFhHarga('')
            }}
            disabled={upsertFilamentHarga.isPending || !fhBrand || !fhMaterial || !fhHarga}
            className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
          >
            + Tambah
          </button>
        </div>
      </div>
    </div>
  )
}
