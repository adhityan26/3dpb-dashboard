'use client'

import { useEffect, useRef, useState } from 'react'
import { isValidHexColor } from './HexColorSwatch'

export interface HexColorPickerOption {
  id: string
  colorName: string
  colorHex: string
}

interface HexColorPickerProps {
  /** Hex warna yang lagi aktif di field ini (buat highlight opsi yang match) */
  color: string
  /** Daftar warna katalog buat brand+material yang lagi dipilih, sudah di-sort oleh caller */
  options: HexColorPickerOption[]
  onSelect: (hex: string) => void
  className?: string
}

/** Swatch warna yang jadi tombol trigger popover daftar warna katalog.
 *  Text input hex manual di sekitar komponen ini TIDAK digantikan — ini cuma shortcut opsional. */
export function HexColorPicker({ color, options, onSelect, className = '' }: HexColorPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-3 h-3 rounded-full flex-shrink-0 cursor-pointer"
        style={
          isValidHexColor(color)
            ? { background: color, border: '1px solid rgba(255,255,255,0.25)' }
            : { border: '1px dashed rgba(255,255,255,0.35)' }
        }
        aria-label="Pilih warna dari katalog"
        title="Pilih warna dari katalog"
      />

      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 w-56 rounded-[10px] shadow-xl overflow-hidden"
          style={{ background: 'rgba(22,23,38,0.97)', border: '1px solid rgba(99,102,241,0.2)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          <div className="max-h-48 overflow-y-auto p-1">
            {options.length === 0 && (
              <div className="text-[10px] text-center py-3 px-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Tidak ada warna terkatalog untuk kombinasi ini
              </div>
            )}
            {options.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelect(o.colorHex); setOpen(false) }}
                className="w-full text-left px-2 py-1.5 rounded-[6px] text-xs flex items-center gap-2 transition-all"
                style={
                  o.colorHex.toLowerCase() === color.trim().toLowerCase()
                    ? { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }
                    : { color: 'rgba(255,255,255,0.85)' }
                }
              >
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ background: o.colorHex, border: '1px solid rgba(255,255,255,0.25)' }}
                />
                <span className="flex-1 truncate">{o.colorName}</span>
                <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{o.colorHex}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
