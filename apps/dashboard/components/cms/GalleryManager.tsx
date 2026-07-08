"use client"

import { useState } from "react"
import { useGallery, useGalleryMutations } from "@/lib/hooks/use-cms"
import { SortableList } from "./shared/SortableList"
import { LocalizedField } from "./shared/LocalizedField"
import { ImageUpload } from "./shared/ImageUpload"
import type { GalleryItem, LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }
const EMPTY_FORM: { title: LocalizedValue; imageUrl: string | null; imageRef: string | null; alt: string; category: GalleryItem["category"]; caption: LocalizedValue; order: number } = { title: EMPTY_LOC, imageUrl: null, imageRef: null, alt: "", category: "custom", caption: EMPTY_LOC, order: 0 }

export function GalleryManager() {
  const { data: items = [], isLoading } = useGallery()
  const { create, update, remove, reorder } = useGalleryMutations()
  const [editing, setEditing] = useState<GalleryItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  function openCreate() { setForm(EMPTY_FORM); setCreating(true); setEditing(null) }
  function openEdit(item: GalleryItem) {
    setForm({ title: item.title, imageUrl: item.imageUrl, imageRef: item.imageRef, alt: item.alt, category: item.category, caption: item.caption, order: item.order })
    setEditing(item)
    setCreating(false)
  }
  function closeForm() { setCreating(false); setEditing(null) }

  async function handleSave() {
    if (creating) {
      await create.mutateAsync({ ...form, _id: "" } as Omit<GalleryItem, "_id">)
    } else if (editing) {
      await update.mutateAsync({ id: editing._id, ...form })
    }
    closeForm()
  }

  function handleReorder(newItems: GalleryItem[]) {
    const ordered = newItems.map((item, i) => ({ ...item, order: i * 10 }))
    reorder.mutate(ordered.map((i) => ({ id: i._id, order: i.order })))
  }

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const CATEGORIES = ["custom", "cosplay", "print-service", "showcase"] as const

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-white">🖼️ Galeri</h2>
          <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{items.length} item — drag untuk reorder</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
          + Tambah
        </button>
      </div>

      {(creating || editing) && (
        <div className="p-4 rounded-[12px] border space-y-4" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
          <h3 className="text-[13px] font-semibold text-white">{creating ? "Tambah Item Galeri" : "Edit Item Galeri"}</h3>
          <ImageUpload currentUrl={form.imageUrl} label="Gambar *" onUpload={({ assetRef, url }) => setForm((f) => ({ ...f, imageRef: assetRef, imageUrl: url }))} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Alt Text</label>
            <input className="w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none" value={form.alt} onChange={(e) => setForm((f) => ({ ...f, alt: e.target.value }))} />
          </div>
          <LocalizedField label="Judul" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Kategori *</label>
            <select className="w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none" style={{ background: "rgba(10,10,30,0.8)" }} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof form.category }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <LocalizedField label="Caption" value={form.caption} onChange={(v) => setForm((f) => ({ ...f, caption: v }))} multiline />
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={create.isPending || update.isPending} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
              {create.isPending || update.isPending ? "Menyimpan..." : "Simpan"}
            </button>
            <button onClick={closeForm} className="px-4 py-2 rounded-[8px] text-[12px] text-white/50 hover:text-white/80">Batal</button>
          </div>
        </div>
      )}

      <SortableList
        items={items}
        onReorder={handleReorder}
        headers={[{ label: "Gambar", width: "60px" }, { label: "Judul / Kategori" }, { label: "Aksi", width: "120px" }]}
        actionHeader
        renderRow={(item) => (
          <>
            <td className="px-3 py-2 w-[60px]">
              {item.imageUrl && <img src={`${item.imageUrl}?w=48&h=48&fit=crop`} alt={item.alt} className="w-10 h-10 rounded-[6px] object-cover" />}
            </td>
            <td className="px-3 py-2">
              <div className="text-[12px] text-white/80">{item.title.id || item.title.en || "(no title)"}</div>
              <div className="text-[10px] text-white/35">{item.category}</div>
            </td>
            <td className="px-3 py-2">
              <div className="flex gap-2 justify-end">
                <button onClick={() => openEdit(item)} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.9)" }}>Edit</button>
                <button onClick={() => remove.mutate(item._id)} disabled={remove.isPending} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(239,68,68,0.12)", color: "rgba(252,165,165,0.8)" }}>Hapus</button>
              </div>
            </td>
          </>
        )}
      />
    </div>
  )
}
