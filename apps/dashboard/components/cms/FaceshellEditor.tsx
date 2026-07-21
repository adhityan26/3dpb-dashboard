"use client"

import { useState } from "react"
import { useFaceshell, usePatchFaceshell } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import { ImageUpload } from "./shared/ImageUpload"
import { ImageZoomModal } from "./shared/ImageZoomModal"
import type { LocalizedValue, FaceshellSettings } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

type Item = FaceshellSettings["items"][number]
const EMPTY_ITEM: Omit<Item, "_key"> = { imageUrl: null, imageRef: null, alt: "", title: EMPTY_LOC, caption: EMPTY_LOC }

export function FaceshellEditor() {
  const { data, isLoading } = useFaceshell()
  const patch = usePatchFaceshell()
  const [form, setForm] = useState<typeof data | null>(null)
  const [saved, setSaved] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | "new" | null>(null)
  const [itemForm, setItemForm] = useState<Omit<Item, "_key">>(EMPTY_ITEM)
  const [zoomSrc, setZoomSrc] = useState<{ src: string; alt: string } | null>(null)

  if (data && !form) setForm(data)
  if (isLoading || !form) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const items: Item[] = form.items ?? []
  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-indigo-500/60"

  function openEdit(i: number) {
    setItemForm({ imageUrl: items[i].imageUrl, imageRef: items[i].imageRef, alt: items[i].alt, title: items[i].title, caption: items[i].caption })
    setExpandedIdx(i)
  }
  function openAdd() { setItemForm(EMPTY_ITEM); setExpandedIdx("new") }
  function closeExpanded() { setExpandedIdx(null) }

  function commitItem() {
    if (!itemForm.imageRef) return
    if (expandedIdx === "new") {
      setForm((f) => f ? { ...f, items: [...items, { _key: "", ...itemForm }] } : f)
    } else if (typeof expandedIdx === "number") {
      setForm((f) => f ? { ...f, items: items.map((it, i) => i === expandedIdx ? { ...it, ...itemForm } : it) } : f)
    }
    closeExpanded()
  }

  function removeItem(i: number) {
    if (expandedIdx === i) closeExpanded()
    setForm((f) => f ? { ...f, items: items.filter((_, idx) => idx !== i) } : f)
  }

  async function handleSave() {
    if (!form) return
    await patch.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inlineFormContent = (
    <div className="px-3 pb-3 pt-2 space-y-3 border-t border-white/6">
      <ImageUpload
        currentUrl={itemForm.imageUrl}
        label="Gambar *"
        onUpload={({ assetRef, url }) => setItemForm((f) => ({ ...f, imageRef: assetRef, imageUrl: url }))}
      />
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Alt Text</label>
        <input className={inputClass} value={itemForm.alt} onChange={(e) => setItemForm((f) => ({ ...f, alt: e.target.value }))} placeholder="Deskripsi singkat gambar" />
      </div>
      <LocalizedField label="Judul" value={itemForm.title} onChange={(v) => setItemForm((f) => ({ ...f, title: v }))} />
      <LocalizedField label="Caption" value={itemForm.caption} onChange={(v) => setItemForm((f) => ({ ...f, caption: v }))} multiline />
      <div className="flex gap-2">
        <button onClick={commitItem} disabled={!itemForm.imageRef} className="px-3 py-1.5 rounded-[6px] text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
          {expandedIdx === "new" ? "Tambah ke List" : "Simpan Perubahan"}
        </button>
        <button onClick={closeExpanded} className="px-3 py-1.5 rounded-[6px] text-[12px] text-white/50 hover:text-white/80">Batal</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">
      {zoomSrc && <ImageZoomModal src={zoomSrc.src} alt={zoomSrc.alt} onClose={() => setZoomSrc(null)} />}
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

      {/* Collection Items */}
      <div className="space-y-2 pt-2 border-t border-white/6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>
            Collection Items ({items.length})
          </h3>
          <button onClick={openAdd} className="px-3 py-1 rounded-[6px] text-[11px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
            + Tambah
          </button>
        </div>

        {/* Existing items */}
        {items.map((item, i) => (
          <div key={i} className="rounded-[8px] border border-white/8 overflow-hidden" style={{ background: expandedIdx === i ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.02)", borderColor: expandedIdx === i ? "rgba(99,102,241,0.25)" : undefined }}>
            <div className="flex items-center gap-3 p-2">
              {item.imageUrl
                ? <img src={`${item.imageUrl}?w=64&h=64&fit=crop`} alt={item.alt} onClick={() => setZoomSrc({ src: item.imageUrl!, alt: item.alt })} className="w-10 h-10 rounded-[6px] object-cover flex-shrink-0 cursor-zoom-in" />
                : <div className="w-10 h-10 rounded-[6px] bg-white/5 flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-white/80 truncate">{item.title?.id || item.title?.en || "(no title)"}</div>
                {item.alt && <div className="text-[10px] text-white/30 truncate">{item.alt}</div>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => expandedIdx === i ? closeExpanded() : openEdit(i)}
                  className="text-[11px] px-2 py-1 rounded-[5px]"
                  style={{ background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.9)" }}
                >
                  {expandedIdx === i ? "Tutup" : "Edit"}
                </button>
                <button onClick={() => removeItem(i)} className="text-[11px] px-2 py-1 rounded-[5px]" style={{ background: "rgba(239,68,68,0.12)", color: "rgba(252,165,165,0.8)" }}>Hapus</button>
              </div>
            </div>
            {expandedIdx === i && inlineFormContent}
          </div>
        ))}

        {/* New item form */}
        {expandedIdx === "new" && (
          <div className="rounded-[8px] border overflow-hidden" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.25)" }}>
            <div className="px-3 pt-3 pb-1">
              <span className="text-[12px] font-semibold text-white/60">Item Baru</span>
            </div>
            {inlineFormContent}
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
