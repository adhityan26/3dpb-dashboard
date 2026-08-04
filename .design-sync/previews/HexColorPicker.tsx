import { useState } from 'react'
import { HexColorPicker } from '@3pb/ui'

const OPTIONS = [
  { id: '1', colorName: 'Merah PLA', colorHex: '#ef4444' },
  { id: '2', colorName: 'Indigo PLA', colorHex: '#4f46e5' },
  { id: '3', colorName: 'Hijau PETG', colorHex: '#10b981' },
  { id: '4', colorName: 'Kuning ABS', colorHex: '#f59e0b' },
]

export function Default() {
  const [color, setColor] = useState('#4f46e5')
  return (
    <div className="relative" style={{ padding: 40 }}>
      <HexColorPicker color={color} options={OPTIONS} onSelect={setColor} />
    </div>
  )
}

export function NoOptions() {
  const [color, setColor] = useState('#000000')
  return (
    <div className="relative" style={{ padding: 40 }}>
      <HexColorPicker color={color} options={[]} onSelect={setColor} />
    </div>
  )
}
