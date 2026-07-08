"use client"

import { useState } from "react"
import { useAssignSpool, useSpools } from "@/lib/hooks/use-filamen"
import { SPOOL_STATUS_COLORS } from "@/lib/filamen/types"
import type { AmsVariant, AmsSlotData } from "@/lib/filamen/types"
import { AmsSlotAlternativesPanel } from "./AmsSlotAlternativesPanel"

function slotDisplayColor(slot: AmsSlotData): string {
  // Priority: physical spool color → catalog auto-mapped color → fallback grey
  return slot.spool?.colorHex ?? slot.catalogColorHex ?? "#374151"
}

function slotHasColor(slot: AmsSlotData): boolean {
  return !!(slot.spool || slot.catalogColorHex)
}

export function AmsVariantRow({ variant }: { variant: AmsVariant }) {
  const [expanded, setExpanded] = useState(false)
  const [assigningSlot, setAssigningSlot] = useState<AmsSlotData | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const assignSpool = useAssignSpool()
  const { data: spoolsData } = useSpools()

  return (
    <div className={`border rounded-lg overflow-hidden mb-2 ${
      variant.hasLowSpool ? "border-orange-300" : "border-gray-200 dark:border-slate-700"
    }`}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-left"
      >
        <span className="text-gray-400 dark:text-slate-500 text-xs">{expanded ? "▼" : "▶"}</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-100 flex-1">{variant.variantName}</span>

        {/* Dot swatches — colored even without physical spool */}
        <div className="flex gap-1">
          {variant.slots.map((s, i) => (
            <div
              key={i}
              title={`AMS ${s.slotNumber}: ${s.filamentName}`}
              style={{
                width: 10, height: 10, borderRadius: "50%",
                backgroundColor: slotDisplayColor(s),
                border: s.spool
                  ? `1.5px solid ${SPOOL_STATUS_COLORS[s.spool.status]}`
                  : "1.5px solid #9ca3af",
                opacity: slotHasColor(s) ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {variant.hasLowSpool ? (
          <span className="text-xs text-orange-500 font-medium">⚠️ Low</span>
        ) : (
          <span className="text-xs text-green-500">✓</span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {variant.slots.map((slot) => (
              <div
                key={slot.id}
                className={`p-3 rounded-lg border bg-white dark:bg-slate-800 ${
                  slot.spool?.status === "low" || slot.spool?.status === "empty"
                    ? "border-orange-300"
                    : "border-gray-200 dark:border-slate-700"
                }`}
              >
                {/* Slot header */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 dark:text-slate-500">AMS {slot.slotNumber}</span>
                  <button
                    onClick={() => setAssigningSlot(slot)}
                    className="text-xs text-gray-400 dark:text-slate-500 hover:text-[#EE4D2D] dark:hover:text-indigo-400 transition-colors"
                    title="Assign spool fisik"
                  >
                    {slot.spool ? "● assign" : "○ assign"}
                  </button>
                </div>

                {/* Filament name + color */}
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 border border-black/10"
                    style={{ backgroundColor: slotDisplayColor(slot) }}
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-300 truncate">
                    {slot.filamentName}
                  </span>
                </div>

                {/* Spool status or "no catalog match" note */}
                {slot.spool ? (
                  <div className="text-xs mb-1" style={{ color: SPOOL_STATUS_COLORS[slot.spool.status] }}>
                    #{slot.spool.barcode.slice(0, 8).toUpperCase()} · {slot.spool.status.toUpperCase()}
                  </div>
                ) : slot.catalogColorHex ? (
                  <div className="text-xs text-gray-400 dark:text-slate-500 mb-1">Warna dari katalog · belum assign</div>
                ) : (
                  <div className="text-xs text-gray-300 dark:text-slate-600 mb-1">Warna tidak ditemukan di katalog</div>
                )}

                {/* Alternatives */}
                <AmsSlotAlternativesPanel slot={slot} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign spool modal */}
      {assigningSlot && spoolsData && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setAssigningSlot(null); setAssignError(null) } }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm shadow-xl" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700">
              <h3 className="font-semibold text-gray-800 dark:text-slate-100">
                Assign AMS {assigningSlot.slotNumber} — {assigningSlot.filamentName}
              </h3>
              <button onClick={() => { setAssigningSlot(null); setAssignError(null) }} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">✕</button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto space-y-2">
              {assigningSlot.spoolId && (
                <button
                  onClick={async () => {
                    try { await assignSpool.mutateAsync({ slotId: assigningSlot.id, spoolId: null }); setAssigningSlot(null) }
                    catch { setAssignError("Gagal melepas spool.") }
                  }}
                  className="w-full text-left px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50"
                >
                  ✕ Lepas spool dari slot ini
                </button>
              )}
              {assignError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{assignError}</p>}
              {spoolsData.spools.length === 0 && (
                <div className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">Belum ada spool tersedia.</div>
              )}
              {spoolsData.spools.map((spool) => (
                <button
                  key={spool.id}
                  onClick={async () => {
                    try { await assignSpool.mutateAsync({ slotId: assigningSlot.id, spoolId: spool.id }); setAssigningSlot(null) }
                    catch { setAssignError("Gagal assign spool.") }
                  }}
                  className={`w-full text-left px-3 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 ${
                    assigningSlot.spoolId === spool.id ? "border-[#EE4D2D] bg-orange-50" : "border-gray-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: spool.colorHex }} />
                    <span className="text-sm font-medium text-gray-800 dark:text-slate-100">{spool.brand} {spool.colorName}</span>
                    <span className="ml-auto text-xs font-semibold" style={{ color: SPOOL_STATUS_COLORS[spool.status] }}>
                      {spool.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 ml-6">{spool.material} · #{spool.barcode.slice(0, 8).toUpperCase()}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
