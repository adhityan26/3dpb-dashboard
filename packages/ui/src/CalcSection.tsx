import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

export interface CalcSectionProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  subtotalLabel?: string
  /** Sudah diformat caller (mis. "Rp29.370") — package ini tidak coupling ke formatter currency apapun. */
  subtotal?: string
  /** Slot kanan-atas tambahan, sejajar badge subtotal (mis. tombol Import 3MF di dashboard). */
  headerExtra?: ReactNode
  children: ReactNode
}

export function CalcSection({
  title, subtitle, icon, subtotalLabel = 'Subtotal', subtotal, headerExtra, children,
}: CalcSectionProps) {
  return (
    <GlassCard className="p-5 min-w-0">
      <div className="flex flex-col gap-3">
        {/* Baris judul — SENDIRI, tidak berbagi ruang horizontal dengan headerExtra/subtotal,
            biar judul (mis. "PRODUKSI (CETAK 3D)") tidak ke-wrap gara-gara diperas elemen lain. */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-9 h-9 rounded-[5px] grid place-items-center text-[16px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--g-accent) 15%, transparent)', color: 'var(--g-accent)' }}>
            {icon}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-bold g-t1 tracking-wide uppercase">{title}</span>
            {subtitle && <span className="block text-[11px] g-t3 mt-0.5">{subtitle}</span>}
          </span>
        </div>
        {(headerExtra || subtotal !== undefined) && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {headerExtra}
            {subtotal !== undefined && (
              <span className="shrink-0 text-right rounded-[5px] border px-3 py-1.5" style={{ borderColor: 'var(--g-row-border)' }}>
                <span className="block text-[9px] g-t4 uppercase tracking-wide">{subtotalLabel}</span>
                <span className="block text-[15px] font-bold g-t1" style={{ fontVariantNumeric: 'tabular-nums' }}>{subtotal}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </GlassCard>
  )
}
