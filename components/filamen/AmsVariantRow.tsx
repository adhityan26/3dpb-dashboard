"use client"

import { useState } from "react"
import { useAssignSpool, useSpools } from "@/lib/hooks/use-filamen"
import { SPOOL_STATUS_COLORS } from "@/lib/filamen/types"
import type { AmsVariant, AmsSlotData } from "@/lib/filamen/types"

export function AmsVariantRow({ variant }: { variant: AmsVariant }) {
  const [expanded, setExpanded] = useState(false)
  const [assigningSlot, setAssigningSlot] = useState<AmsSlotData | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const assignSpool = useAssignSpool()
  const { data: spoolsData } = useSpools()

  return (
    <div className={`border rounded-lg overflow-hidden mb-2 ${
      variant.hasLowSpool ? "border-orange-300" : "border-gray-200"
    }`}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left"
      >
        <span className="text-gray-400 text-xs">{expanded ? "▼" : "▶"}</span>
        <span className="text-sm font-medium text-gray-800 flex-1">{variant.variantName}</span>

        {/* Dot swatches */}
        <div className="flex gap-1">
          {variant.slots.map((s, i) => (
            <div
              key={i}
              title={`AMS ${s.slotNumber}: ${s.filamentName}`}
              style={{
                width: 10, height: 10, borderRadius: "50%",
                backgroundColor: s.spool ? s.spool.colorHex : "#374151",
                border: `1.5px solid ${s.spool ? SPOOL_STATUS_COLORS[s.spool.status] : "#6b7280"}`,
                opacity: s.spool ? 1 : 0.3,
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
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {variant.slots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => setAssigningSlot(slot)}
                className={`text-left p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors ${
                  slot.spool?.status === "low" || slot.spool?.status === "empty"
                    ? "border-orange-300"
                    : "border-gray-200"
                }`}
              >
                <div className="text-xs text-gray-400 mb-1">AMS {slot.slotNumber}</div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: slot.spool?.colorHex ?? "#374151" }}
                  />
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {slot.filamentName}
                  </span>
                </div>
                {slot.spool ? (
                  <div className="text-xs" style={{ color: SPOOL_STATUS_COLORS[slot.spool.status] }}>
                    #{slot.spool.barcode.slice(0, 8).toUpperCase()} · {slot.spool.status.toUpperCase()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Belum assign</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assigningSlot && spoolsData && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setAssigningSlot(null); setAssignError(null) } }}
        >
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" role="dialog" aria-modal="true" aria-labelledby="assign-modal-title">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 id="assign-modal-title" className="font-semibold text-gray-800">
                Assign AMS {assigningSlot.slotNumber} — {assigningSlot.filamentName}
              </h3>
              <button onClick={() => { setAssigningSlot(null); setAssignError(null) }} aria-label="Tutup" className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto space-y-2">
              {/* Unassign option */}
              {assigningSlot.spoolId && (
                <button
                  onClick={async () => {
                    setAssignError(null)
                    try {
                      await assignSpool.mutateAsync({ slotId: assigningSlot.id, spoolId: null })
                      setAssigningSlot(null)
                    } catch (e) {
                      setAssignError(e instanceof Error ? e.message : "Gagal melepas spool.")
                    }
                  }}
                  className="w-full text-left px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50"
                >
                  ✕ Lepas spool dari slot ini
                </button>
              )}
              {assignError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{assignError}</p>
              )}
              {spoolsData.spools.length === 0 && (
                <div className="text-sm text-gray-400 py-4 text-center">Belum ada spool tersedia.</div>
              )}
              {/* Spool options */}
              {spoolsData.spools.map((spool) => (
                <button
                  key={spool.id}
                  onClick={async () => {
                    setAssignError(null)
                    try {
                      await assignSpool.mutateAsync({ slotId: assigningSlot.id, spoolId: spool.id })
                      setAssigningSlot(null)
                    } catch (e) {
                      setAssignError(e instanceof Error ? e.message : "Gagal assign spool.")
                    }
                  }}
                  className={`w-full text-left px-3 py-2 border rounded-lg hover:bg-gray-50 ${
                    assigningSlot.spoolId === spool.id ? "border-[#EE4D2D] bg-orange-50" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: spool.colorHex }} />
                    <span className="text-sm font-medium text-gray-800">
                      {spool.brand} {spool.colorName}
                    </span>
                    <span className="ml-auto text-xs font-semibold" style={{ color: SPOOL_STATUS_COLORS[spool.status] }}>
                      {spool.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 ml-6">
                    {spool.material} · #{spool.barcode.slice(0, 8).toUpperCase()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
