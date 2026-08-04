import { GlassCard } from '@3pb/ui'

export function Default() {
  return (
    <GlassCard className="p-5">
      <div className="text-sm font-semibold">Ringkasan Biaya</div>
      <div className="text-xs" style={{ marginTop: 4, color: 'rgba(0,0,0,0.6)' }}>
        Total HPP dihitung otomatis dari bahan, waktu cetak, dan tenaga kerja.
      </div>
    </GlassCard>
  )
}
