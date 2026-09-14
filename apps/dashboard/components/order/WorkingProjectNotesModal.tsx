"use client"

import { useEffect, useState } from "react"
import {
  useUpdateWorkingProject,
  useChecklistOp,
  type WorkingProject,
  type WorkingProjectChecklistItem,
} from "@/lib/hooks/use-working-projects"

interface Props {
  project: WorkingProject | null
  onClose: () => void
}

function parseTagsInput(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function WorkingProjectNotesModal({ project, onClose }: Props) {
  const updateMutation = useUpdateWorkingProject()
  const checklistOp = useChecklistOp()

  const [trackedId, setTrackedId] = useState<string | null>(project?.id ?? null)
  const [notes, setNotes] = useState(project?.notes ?? "")
  const [tagsInput, setTagsInput] = useState((project?.appliedTags ?? []).join(", "))
  const [picInput, setPicInput] = useState((project?.mentions ?? []).join(", "))
  const [newItemText, setNewItemText] = useState("")
  const [dragId, setDragId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Body scroll lock while open — the underlying page can be very long
  // (100+ rows), and letting it scroll behind the modal is what made the
  // earlier modal look "lost"/mispositioned: the modal itself never moved
  // (it's `fixed`), but the page scrolling behind a near-transparent
  // backdrop made it look like it had.
  useEffect(() => {
    if (!project) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [project])

  if (project && project.id !== trackedId) {
    setTrackedId(project.id)
    setNotes(project.notes ?? "")
    setTagsInput((project.appliedTags ?? []).join(", "))
    setPicInput((project.mentions ?? []).join(", "))
    setNewItemText("")
    setError(null)
  }

  if (!project) return null

  const checklist = (project.checklist ?? []).filter((i) => !i.deleted)

  function saveNotes() {
    setError(null)
    updateMutation.mutate(
      { id: project!.id, patch: { notes } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan notes") },
    )
  }

  function saveTags() {
    setError(null)
    updateMutation.mutate(
      { id: project!.id, patch: { appliedTags: parseTagsInput(tagsInput) } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan tag") },
    )
  }

  function savePic() {
    setError(null)
    updateMutation.mutate(
      { id: project!.id, patch: { mentions: parseTagsInput(picInput) } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan PIC") },
    )
  }

  function toggleItem(item: WorkingProjectChecklistItem) {
    setError(null)
    checklistOp.mutate(
      { id: project!.id, op: { type: item.done ? "uncheck" : "check", id: item.id, by: "dashboard" } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal update checklist") },
    )
  }

  function editItemText(item: WorkingProjectChecklistItem, text: string) {
    checklistOp.mutate(
      { id: project!.id, op: { type: "edit", id: item.id, text } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal update checklist") },
    )
  }

  function removeItem(item: WorkingProjectChecklistItem) {
    setError(null)
    checklistOp.mutate(
      { id: project!.id, op: { type: "remove", id: item.id, by: "dashboard" } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal hapus checklist") },
    )
  }

  function addItem() {
    if (!newItemText.trim()) return
    setError(null)
    checklistOp.mutate(
      { id: project!.id, op: { type: "add", text: newItemText.trim(), addedBy: "dashboard" } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal tambah checklist") },
    )
    setNewItemText("")
  }

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return
    const ids = checklist.map((i) => i.id)
    const fromIdx = ids.indexOf(dragId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...ids]
    reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, dragId)
    setDragId(null)
    checklistOp.mutate(
      { id: project!.id, op: { type: "reorder", orderedIds: reordered } },
      { onError: (err) => setError(err instanceof Error ? err.message : "Gagal urutkan checklist") },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Notes dan Checklist"
    >
      <div
        className="w-full max-w-md rounded-[5px] p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--g-modal)", border: "1px solid var(--g-card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold g-t1">Notes &amp; Checklist — {project.customer}</span>
          <button onClick={onClose} className="g-t4 text-lg leading-none" aria-label="Tutup">
            ✕
          </button>
        </div>

        {error ? (
          <p role="alert" className="mb-3 text-xs text-red-500">
            {error}
          </p>
        ) : null}

        <div className="mb-4">
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent block">Tag</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="mis. Cincin, Urgent"
              className="glass-input flex-1 h-9 rounded-[5px] px-3 text-sm"
            />
            <button onClick={saveTags} disabled={updateMutation.isPending} className="h-9 px-3 rounded-[5px] text-xs g-btn-ghost">
              Simpan
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent block">
            PIC (Discord user ID, pisah koma)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={picInput}
              onChange={(e) => setPicInput(e.target.value)}
              placeholder="mis. 123456789012345678"
              className="glass-input flex-1 h-9 rounded-[5px] px-3 text-sm"
            />
            <button onClick={savePic} disabled={updateMutation.isPending} className="h-9 px-3 rounded-[5px] text-xs g-btn-ghost">
              Simpan
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="glass-input w-full rounded-[5px] px-3 py-2 text-sm resize-y"
          />
          <div className="flex gap-2 mt-1">
            <button onClick={saveNotes} disabled={updateMutation.isPending} className="h-8 px-3 rounded-[5px] text-xs g-btn-ghost">
              {updateMutation.isPending ? "Menyimpan..." : "Simpan Notes"}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 g-accent block">Checklist</label>
          {checklist.length === 0 ? (
            <p className="text-xs g-t4 italic mb-2">Belum ada checklist item.</p>
          ) : (
            <div className="flex flex-col gap-1 mb-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(item.id)}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-[5px] hover:bg-white/5"
                >
                  <span className="cursor-grab select-none g-t4" aria-label="Urutkan" title="Seret untuk urutkan">
                    ⠿
                  </span>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleItem(item)}
                    aria-label={item.text}
                  />
                  <input
                    type="text"
                    defaultValue={item.text}
                    onBlur={(e) => {
                      if (e.target.value !== item.text) editItemText(item, e.target.value)
                    }}
                    className={`flex-1 bg-transparent text-sm border-none focus:outline-none focus:border-b ${item.done ? "line-through g-t4" : "g-t1"}`}
                  />
                  <button
                    onClick={() => removeItem(item)}
                    className="g-t4 hover:text-red-400 text-sm"
                    aria-label={`Hapus ${item.text}`}
                    title="Hapus"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem()
              }}
              placeholder="+ Tambah item checklist..."
              className="glass-input flex-1 h-9 rounded-[5px] px-3 text-sm"
            />
            <button onClick={addItem} className="h-9 px-3 rounded-[5px] text-xs g-btn-ghost">
              Tambah
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
