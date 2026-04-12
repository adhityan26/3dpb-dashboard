import type { SpoolData } from "@/lib/filamen/types"
import { SPOOL_STATUS_COLORS, SPOOL_STATUS_LABELS } from "@/lib/filamen/types"

interface SpoolCardProps {
  spool: SpoolData
  onEdit: (spool: SpoolData) => void
  onPrint: (spool: SpoolData) => void
}

export function SpoolCard({ spool, onEdit, onPrint }: SpoolCardProps) {
  const statusColor = SPOOL_STATUS_COLORS[spool.status]
  const statusLabel = SPOOL_STATUS_LABELS[spool.status]
  const isLow = spool.status === "low" || spool.status === "empty"

  return (
    <div
      className={`bg-white rounded-lg border overflow-hidden ${
        isLow ? "border-orange-300" : "border-gray-200"
      }`}
    >
      {/* Status bar */}
      <div className="h-1.5" style={{ backgroundColor: statusColor }} />

      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {/* Color swatch */}
          <div
            className="w-7 h-7 rounded-full border-2 border-gray-200 flex-shrink-0"
            style={{ backgroundColor: spool.colorHex }}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">
              {spool.brand} {spool.colorName}
            </div>
            <div className="text-xs text-gray-400">{spool.material}</div>
          </div>
          <span
            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: statusColor + "22",
              color: statusColor,
              border: `1px solid ${statusColor}44`,
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Spool ID + meta */}
        <div className="text-xs text-gray-400 mb-1">#{spool.barcode.slice(0, 8).toUpperCase()}</div>
        {spool.assignedSlotCount > 0 && (
          <div className={`text-xs mb-2 ${isLow ? "text-orange-500" : "text-gray-400"}`}>
            {isLow ? "⚠️ " : ""}Dipakai di {spool.assignedSlotCount} slot AMS
          </div>
        )}
        {spool.nfcTagId && (
          <div className="text-xs text-gray-400 mb-2">📡 NFC terpasang</div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => onPrint(spool)}
            className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1 rounded"
          >
            🏷 Print
          </button>
          <button
            onClick={() => onEdit(spool)}
            className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1 rounded"
          >
            ✏️ Edit
          </button>
        </div>
      </div>
    </div>
  )
}
