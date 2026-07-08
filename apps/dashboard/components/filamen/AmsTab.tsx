"use client"

import { useState } from "react"
import { useAms } from "@/lib/hooks/use-filamen"
import { useQueryClient } from "@tanstack/react-query"
import { AmsVariantRow } from "./AmsVariantRow"
import type { ProductType } from "@/lib/filamen/types"

export function AmsTab() {
  const { data, isLoading, isError } = useAms()
  const qc = useQueryClient()
  const [section, setSection] = useState<ProductType>("swoosh")
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/filamen/ams/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal sync')
      setSyncMsg(`✓ Sync selesai — ${json.upserted} slot diperbarui`)
      await qc.invalidateQueries({ queryKey: ['ams'] })
    } catch (e) {
      setSyncMsg(`✗ ${e instanceof Error ? e.message : 'Error'}`)
    } finally {
      setSyncing(false)
    }
  }

  if (isLoading) return <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Memuat data AMS...</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Gagal memuat data AMS.</div>
  if (!data) return null

  const variants = section === "swoosh" ? data.swoosh : data.clickers
  const lowCount = variants.filter((v) => v.hasLowSpool).length

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        {(["swoosh", "clickers"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              section === s
                ? "bg-[#EE4D2D] dark:bg-indigo-600 text-white border-[#EE4D2D] dark:border-indigo-600"
                : "bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        {lowCount > 0 && (
          <span className="text-xs text-orange-500 ml-2">
            ⚠️ {lowCount} varian ada spool LOW
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-xs border border-gray-300 dark:border-slate-600 px-3 py-1.5 rounded-md text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : '↻ Sync Sheet'}
        </button>
      </div>
      {syncMsg && (
        <p className={`text-xs px-1 ${syncMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
          {syncMsg}
        </p>
      )}

      {/* Accordion rows */}
      <div>
        {variants.map((variant) => (
          <AmsVariantRow key={variant.variantName} variant={variant} />
        ))}
      </div>
    </div>
  )
}
