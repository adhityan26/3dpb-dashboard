import { GlassInput } from '@3pb/ui'

export function Default() {
  return <GlassInput placeholder="Nama produk" defaultValue="Vas Bunga Geometris" />
}

export function Number() {
  return <GlassInput type="number" placeholder="0" defaultValue={150} />
}

export function Empty() {
  return <GlassInput placeholder="Cari produk..." />
}
