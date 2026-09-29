"use client"

import { useCallback, useEffect, useState } from "react"
import { probeDirect, safeDirectUrl } from "./direct-download"
import { LanLink } from "./LanLink"

// Mirrors RESULT_RETENTION_DAYS in lib/ring-resizer/storage.ts (server-only module).
const RESULT_RETENTION_DAYS = 3

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
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/ring-resizer/results?limit=20")
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      const json = (await res.json()) as { items: RecentResultItem[] }
      setItems(json.items)
      // One probe per load: is MinIO reachable (LAN) and safe from this page?
      const probeUrl = json.items.map((it) => safeDirectUrl(it.directUrl)).find((u) => u != null)
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

  async function remove(ids: string[]) {
    setError(null)
    setDeleting((d) => new Set([...d, ...ids]))
    const failed: string[] = []
    for (const id of ids) {
      try {
        const res = await fetch(`/api/ring-resizer/results/${id}`, { method: "DELETE" })
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      } catch {
        failed.push(id)
      }
    }
    setItems((cur) => cur?.filter((it) => !ids.includes(it.id) || failed.includes(it.id)) ?? cur)
    setDeleting((d) => new Set([...d].filter((id) => !ids.includes(id))))
    if (failed.length > 0) setError(`${failed.length} file gagal dihapus`)
  }

  function removeOne(it: RecentResultItem) {
    if (!window.confirm(`Hapus hasil ${it.label ?? it.fileName}?`)) return
    void remove([it.id])
  }

  function removeAll() {
    if (!items || items.length === 0) return
    if (!window.confirm(`Hapus ${items.length} hasil yang tampil di list ini?`)) return
    void remove(items.map((it) => it.id))
  }

  return (
    <div className="glass-card p-4 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-semibold g-t2">Hasil terbaru</span>
        <span className="g-t4">— ZIP tersimpan di server {RESULT_RETENTION_DAYS} hari (lalu terhapus otomatis), tetap ada walau halaman di-refresh</span>
        <button type="button" onClick={() => void load()}
          className="ml-auto rounded-lg px-2 py-1 font-semibold g-t4 hover:bg-white/10">
          Refresh
        </button>
        {items && items.length > 0 && (
          <button type="button" onClick={removeAll} disabled={deleting.size > 0}
            className="rounded-lg px-2 py-1 font-semibold g-t3 hover:bg-red-500/10 disabled:opacity-50">
            Hapus semua
          </button>
        )}
      </div>
      {error && <div className="g-t3">{error}</div>}
      {items === null && !error && <div className="g-t4">Memuat…</div>}
      {items?.length === 0 && <div className="g-t4">Belum ada hasil.</div>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => {
            const directUrl = safeDirectUrl(it.directUrl)
            const href = direct && directUrl ? directUrl : it.downloadUrl
            const busy = deleting.has(it.id)
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
                {it.directUrl && href !== it.directUrl && (
                  <LanLink url={it.directUrl}
                    className="rounded-lg border border-indigo-500/60 px-3 py-1 font-semibold text-indigo-300 hover:bg-indigo-500/10" />
                )}
                <button type="button" onClick={() => removeOne(it)} disabled={busy}
                  className="rounded-lg px-2 py-1 font-semibold g-t3 hover:bg-red-500/10 disabled:opacity-50">
                  {busy ? "Menghapus…" : "Hapus"}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
