"use client"

import { useRef, useState } from "react"
import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"
import { ModelForm } from "./ModelForm"

export interface ModelManagerProps {
  models: RingModelWithParts[]
  loading: boolean
  onChanged: () => Promise<void>
  onEditAnchors?: (modelId: string, partId: string) => void
}

function fmtBytes(n: number): string {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`
}

function PartUpload({ modelId, onChanged }: { modelId: string; onChanged: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file || !name.trim()) return
    setBusy(true); setError(null)
    try {
      const form = new FormData()
      form.set("file", file)
      form.set("name", name.trim())
      const res = await fetch(`/api/ring-resizer/models/${modelId}/parts`, { method: "POST", body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setName(""); if (fileRef.current) fileRef.current.value = ""
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={upload} className="flex flex-wrap items-center gap-2 text-xs">
      <input ref={fileRef} type="file" accept=".stl" required className="text-xs g-t4" />
      <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="nama part (band/frame/…)"
        className="glass-input rounded-lg px-2 py-1.5 text-xs" />
      <button type="submit" disabled={busy}
        className="rounded-lg bg-indigo-500/80 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
        {busy ? "Upload…" : "Upload Part"}
      </button>
      {error && <span className="g-t3">{error}</span>}
    </form>
  )
}

export function ModelManager({ models, loading, onChanged, onEditAnchors }: ModelManagerProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)

  async function removeModel(id: string, name: string) {
    if (!window.confirm(`Hapus model "${name}" beserta semua part & anchor?`)) return
    setBusyId(id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/ring-resizer/models/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      await onChanged()
    } catch (err) {
      setDeleteError({ id, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>

  return (
    <div className="flex flex-col gap-4">
      <ModelForm onCreated={onChanged} />
      {models.length === 0 && (
        <div className="glass-card p-6 text-sm g-t4">Belum ada model — buat model cincin pertama kamu.</div>
      )}
      {models.map((m) => (
        <div key={m.id} className="glass-card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold g-t1">{m.name}</div>
              <div className="text-xs g-t4">base bore {m.baseBoreMm} mm · {m.parts.length} part</div>
            </div>
            <button type="button" onClick={() => removeModel(m.id, m.name)} disabled={busyId === m.id}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold g-t3 hover:bg-red-500/10 disabled:opacity-50">
              {busyId === m.id ? "Menghapus…" : "Hapus"}
            </button>
          </div>
          {deleteError?.id === m.id && <span className="text-xs g-t3">{deleteError.message}</span>}
          <ul className="flex flex-col gap-2">
            {m.parts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs">
                <span className="font-medium g-t2">{p.name}</span>
                <span className="g-t4">{fmtBytes(p.sizeBytes)} · {p.triCount.toLocaleString()} tri · {p.anchors.length} anchor</span>
                {onEditAnchors && (
                  <button type="button" onClick={() => onEditAnchors(m.id, p.id)}
                    className="rounded-lg bg-indigo-500/80 px-3 py-1.5 font-semibold text-white">
                    Atur Anchor
                  </button>
                )}
              </li>
            ))}
          </ul>
          <PartUpload modelId={m.id} onChanged={onChanged} />
        </div>
      ))}
    </div>
  )
}
