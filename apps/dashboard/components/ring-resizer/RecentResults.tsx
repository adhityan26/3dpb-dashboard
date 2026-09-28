"use client"

import { useCallback, useEffect, useState } from "react"

export interface RecentResultItem {
  id: string
  createdAt: string
  sizeBytes: number
  entries: string[]
  model: string | null
  label: string | null
  fileName: string
  downloadUrl: string
  directUrl: string | null
}

/**
 * One opaque no-cors probe per page: is the MinIO host reachable from this
 * browser (operator on LAN)? Then every Download button uses the direct link.
 */
async function probeDirect(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 1500)
    await fetch(url, { method: "HEAD", mode: "no-cors", signal: ctl.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function partName(entry: string): string {
  return entry.replace(/_[^_]+\.stl$/i, "")
}

/** Processed ZIPs stored in MinIO — survives page refreshes and other devices. */
export function RecentResults({ version }: { version: number }) {
  const [items, setItems] = useState<RecentResultItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [direct, setDirect] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/ring-resizer/results?limit=20")
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      const json = (await res.json()) as { items: RecentResultItem[] }
      setItems(json.items)
      const probeUrl = json.items.find((it) => it.directUrl)?.directUrl
      if (probeUrl) setDirect(await probeDirect(probeUrl))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // Nested async IIFE keeps setState out of the effect body
  // (react-hooks/set-state-in-effect), same as useRingModels.
  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load, version])

  return (
    <div className="glass-card p-4 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-semibold g-t2">Hasil terbaru</span>
        <span className="g-t4">— ZIP tersimpan di server, tetap ada walau halaman di-refresh</span>
        <button type="button" onClick={() => void load()}
          className="ml-auto rounded-lg px-2 py-1 font-semibold g-t4 hover:bg-white/10">
          Refresh
        </button>
      </div>
      {error && <div className="g-t3">{error}</div>}
      {items === null && !error && <div className="g-t4">Memuat…</div>}
      {items?.length === 0 && <div className="g-t4">Belum ada hasil.</div>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => {
            const href = direct && it.directUrl ? it.directUrl : it.downloadUrl
            return (
              <li key={it.id} className="flex flex-wrap items-center gap-2 g-t4">
                <span className="w-24 shrink-0">{fmtTime(it.createdAt)}</span>
                <b className="w-16 shrink-0 g-t1">{it.label ?? "?"}</b>
                <span className="min-w-0 flex-1 truncate">
                  {it.model ? `${it.model.replace(/_/g, " ")} · ` : ""}
                  {it.entries.length > 0 ? it.entries.map(partName).join(", ") : "isi tidak terbaca"}
                  {" · "}{(it.sizeBytes / 1e6).toFixed(0)} MB
                </span>
                <a href={href} download={it.fileName}
                  className="rounded-lg bg-indigo-500/80 px-3 py-1 font-semibold text-white">
                  Download
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
