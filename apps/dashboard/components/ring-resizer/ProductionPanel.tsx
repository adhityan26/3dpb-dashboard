"use client"

import { useMemo, useState } from "react"
import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"
import { computeScale, type SizeMode } from "@/lib/ring-resizer/sizing"

export interface ProductionPanelProps {
  models: RingModelWithParts[]
  loading: boolean
}

const MODE_LABEL: Record<SizeMode, string> = { us: "US Size", dia: "Diameter (mm)", circ: "Keliling (mm)" }
const MODE_DEFAULT: Record<SizeMode, number> = { us: 8, dia: 18.1, circ: 57 }

export function ProductionPanel({ models, loading }: ProductionPanelProps) {
  const [modelId, setModelId] = useState<string | null>(null)
  const [mode, setMode] = useState<SizeMode>("us")
  const [value, setValue] = useState<number>(8)
  const [clearance, setClearance] = useState(true)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const model = models.find((m) => m.id === modelId) ?? models[0]

  const summary = useMemo(() => {
    if (!model || model.baseBoreMm == null || !(value > 0)) return null
    try {
      return computeScale({ mode, value, clearanceMm: clearance ? 0.3 : 0, baseBoreMm: model.baseBoreMm })
    } catch {
      return null
    }
  }, [model, mode, value, clearance])

  const defaultText = summary ? `US ${summary.usEquivalent.toFixed(1).replace(/\.0$/, "")}` : ""
  const effectiveText = text || defaultText

  async function submit() {
    if (!model || !summary) return
    setBusy(true); setError(null); setWarnings([])
    try {
      const res = await fetch("/api/ring-resizer/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id, mode, value, clearanceMm: clearance ? 0.3 : 0, text: effectiveText,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      // Server URI-encodes the header to stay ByteString-safe
      setWarnings(JSON.parse(decodeURIComponent(res.headers.get("X-Ring-Warnings") ?? "%5B%5D")))
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") ?? ""
      const fname = /filename="([^"]+)"/.exec(cd)?.[1] ?? "ring.zip"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>
  if (models.length === 0) {
    return <div className="glass-card p-6 text-sm g-t4">Belum ada model — setup model dulu di tab Setup Model.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-1 text-xs g-t4">
          Model cincin
          <select value={model?.id} onChange={(e) => setModelId(e.target.value)}
            className="glass-input max-w-xs rounded-lg px-3 py-2 text-sm">
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>

        <div className="flex gap-2">
          {(Object.keys(MODE_LABEL) as SizeMode[]).map((m) => (
            <button key={m} type="button"
              onClick={() => { setMode(m); setValue(MODE_DEFAULT[m]) }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === m ? "bg-indigo-500 text-white" : "glass-card g-t3"
              }`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs g-t4">
            {MODE_LABEL[mode]}
            <input type="number" value={value} step={mode === "us" ? 0.5 : 0.1} min={0}
              onChange={(e) => setValue(Number(e.target.value))}
              className="glass-input w-32 rounded-lg px-3 py-2 text-lg font-bold" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs g-t4">
            <input type="checkbox" checked={clearance} onChange={(e) => setClearance(e.target.checked)} />
            + 0.3 mm kelonggaran (rekomendasi)
          </label>
          <label className="flex flex-col gap-1 text-xs g-t4">
            Text engrave
            <input value={text} placeholder={defaultText} maxLength={24}
              onChange={(e) => setText(e.target.value)}
              className="glass-input w-48 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>

        {model && model.baseBoreMm == null && (
          <div className="rounded-xl border border-amber-500/40 p-3 text-xs g-t3">
            Base bore model ini belum terdeteksi — upload part band di Setup Model (dihitung otomatis) atau isi manual di card model.
          </div>
        )}

        {summary && model && (
          <div className="rounded-xl border border-indigo-500/40 p-4 text-sm">
            <span className="text-2xl font-extrabold g-t1">{(summary.scale * 100).toFixed(2)}%</span>
            <span className="ml-3 g-t4">
              ≈ US {summary.usEquivalent.toFixed(1)} · target lubang {summary.targetDiaMm.toFixed(2)} mm ·
              keliling {summary.circMm.toFixed(1)} mm · {model.parts.length} part ·
              {" "}{model.parts.reduce((n, p) => n + p.anchors.length, 0)} anchor · text &quot;{effectiveText}&quot;
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={submit} disabled={busy || !summary}
            className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Memproses… (bisa ~1 menit)" : "Proses & Download ZIP"}
          </button>
          {error && <span className="text-xs g-t3">{error}</span>}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="glass-card p-4 text-xs g-t3">
          <div className="mb-1 font-semibold">Warning:</div>
          <ul className="list-disc pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
