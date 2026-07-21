"use client"

import { useState } from "react"
import { useTestimonials, useTestimonialsMutations } from "@/lib/hooks/use-cms"
import { SortableList } from "./shared/SortableList"
import { ImageUpload } from "./shared/ImageUpload"
import type { Testimonial } from "@/lib/sanity/types"

const ALL_TAGS = ["general", "faceshell", "generator"] as const
const EMPTY_FORM = { name: "", text: "", imageUrl: null as string | null, imageRef: null as string | null, tags: [] as string[], order: 0 }

export function TestimonialsManager() {
  const { data: items = [], isLoading } = useTestimonials()
  const { create, update, remove, reorder } = useTestimonialsMutations()
  const [editing, setEditing] = useState<Testimonial | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  function openCreate() { setForm(EMPTY_FORM); setCreating(true); setEditing(null) }
  function openEdit(item: Testimonial) {
    setForm({ name: item.name, text: item.text, imageUrl: item.imageUrl, imageRef: item.imageRef, tags: item.tags, order: item.order })
    setEditing(item); setCreating(false)
  }
  function closeForm() { setCreating(false); setEditing(null) }

  async function handleSave() {
    if (creating) await create.mutateAsync({ ...form, _id: "" } as Omit<Testimonial, "_id">)
    else if (editing) await update.mutateAsync({ id: editing._id, ...form })
    closeForm()
  }

  function toggleTag(tag: string) {
    setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }))
  }

  function handleReorder(newItems: Testimonial[]) {
    reorder.mutate(newItems.map((item, i) => ({ id: item._id, order: i * 10 })))
  }

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none"

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-white">💬 Testimoni</h2>
          <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{items.length} testimoni</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>+ Tambah</button>
      </div>

      {(creating || editing) && (
        <div className="p-4 rounded-[12px] border space-y-4" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
          <h3 className="text-[13px] font-semibold text-white">{creating ? "Tambah Testimoni" : "Edit Testimoni"}</h3>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Nama *</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Teks *</label>
            <textarea rows={4} className={inputClass + " resize-none"} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
          </div>
          <ImageUpload currentUrl={form.imageUrl} label="Foto (opsional)" onUpload={({ assetRef, url }) => setForm((f) => ({ ...f, imageRef: assetRef, imageUrl: url }))} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(165,180,252,0.6)" }}>Tags</label>
            <div className="flex gap-2">
              {ALL_TAGS.map((tag) => (
                <button key={tag} onClick={() => toggleTag(tag)} className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                  style={{ background: form.tags.includes(tag) ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.05)", color: form.tags.includes(tag) ? "rgba(165,180,252,1)" : "rgba(255,255,255,0.4)", border: form.tags.includes(tag) ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent" }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
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
        headers={[{ label: "Nama" }, { label: "Teks" }, { label: "Tags" }, { label: "Aksi", width: "120px" }]}
        actionHeader
        renderRow={(item) => (
          <>
            <td className="px-3 py-2 text-[12px] text-white/80 w-[120px]">{item.name}</td>
            <td className="px-3 py-2 text-[12px] text-white/50 max-w-[200px] truncate">{item.text.slice(0, 60)}...</td>
            <td className="px-3 py-2"><div className="flex gap-1 flex-wrap">{item.tags.map((t) => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "rgba(165,180,252,0.8)" }}>{t}</span>)}</div></td>
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
