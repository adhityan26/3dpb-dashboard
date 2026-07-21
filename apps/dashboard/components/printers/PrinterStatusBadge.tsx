import { stateColor, CYD_COLORS } from '@/lib/cyd-layout/colors'

export function PrinterStatusBadge({ state }: { state: string | null }) {
  const label = state ? state.toUpperCase() : 'Offline'
  const color = state ? stateColor(state) : CYD_COLORS.dim
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: color }}
    >
      {label}
    </span>
  )
}
