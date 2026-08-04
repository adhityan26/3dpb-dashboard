import { CalcSection, GlassInput } from '@3pb/ui'

export function Default() {
  return (
    <CalcSection title="Produksi (Cetak 3D)" subtitle="Bahan, waktu, dan tenaga kerja" icon="🖨️" subtotal="Rp29.370">
      <div className="flex flex-col gap-2">
        <GlassInput placeholder="Berat filament (gram)" defaultValue={85} />
        <GlassInput placeholder="Waktu cetak (jam)" defaultValue="3.5" />
      </div>
    </CalcSection>
  )
}

export function WithHeaderExtra() {
  return (
    <CalcSection
      title="Material & Warna"
      icon="🎨"
      subtotalLabel="Total bahan"
      subtotal="Rp12.500"
      headerExtra={<span className="text-xs" style={{ color: 'var(--g-accent)' }}>Import 3MF</span>}
    >
      <div className="text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>PLA · Merah · 1.2kg spool</div>
    </CalcSection>
  )
}
