"use client"

import { useMemo, useState } from "react"
import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"
import { computeScale, sizeRange, MAX_BATCH_SIZES, type SizeMode } from "@/lib/ring-resizer/sizing"

export interface ProductionPanelProps {
  models: RingModelWithParts[]
  loading: boolean
}

const MODE_LABEL: Record<SizeMode, string> = { us: "US Size", dia: "Diameter (mm)", circ: "Keliling (mm)" }
const MODE_DEFAULT: Record<SizeMode, number> = { us: 8, dia: 18.1, circ: 57 }
const MODE_STEP: Record<SizeMode, number> = { us: 0.5, dia: 0.1, circ: 0.1 }
const BATCH_DEFAULT: Record<SizeMode, { from: number; to: number; step: number }> = {
  us: { from: 6, to: 10, step: 0.5 },
  dia: { from: 16, to: 20, step: 0.5 },
  circ: { from: 50, to: 62, step: 1 },
}
const CLEARANCE_MM = 0.3

interface ProcessResponse {
  downloadUrl: string
  directUrl: string | null
  fileName: string
  warnings: string[]
}

interface DoneResult {
  directUrl: string | null
  downloadUrl: string
  fileName: string
  href: string
  via: "minio" | "server"
}

type BatchItem =
  | { value: number; label: string; status: "pending" | "running" }
  | { value: number; label: string; status: "done"; result: DoneResult }
  | { value: number; label: string; status: "error"; error: string }

/** Engrave label default: just the US number (e.g. "8" / "7.5"), no "US" prefix. */
function sizeLabel(usEquivalent: number): string {
  return usEquivalent.toFixed(1).replace(/\.0$/, "")
}

/**
 * Prefer the direct MinIO link when the NAS is reachable (operator on LAN) —
 * skips the app and any tunnel. An opaque no-cors probe with a short timeout
 * answers "reachable?" without needing CORS on MinIO; any failure (offsite,
 * mixed-content block, timeout) falls back to the app-proxied URL.
 */
async function resolveDownload(json: ProcessResponse): Promise<DoneResult> {
  let href = json.downloadUrl
  let via: "minio" | "server" = "server"
  if (json.directUrl) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 1500)
      await fetch(json.directUrl, { method: "HEAD", mode: "no-cors", signal: ctl.signal })
      clearTimeout(timer)
      href = json.directUrl
      via = "minio"
    } catch {
      // unreachable — keep the server route
    }
  }
  return { directUrl: json.directUrl, downloadUrl: json.downloadUrl, fileName: json.fileName, href, via }
}

function triggerDownload(r: DoneResult): void {
  const a = document.createElement("a")
  a.href = r.href
  a.download = r.fileName
  a.click()
}

function DownloadLinks({ r }: { r: DoneResult }) {
  return (
    <>
      {r.directUrl && (
        <>
          <a href={r.directUrl} className="underline g-t2">MinIO</a>
          {" · "}
        </>
      )}
      <a href={r.downloadUrl} className="underline g-t2">server</a>
    </>
  )
}

export function ProductionPanel({ models, loading }: ProductionPanelProps) {
  const [modelId, setModelId] = useState<string | null>(null)
  const [mode, setMode] = useState<SizeMode>("us")
  const [batch, setBatch] = useState(false)
  const [value, setValue] = useState<number>(8)
  const [range, setRange] = useState(BATCH_DEFAULT.us)
  const [clearance, setClearance] = useState(true)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<DoneResult | null>(null)
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])

  const model = models.find((m) => m.id === modelId) ?? models[0]
  const clearanceMm = clearance ? CLEARANCE_MM : 0

  const summary = useMemo(() => {
    if (!model || model.baseBoreMm == null || !(value > 0)) return null
    try {
      return computeScale({ mode, value, clearanceMm, baseBoreMm: model.baseBoreMm })
    } catch {
      return null
    }
  }, [model, mode, value, clearanceMm])

  const batchSizes = useMemo(() => {
    if (!model || model.baseBoreMm == null) return []
    const baseBoreMm = model.baseBoreMm
    return sizeRange(range.from, range.to, range.step).map((v) => {
      const s = computeScale({ mode, value: v, clearanceMm, baseBoreMm })
      return { value: v, label: sizeLabel(s.usEquivalent), pct: Math.round(s.scaleCeil * 100) }
    })
  }, [model, mode, range, clearanceMm])

  const defaultText = summary ? sizeLabel(summary.usEquivalent) : ""
  const effectiveText = text || defaultText

  async function processOne(v: number, label: string): Promise<ProcessResponse> {
    const res = await fetch("/api/ring-resizer/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: model!.id, mode, value: v, clearanceMm, text: label }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
    // Small JSON payload; the ZIP itself is fetched by the browser natively
    // via GET (large fetch() bodies proved fragile through the proxy).
    return (await res.json()) as ProcessResponse
  }

  async function submitSingle() {
    if (!model || !summary) return
    setBusy(true); setError(null); setWarnings([])
    try {
      const json = await processOne(value, effectiveText)
      setWarnings(json.warnings)
      const r = await resolveDownload(json)
      setLastResult(r)
      triggerDownload(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Sizes run one request at a time: each one already takes up to ~1 min on
  // big meshes, and one ZIP per size keeps server memory bounded (a combined
  // ZIP of ~100 MB/size would not be). Results are listed, not auto-downloaded.
  async function submitBatch() {
    if (!model || batchSizes.length === 0) return
    setBusy(true); setError(null); setWarnings([]); setLastResult(null)
    const items: BatchItem[] = batchSizes.map((s) => ({ value: s.value, label: s.label, status: "pending" }))
    setBatchItems([...items])
    const allWarnings: string[] = []
    for (let i = 0; i < items.length; i++) {
      const { value: v, label } = items[i]
      items[i] = { value: v, label, status: "running" }
      setBatchItems([...items])
      try {
        const json = await processOne(v, label)
        allWarnings.push(...json.warnings.map((w) => `[${label}] ${w}`))
        items[i] = { value: v, label, status: "done", result: await resolveDownload(json) }
      } catch (err) {
        items[i] = { value: v, label, status: "error", error: err instanceof Error ? err.message : String(err) }
      }
      setBatchItems([...items])
      setWarnings([...allWarnings])
    }
    setBusy(false)
  }

  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>
  if (models.length === 0) {
    return <div className="glass-card p-6 text-sm g-t4">Belum ada model — setup model dulu di tab Setup Model.</div>
  }

  const batchDone = batchItems.filter((b) => b.status === "done" || b.status === "error").length
  const running = batchItems.find((b) => b.status === "running")

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

        <div className="flex flex-wrap gap-2">
          {(Object.keys(MODE_LABEL) as SizeMode[]).map((m) => (
            <button key={m} type="button" disabled={busy}
              onClick={() => { setMode(m); setValue(MODE_DEFAULT[m]); setRange(BATCH_DEFAULT[m]) }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === m ? "bg-indigo-500 text-white" : "glass-card g-t3"
              }`}>
              {MODE_LABEL[m]}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-white/10" />
          {([false, true] as const).map((b) => (
            <button key={String(b)} type="button" disabled={busy} onClick={() => setBatch(b)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                batch === b ? "bg-indigo-500 text-white" : "glass-card g-t3"
              }`}>
              {b ? "Batch" : "Satu ukuran"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {batch ? (
            (["from", "to", "step"] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-xs g-t4">
                {k === "from" ? `Dari (${MODE_LABEL[mode]})` : k === "to" ? "Sampai" : "Step"}
                <input type="number" value={range[k]} min={0} step={MODE_STEP[mode]}
                  onChange={(e) => setRange((r) => ({ ...r, [k]: Number(e.target.value) }))}
                  className="glass-input w-28 rounded-lg px-3 py-2 text-lg font-bold" />
              </label>
            ))
          ) : (
            <label className="flex flex-col gap-1 text-xs g-t4">
              {MODE_LABEL[mode]}
              <input type="number" value={value} step={MODE_STEP[mode]} min={0}
                onChange={(e) => setValue(Number(e.target.value))}
                className="glass-input w-32 rounded-lg px-3 py-2 text-lg font-bold" />
            </label>
          )}
          <label className="flex items-center gap-2 pb-2 text-xs g-t4">
            <input type="checkbox" checked={clearance} onChange={(e) => setClearance(e.target.checked)} />
            + {CLEARANCE_MM} mm kelonggaran (rekomendasi)
          </label>
          <label className="flex flex-col gap-1 text-xs g-t4">
            Text engrave
            <input value={batch ? "" : text} disabled={batch}
              placeholder={batch ? "otomatis = ukuran" : defaultText} maxLength={24}
              onChange={(e) => setText(e.target.value)}
              className="glass-input w-48 rounded-lg px-3 py-2 text-sm disabled:opacity-60" />
          </label>
        </div>

        {model && model.baseBoreMm == null && (
          <div className="rounded-xl border border-amber-500/40 p-3 text-xs g-t3">
            Base bore model ini belum terdeteksi — upload part band di Setup Model (dihitung otomatis) atau isi manual di card model.
          </div>
        )}

        {!batch && summary && model && (
          <div className="rounded-xl border border-indigo-500/40 p-4 text-sm">
            <span className="text-2xl font-extrabold g-t1">{Math.round(summary.scaleCeil * 100)}%</span>
            <span className="ml-3 g-t4">
              ≈ US {summary.usEquivalent.toFixed(1)} · target lubang {summary.targetDiaMm.toFixed(2)} mm ·
              keliling {summary.circMm.toFixed(1)} mm · pas {(summary.scale * 100).toFixed(2)}% · {model.parts.length} part ·
              {" "}{model.parts.reduce((n, p) => n + p.anchors.length, 0)} anchor · text &quot;{effectiveText}&quot;
            </span>
          </div>
        )}

        {batch && model && model.baseBoreMm != null && (
          <div className="rounded-xl border border-indigo-500/40 p-4 text-sm">
            {batchSizes.length === 0 ? (
              <span className="g-t3">Range tidak valid (maks {MAX_BATCH_SIZES} ukuran, &quot;Sampai&quot; ≥ &quot;Dari&quot;, step &gt; 0).</span>
            ) : (
              <>
                <div className="mb-2 g-t4">
                  {batchSizes.length} ukuran × {model.parts.length} part — 1 ZIP per ukuran (download manual dari list), text engrave = ukuran US
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {batchSizes.map((s) => (
                    <span key={s.value} className="rounded-lg border border-white/10 px-2 py-1 text-xs">
                      <b className="g-t1">{mode === "us" ? `US ${s.value}` : s.value}</b>
                      <span className="ml-1 g-t4">{s.pct}%{mode !== "us" && ` · "${s.label}"`}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={batch ? submitBatch : submitSingle}
            disabled={busy || (batch ? batchSizes.length === 0 : !summary)}
            className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy
              ? batch
                ? `Memproses ${batchDone + 1}/${batchItems.length}${running ? ` (${running.label})` : ""}…`
                : "Memproses… (bisa ~1 menit)"
              : batch
                ? `Proses ${batchSizes.length} ukuran`
                : "Proses & Download ZIP"}
          </button>
          {error && <span className="text-xs g-t3">{error}</span>}
        </div>
      </div>

      {!batch && lastResult && (
        <div className="glass-card p-3 text-xs g-t4">
          Terdownload via {lastResult.via === "minio" ? "MinIO langsung (LAN)" : "server"} — {lastResult.fileName}.
          Download ulang: <DownloadLinks r={lastResult} />
        </div>
      )}

      {batch && batchItems.length > 0 && (
        <div className="glass-card p-3 text-xs">
          <div className="mb-2 font-semibold g-t2">Hasil batch ({batchDone}/{batchItems.length})</div>
          <ul className="flex flex-col gap-1">
            {batchItems.map((b) => (
              <li key={b.value} className="flex flex-wrap items-center gap-2 g-t4">
                <b className="w-16 g-t2">{mode === "us" ? `US ${b.value}` : b.value}</b>
                {b.status === "pending" && <span>menunggu</span>}
                {b.status === "running" && <span className="text-indigo-400">memproses…</span>}
                {b.status === "done" && (
                  <>
                    <a href={b.result.href} download={b.result.fileName}
                      className="rounded-lg bg-indigo-500/80 px-3 py-1 font-semibold text-white">
                      Download
                    </a>
                    <span>{b.result.fileName}</span>
                    <span className="g-t4">(alternatif: <DownloadLinks r={b.result} />)</span>
                  </>
                )}
                {b.status === "error" && <span className="text-red-400">✗ {b.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="glass-card p-4 text-xs g-t3">
          <div className="mb-1 font-semibold">Warning:</div>
          <ul className="list-disc pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
