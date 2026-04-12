import type { SpoolsResponse } from "@/lib/filamen/types"
import { SPOOL_STATUS_LABELS, SPOOL_STATUS_COLORS } from "@/lib/filamen/types"

export function SpoolKpiBar({ kpi }: { kpi: SpoolsResponse["kpi"] }) {
  const items = [
    { key: "total", label: "Total Spool", value: kpi.total, color: "#94a3b8" },
    { key: "new", label: SPOOL_STATUS_LABELS.new, value: kpi.byStatus.new, color: SPOOL_STATUS_COLORS.new },
    { key: "full", label: SPOOL_STATUS_LABELS.full, value: kpi.byStatus.full, color: SPOOL_STATUS_COLORS.full },
    { key: "mid", label: SPOOL_STATUS_LABELS.mid, value: kpi.byStatus.mid, color: SPOOL_STATUS_COLORS.mid },
    { key: "low", label: SPOOL_STATUS_LABELS.low, value: kpi.byStatus.low, color: SPOOL_STATUS_COLORS.low },
    { key: "empty", label: SPOOL_STATUS_LABELS.empty, value: kpi.byStatus.empty, color: SPOOL_STATUS_COLORS.empty },
  ]

  return (
    <div className="grid grid-cols-6 gap-px bg-gray-200 rounded-lg overflow-hidden">
      {items.map((item) => (
        <div key={item.key} className="bg-white px-3 py-3 text-center">
          <div className="text-xl font-bold" style={{ color: item.color }}>
            {item.value}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
