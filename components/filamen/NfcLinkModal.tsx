"use client"

import { useState, useEffect, useMemo } from "react"
import { useSpools } from "@/lib/hooks/use-filamen"
import { useQueryClient } from "@tanstack/react-query"
import type { SpoolData } from "@/lib/filamen/types"

interface NfcLinkModalProps {
  nfcTagId: string   // raw serialNumber dari NFC tag
  onLinked: (spool: SpoolData) => void
  onAddNew: () => void
  onClose: () => void
}

export function NfcLinkModal({ nfcTagId, onLinked, onAddNew, onClose }: NfcLinkModalProps) {
  const { data } = useSpools()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [linking, setLinking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase().trim()
    if (!q) return data.spools
    return data.spools.filter((s) =>
      `${s.brand} ${s.material} ${s.colorName}`.toLowerCase().includes(q)
    )
  }, [data, search])

  async function handleLink(spool: SpoolData) {
    setLinking(spool.id)
    setError(null)
    try {
      const res = await fetch(`/api/filamen/spools/${spool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfcTagId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated: SpoolData = await res.json()
      await qc.invalidateQueries({ queryKey: ["spools"] })
      onLinked(updated)
    } catch {
      setError("Gagal menyimpan. Coba lagi.")
      setLinking(null)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm shadow-xl max-h-[80vh] flex flex-col" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-slate-100">Hubungkan NFC ke Spool</h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 font-mono">{nfcTagId}</p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">✕</button>
        </div>

        <div className="px-4 pt-3 pb-2 shrink-0">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari brand / warna / material..."
            className="w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        {error && (
          <p className="px-5 text-xs text-red-500 shrink-0">{error}</p>
        )}

        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {filtered.length === 0 && (
            <div className="text-center py-6 space-y-3">
              <p className="text-gray-400 dark:text-slate-500 text-sm">Tidak ada spool ditemukan.</p>
              <button
                onClick={onAddNew}
                className="text-sm bg-[#EE4D2D] dark:bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700"
              >
                + Tambah Spool Baru
              </button>
            </div>
          )}
          <ul className="space-y-1 mt-2">
            {filtered.map((spool) => (
              <li key={spool.id}>
                <button
                  disabled={!!linking}
                  onClick={() => handleLink(spool)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-left transition-colors disabled:opacity-50"
                >
                  {/* Color swatch */}
                  <span
                    className="w-5 h-5 rounded-full shrink-0 border border-black/10"
                    style={{ background: spool.colorHex ?? "#ccc" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
                      {spool.brand} {spool.colorName}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{spool.material} · {spool.status}</p>
                  </div>
                  {spool.nfcTagId && (
                    <span className="text-xs text-blue-400 shrink-0">📡 sudah ada</span>
                  )}
                  {linking === spool.id && (
                    <span className="text-xs text-gray-400 dark:text-slate-500 shrink-0">Menyimpan...</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
