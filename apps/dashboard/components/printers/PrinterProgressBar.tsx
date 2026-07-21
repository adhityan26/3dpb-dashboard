import { stateColor } from '@/lib/cyd-layout/colors'

export function PrinterProgressBar({ progress, state }: { progress: number; state: string | null }) {
  const color = stateColor(state)
  const pct = Math.max(0, Math.min(100, progress))
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
