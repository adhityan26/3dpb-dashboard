"use client"

import { useState, useEffect } from "react"
import { useGenerator, usePatchGenerator } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import type { LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

export function GeneratorEditor() {
  const { data, isLoading } = useGenerator()
  const patch = usePatchGenerator()
  const [form, setForm] = useState<typeof data | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (data && !form) setForm(data) }, [data, form])
  if (isLoading || !form) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  async function handleSave() {
    if (!form) return
    await patch.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-indigo-500/60"

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-[15px] font-bold text-white">🎨 Generator</h2>
        <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Silhouette Generator section content</p>
      </div>
      <LocalizedField label="Headline" value={form.headline ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, headline: v } : f)} />
      <LocalizedField label="Description" value={form.description ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, description: v } : f)} multiline />
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Launch Status</label>
        <select
          className={inputClass}
          value={form.launchStatus ?? "coming-soon"}
          onChange={(e) => setForm((f) => f ? { ...f, launchStatus: e.target.value as "coming-soon" | "beta" | "live" } : f)}
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <option value="coming-soon">Coming Soon</option>
          <option value="beta">Beta</option>
          <option value="live">Live</option>
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Estimated Launch</label>
        <input className={inputClass} value={form.estimatedLaunch ?? ""} placeholder="e.g. Q3 2026" onChange={(e) => setForm((f) => f ? { ...f, estimatedLaunch: e.target.value } : f)} />
      </div>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Order URL</label>
        <input className={inputClass} value={form.orderUrl ?? ""} placeholder="https://" onChange={(e) => setForm((f) => f ? { ...f, orderUrl: e.target.value } : f)} />
      </div>
      <LocalizedField label="Order Button Label" value={form.orderLabel ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, orderLabel: v } : f)} />
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={patch.isPending} className="px-5 py-2 rounded-[8px] text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
          {patch.isPending ? "Menyimpan..." : "Simpan"}
        </button>
        {saved && <span className="text-[12px]" style={{ color: "rgba(74,222,128,0.8)" }}>✓ Tersimpan</span>}
        {patch.isError && <span className="text-[12px] text-red-400">{patch.error?.message}</span>}
      </div>
    </div>
  )
}
