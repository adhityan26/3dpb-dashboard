import { GlassButton } from '@3pb/ui'

export function Default() {
  return <GlassButton>Simpan</GlassButton>
}

export function Disabled() {
  return <GlassButton disabled>Simpan</GlassButton>
}

export function WithIcon() {
  return (
    <GlassButton>
      <span style={{ marginRight: 6 }}>+</span>
      Tambah Item
    </GlassButton>
  )
}
