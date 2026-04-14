import type { SpoolData } from "@/lib/filamen/types"
import { SPOOL_STATUS_COLORS, SPOOL_STATUS_LABELS } from "@/lib/filamen/types"

interface SpoolCardProps {
  spool: SpoolData
  onEdit: (spool: SpoolData) => void
  onPrint: (spool: SpoolData) => void
  onTap?: (spool: SpoolData) => void
  selected?: boolean
  onSelect?: (spool: SpoolData) => void
}

export function SpoolCard({ spool, onEdit, onPrint, onTap, selected, onSelect }: SpoolCardProps) {
  const statusColor = SPOOL_STATUS_COLORS[spool.status]
  const statusLabel = SPOOL_STATUS_LABELS[spool.status]
  const isLow = spool.status === "low" || spool.status === "empty"

  // Weight progress: 0–1 representing remaining fraction
  const hasWeight = spool.initialWeight != null && spool.initialWeight > 0
  const remainingWeight = hasWeight
    ? Math.max(0, (spool.initialWeight ?? 0) - (spool.usedWeight ?? 0))
    : null
  const progressPct = hasWeight
    ? Math.round((remainingWeight! / spool.initialWeight!) * 100)
    : null

  return (
    <div
      className={`relative flex rounded-lg overflow-hidden border transition-colors cursor-pointer
        ${selected
          ? "ring-2 ring-[#EE4D2D] dark:ring-indigo-400 border-[#EE4D2D] dark:border-indigo-400"
          : isLow
            ? "border-orange-300 dark:border-orange-700"
            : "border-gray-200 dark:border-slate-700"
        }
        bg-white dark:bg-slate-800`}
      onClick={() => onTap?.(spool)}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(spool) }}
          className={`absolute top-1.5 left-1.5 z-10 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            selected
              ? "bg-[#EE4D2D] dark:bg-indigo-500 border-[#EE4D2D] dark:border-indigo-500"
              : "bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 hover:border-[#EE4D2D] dark:hover:border-indigo-400"
          }`}
          aria-label={selected ? "Deselect" : "Select"}
        >
          {selected && <span className="text-white text-[9px] leading-none">✓</span>}
        </button>
      )}

      {/* Left color strip */}
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: spool.colorHex }} />

      {/* Content */}
      <div className="flex-1 px-2.5 py-2 min-w-0">
        {/* Top row: name + action icons */}
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-800 dark:text-slate-100 truncate leading-tight">
              {spool.colorName}
            </div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate">
              {spool.brand} · {spool.material}
            </div>
          </div>
          {/* Icon actions — stop propagation so they don't trigger onTap */}
          <div className="flex gap-1 flex-shrink-0 mt-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onPrint(spool) }}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-[11px]"
              title="Print stiker"
            >
              🏷
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(spool) }}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-[11px]"
              title="Edit spool"
            >
              ✏️
            </button>
          </div>
        </div>

        {/* Weight progress bar */}
        {hasWeight && progressPct !== null ? (
          <div className="mt-1.5 mb-1">
            <div className="h-1 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: statusColor }}
              />
            </div>
            <div className="flex justify-between items-center mt-0.5">
              <span className="text-[9px] text-gray-400 dark:text-slate-500">{remainingWeight}g sisa</span>
              <span
                className="text-[9px] font-semibold px-1 py-0.5 rounded"
                style={{
                  backgroundColor: statusColor + "22",
                  color: statusColor,
                }}
              >
                {statusLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex justify-end">
            <span
              className="text-[9px] font-semibold px-1 py-0.5 rounded"
              style={{
                backgroundColor: statusColor + "22",
                color: statusColor,
              }}
            >
              {statusLabel}
            </span>
          </div>
        )}

        {/* NFC indicator */}
        {spool.nfcTagId && (
          <div className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">📡 NFC</div>
        )}
      </div>
    </div>
  )
}
