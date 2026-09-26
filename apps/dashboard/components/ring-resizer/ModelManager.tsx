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

/** Base bore display with manual-override editing (fallback when detection is off). */
function BaseBoreControl({ model, onChanged }: { model: RingModelWithParts; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const num = parseFloat(value)
    if (!(num > 0)) { setError("harus > 0"); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/ring-resizer/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseBoreMm: num }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setEditing(false)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input value={value} onChange={(e) => setValue(e.target.value)} type="number" step="0.001" min="1"
          autoFocus className="glass-input w-24 rounded px-2 py-0.5 text-xs" placeholder="mm" />
        <button type="button" onClick={save} disabled={busy}
          className="rounded bg-indigo-500/80 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50">OK</button>
        <button type="button" onClick={() => setEditing(false)} className="px-1 text-xs g-t4">batal</button>
        {error && <span className="text-xs g-t3">{error}</span>}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {model.baseBoreMm != null
        ? <>base bore <b className="g-t2">{model.baseBoreMm.toFixed(2)} mm</b></>
        : <span className="g-t3">base bore belum terdeteksi</span>}
      <button type="button" title="Edit manual"
        onClick={() => { setValue(model.baseBoreMm != null ? String(model.baseBoreMm) : ""); setEditing(true) }}
        className="rounded px-1 text-xs g-t4 hover:bg-white/10">✎</button>
    </span>
  )
}

function PartName({ part, onChanged }: { part: { id: string; name: string }; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!value.trim()) { setEditing(false); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/ring-resizer/parts/${part.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setEditing(false)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false) }}
          className="glass-input w-32 rounded px-2 py-0.5 text-xs" />
        <button type="button" onClick={save} disabled={busy}
          className="rounded bg-indigo-500/80 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50">OK</button>
        <button type="button" onClick={() => setEditing(false)} className="px-1 text-xs g-t4">batal</button>
        {error && <span className="text-xs g-t3">{error}</span>}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 font-medium g-t2">
      {part.name}
      <button type="button" title="Rename part"
        onClick={() => { setValue(part.name); setEditing(true) }}
        className="rounded px-1 text-xs g-t4 hover:bg-white/10">✎</button>
    </span>
  )
}

type RotKey = "rotXDeg" | "rotYDeg" | "rotZDeg"
const ROT_AXES: { key: RotKey; label: string }[] = [
  { key: "rotXDeg", label: "X" }, { key: "rotYDeg", label: "Y" }, { key: "rotZDeg", label: "Z" },
]

/** Print orientation applied to the downloaded STL (X then Y then Z, degrees). */
function PartRotation({ part, onChanged }: {
  part: { id: string; rotXDeg: number; rotYDeg: number; rotZDeg: number }
  onChanged: () => Promise<void>
}) {
  const saved = { rotXDeg: part.rotXDeg ?? 0, rotYDeg: part.rotYDeg ?? 0, rotZDeg: part.rotZDeg ?? 0 }
  const [draft, setDraft] = useState<Record<RotKey, string>>({
    rotXDeg: String(saved.rotXDeg), rotYDeg: String(saved.rotYDeg), rotZDeg: String(saved.rotZDeg),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = ROT_AXES.some(({ key }) => Number(draft[key]) !== saved[key])

  async function save() {
    const body: Record<RotKey, number> = { rotXDeg: 0, rotYDeg: 0, rotZDeg: 0 }
    for (const { key, label } of ROT_AXES) {
      const n = Number(draft[key])
      if (!Number.isFinite(n) || Math.abs(n) > 360) { setError(`${label}: -360…360`); return }
      body[key] = n
    }
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/ring-resizer/parts/${part.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1 g-t4" title="Rotasi diterapkan ke STL hasil download (urutan X → Y → Z), lalu diletakkan rata di bed">
      Rotasi
      {ROT_AXES.map(({ key, label }) => (
        <label key={key} className="inline-flex items-center gap-0.5">
          {label}
          <input type="number" step={90} min={-360} max={360} value={draft[key]}
            aria-label={`Rotasi ${label}`}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) void save() }}
            className="glass-input w-16 rounded px-1.5 py-0.5 text-xs" />
        </label>
      ))}
      °
      {dirty && (
        <button type="button" onClick={save} disabled={busy}
          className="rounded bg-indigo-500/80 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? "…" : "Simpan"}
        </button>
      )}
      {error && <span className="g-t3">{error}</span>}
    </span>
  )
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

  async function removePart(partId: string, partName: string) {
    if (!window.confirm(`Hapus part "${partName}" beserta anchor-nya?`)) return
    setDeleteError(null)
    try {
      const res = await fetch(`/api/ring-resizer/parts/${partId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      await onChanged()
    } catch (err) {
      setDeleteError({ id: partId, message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function applyBaseBore(modelId: string, boreMm: number) {
    setDeleteError(null)
    try {
      const res = await fetch(`/api/ring-resizer/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseBoreMm: boreMm }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      await onChanged()
    } catch (err) {
      setDeleteError({ id: modelId, message: err instanceof Error ? err.message : String(err) })
    }
  }

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
              <div className="text-xs g-t4"><BaseBoreControl model={m} onChanged={onChanged} /> · {m.parts.length} part</div>
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
                <PartName part={p} onChanged={onChanged} />
                <span className="g-t4">
                  {fmtBytes(p.sizeBytes)} · {p.triCount.toLocaleString()} tri · {p.anchors.length} anchor
                  {p.boreMm != null && <> · bore {p.boreMm.toFixed(2)} mm</>}
                </span>
                <PartRotation part={p} onChanged={onChanged} />
                {p.boreMm != null && m.baseBoreMm !== p.boreMm && (
                  <button type="button" onClick={() => applyBaseBore(m.id, p.boreMm!)}
                    className="rounded-lg px-2 py-1 font-semibold g-t3 hover:bg-white/10">
                    Pakai sebagai base bore
                  </button>
                )}
                {onEditAnchors && (
                  <button type="button" onClick={() => onEditAnchors(m.id, p.id)}
                    className="rounded-lg bg-indigo-500/80 px-3 py-1.5 font-semibold text-white">
                    Atur Anchor
                  </button>
                )}
                <button type="button" title="Hapus part" onClick={() => removePart(p.id, p.name)}
                  className="rounded-lg px-2 py-1 font-semibold g-t3 hover:bg-red-500/10">
                  Hapus
                </button>
                {deleteError?.id === p.id && <span className="text-xs g-t3">{deleteError.message}</span>}
              </li>
            ))}
          </ul>
          <PartUpload modelId={m.id} onChanged={onChanged} />
        </div>
      ))}
    </div>
  )
}
