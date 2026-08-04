import { HexColorSwatch } from '@3pb/ui'

export function Default() {
  return (
    <div className="flex gap-2" style={{ padding: 8 }}>
      <HexColorSwatch color="#ef4444" />
      <HexColorSwatch color="#4f46e5" />
      <HexColorSwatch color="#10b981" />
      <HexColorSwatch color="#f59e0b" />
    </div>
  )
}

export function InvalidColor() {
  return (
    <div style={{ padding: 8, fontSize: 12, color: 'rgba(0,0,0,0.5)' }}>
      (tidak render apapun jika hex tidak valid — lihat "not-a-color")
      <HexColorSwatch color="not-a-color" />
    </div>
  )
}
