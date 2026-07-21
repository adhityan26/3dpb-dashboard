"use client"

import { useState, useEffect } from "react"
import { useGenerator, usePatchGenerator } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import { ImageUpload } from "./shared/ImageUpload"
import { ImageZoomModal } from "./shared/ImageZoomModal"
import type { LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

type Screenshot = { imageUrl: string | null; imageRef: string | null; alt: string }
const EMPTY_SS: Screenshot = { imageUrl: null, imageRef: null, alt: "" }

export function GeneratorEditor() {
  const { data, isLoading } = useGenerator()
  const patch = usePatchGenerator()
  const [form, setForm] = useState<typeof data | null>(null)
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newSS, setNewSS] = useState<Screenshot>(EMPTY_SS)
  const [zoomSrc, setZoomSrc] = useState<{ src: string; alt: string } | null>(null)

  useEffect(() => { if (data && !form) setForm(data) }, [data, form])
  if (isLoading || !form) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-indigo-500/60"
  const screenshots: Screenshot[] = (form.devScreenshots ?? []) as Screenshot[]

  function addScreenshot() {
    if (!newSS.imageRef) return
    setForm((f) => f ? { ...f, devScreenshots: [...screenshots, newSS] as typeof f.devScreenshots } : f)
    setNewSS(EMPTY_SS)
    setAdding(false)
  }

  function removeScreenshot(i: number) {
    setForm((f) => f ? { ...f, devScreenshots: screenshots.filter((_, idx) => idx !== i) as typeof f.devScreenshots } : f)
  }

  async function handleSave() {
    if (!form) return
    await patch.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {zoomSrc && <ImageZoomModal src={zoomSrc.src} alt={zoomSrc.alt} onClose={() => setZoomSrc(null)} />}
      <div>
        <h2 className="text-[15px] font-bold text-white">🎨 Generator</h2>
        <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Silhouette Generator section content</p>
      </div>

      <LocalizedField label="Headline" value={form.headline ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, headline: v } : f)} />
      <LocalizedField label="Description" value={form.description ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, description: v } : f)} multiline />

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Launch Status</label>
        <select className={inputClass} value={form.launchStatus ?? "coming-soon"} onChange={(e) => setForm((f) => f ? { ...f, launchStatus: e.target.value as "coming-soon" | "beta" | "live" } : f)} style={{ background: "rgba(255,255,255,0.04)" }}>
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

      {/* Dev Screenshots */}
      <div className="space-y-3 pt-2 border-t border-white/6">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>
            Dev Screenshots ({screenshots.length})
          </h3>
          {!adding && (
            <button onClick={() => setAdding(true)} className="px-3 py-1 rounded-[6px] text-[11px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
              + Tambah
            </button>
          )}
        </div>

        {screenshots.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {screenshots.map((ss, i) => (
              <div key={i} className="relative rounded-[8px] overflow-hidden border border-white/8 group" style={{ background: "rgba(255,255,255,0.03)" }}>
                {ss.imageUrl
                  ? <img src={`${ss.imageUrl}?w=200&h=140&fit=crop`} alt={ss.alt} onClick={() => setZoomSrc({ src: ss.imageUrl!, alt: ss.alt })} className="w-full h-[100px] object-cover cursor-zoom-in" />
                  : <div className="w-full h-[100px] bg-white/5 flex items-center justify-center text-white/20 text-[11px]">No image</div>
                }
                <div className="px-2 py-1.5">
                  <input
                    className="w-full bg-transparent text-[11px] text-white/60 focus:outline-none focus:text-white/90"
                    placeholder="Alt text"
                    value={ss.alt}
                    onChange={(e) => {
                      const updated = screenshots.map((s, idx) => idx === i ? { ...s, alt: e.target.value } : s)
                      setForm((f) => f ? { ...f, devScreenshots: updated as typeof f.devScreenshots } : f)
                    }}
                  />
                </div>
                <button
                  onClick={() => removeScreenshot(i)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(239,68,68,0.8)" }}
                >
                  <span className="text-white text-[11px] leading-none">✕</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {adding && (
          <div className="p-4 rounded-[10px] border space-y-3" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
            <ImageUpload
              currentUrl={newSS.imageUrl}
              label="Screenshot *"
              onUpload={({ assetRef, url }) => setNewSS((s) => ({ ...s, imageRef: assetRef, imageUrl: url }))}
            />
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Alt Text</label>
              <input className={inputClass} value={newSS.alt} onChange={(e) => setNewSS((s) => ({ ...s, alt: e.target.value }))} placeholder="Deskripsi singkat gambar" />
            </div>
            <div className="flex gap-2">
              <button onClick={addScreenshot} disabled={!newSS.imageRef} className="px-3 py-1.5 rounded-[6px] text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
                Tambah ke List
              </button>
              <button onClick={() => { setAdding(false); setNewSS(EMPTY_SS) }} className="px-3 py-1.5 rounded-[6px] text-[12px] text-white/50 hover:text-white/80">Batal</button>
            </div>
          </div>
        )}
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
