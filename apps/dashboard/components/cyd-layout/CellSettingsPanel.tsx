// components/cyd-layout/CellSettingsPanel.tsx
'use client'

import type { LayoutCellOut, FieldPresetKey } from '@/lib/cyd-layout/types'
import { FIELD_PRESETS } from '@/lib/cyd-layout/types'

export function CellSettingsPanel({ cell, onUpdateCell, onRemoveCell, pageDurationSec, onUpdateDuration, activePageId }: {
  cell: LayoutCellOut | null
  onUpdateCell: (cell: LayoutCellOut) => void
  onRemoveCell: () => void
  pageDurationSec: number
  onUpdateDuration: (seconds: number) => void
  activePageId: string
}) {
  function handlePresetChange(preset: FieldPresetKey) {
    if (!cell || ('type' in cell && cell.type === 'label')) return
    onUpdateCell({ ...cell, fields: FIELD_PRESETS[preset] })
  }

  // Identitas unik sel terpilih — dipakai sebagai React key agar input
  // uncontrolled (defaultValue) remount & baca ulang nilai saat seleksi
  // berpindah ke sel lain (bukan cuma re-render dengan prop baru). Posisi
  // (col/row) saja tidak cukup: dua halaman berbeda bisa punya sel di
  // koordinat yang sama (mis. label sudut yang sama-sama masih teks default
  // "Label baru" sebelum diedit) — activePageId (unik per skema) dilipat ke
  // key ini di kedua cabang supaya ganti halaman selalu memicu remount.
  function getSelectedCellKey(): string {
    if (!cell) return 'none'
    if ('type' in cell) return `label-${activePageId}-${cell.col}-${cell.row}`
    return `printer-${activePageId}-${cell.col}-${cell.row}-${cell.printer}`
  }
  const selectedCellKey = getSelectedCellKey()

  return (
    <div className="w-44 flex-shrink-0 space-y-4">
      <div key={selectedCellKey}>
        <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold mb-1">Sel Terpilih</div>
        {!cell && <div className="text-xs text-gray-400 dark:text-slate-500">Klik sel di canvas</div>}
        {cell && !('type' in cell && cell.type === 'label') && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 dark:text-slate-400 block">
              Field preset
              <select
                className="w-full mt-1 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                onChange={(e) => handlePresetChange(e.target.value as FieldPresetKey)}
              >
                <option value="ringkas">Ringkas</option>
                <option value="detail">Detail</option>
              </select>
            </label>
            <button onClick={onRemoveCell} className="text-xs text-red-400 hover:text-red-600">Hapus dari grid</button>
          </div>
        )}
        {cell && 'type' in cell && cell.type === 'label' && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 dark:text-slate-400 block">
              Teks label
              <input
                defaultValue={cell.text}
                onBlur={(e) => onUpdateCell({ ...cell, text: e.target.value })}
                className="w-full mt-1 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
              />
            </label>
            <button onClick={onRemoveCell} className="text-xs text-red-400 hover:text-red-600">Hapus dari grid</button>
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold mb-1">Halaman</div>
        <label className="text-xs text-gray-500 dark:text-slate-400 block">
          Durasi rotasi (detik, 0 = statis)
          <input
            key={pageDurationSec}
            type="number"
            min={0}
            defaultValue={pageDurationSec}
            onBlur={(e) => onUpdateDuration(Number(e.target.value))}
            className="w-full mt-1 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
          />
        </label>
      </div>
    </div>
  )
}
