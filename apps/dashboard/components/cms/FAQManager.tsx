"use client"

import { useState } from "react"
import { useFaq, useFaqMutations } from "@/lib/hooks/use-cms"
import { SortableList } from "./shared/SortableList"
import { LocalizedField } from "./shared/LocalizedField"
import type { FaqItem, LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }
const ALL_TAGS = ["general", "faceshell", "generator", "shipping"] as const
const EMPTY_FORM = { question: EMPTY_LOC, answer: EMPTY_LOC, tags: [] as string[], order: 0 }

export function FAQManager() {
  const { data: items = [], isLoading } = useFaq()
  const { create, update, remove, reorder } = useFaqMutations()
  const [editing, setEditing] = useState<FaqItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  function openCreate() { setForm(EMPTY_FORM); setCreating(true); setEditing(null) }
  function openEdit(item: FaqItem) {
    setForm({ question: item.question, answer: item.answer, tags: item.tags, order: item.order })
    setEditing(item); setCreating(false)
  }
  function closeForm() { setCreating(false); setEditing(null) }

  async function handleSave() {
    if (creating) await create.mutateAsync({ ...form, _id: "" } as Omit<FaqItem, "_id">)
    else if (editing) await update.mutateAsync({ id: editing._id, ...form })
    closeForm()
  }

  function toggleTag(tag: string) {
    setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }))
  }

  function handleReorder(newItems: FaqItem[]) {
    reorder.mutate(newItems.map((item, i) => ({ id: item._id, order: i * 10 })))
  }

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-white">❓ FAQ</h2>
          <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{items.length} pertanyaan</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>+ Tambah</button>
      </div>

      {(creating || editing) && (
        <div className="p-4 rounded-[12px] border space-y-4" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
          <h3 className="text-[13px] font-semibold text-white">{creating ? "Tambah FAQ" : "Edit FAQ"}</h3>
          <LocalizedField label="Pertanyaan *" value={form.question} onChange={(v) => setForm((f) => ({ ...f, question: v }))} required />
          <LocalizedField label="Jawaban *" value={form.answer} onChange={(v) => setForm((f) => ({ ...f, answer: v }))} multiline required />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(165,180,252,0.6)" }}>Tags</label>
            <div className="flex gap-2 flex-wrap">
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
        headers={[{ label: "Pertanyaan" }, { label: "Tags" }, { label: "Aksi", width: "120px" }]}
        actionHeader
        renderRow={(item) => (
          <>
            <td className="px-3 py-2 text-[12px] text-white/80">{item.question.id || item.question.en}</td>
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
