"use client"

import { useState, useEffect } from "react"
import { useFaceshell, usePatchFaceshell } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import type { LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

export function FaceshellEditor() {
  const { data, isLoading } = useFaceshell()
  const patch = usePatchFaceshell()
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
        <h2 className="text-[15px] font-bold text-white">🕷️ Faceshell</h2>
        <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Faceshell Collection page content</p>
      </div>
      <LocalizedField label="Headline" value={form.headline ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, headline: v } : f)} />
      <LocalizedField label="Description" value={form.description ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, description: v } : f)} multiline />
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>External Measurement URL</label>
        <input className={inputClass} value={form.externalMeasurementUrl ?? ""} placeholder="https://" onChange={(e) => setForm((f) => f ? { ...f, externalMeasurementUrl: e.target.value } : f)} />
      </div>
      <LocalizedField label="External Measurement Button Label" value={form.externalMeasurementLabel ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, externalMeasurementLabel: v } : f)} />
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Pre-filled WhatsApp Order Message</label>
        <textarea rows={3} className={inputClass + " resize-none"} value={form.orderWhatsappMessage ?? ""} onChange={(e) => setForm((f) => f ? { ...f, orderWhatsappMessage: e.target.value } : f)} />
      </div>
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
