// components/cyd-layout/CellSettingsPanel.tsx
'use client'

import type { LayoutCellOut, FieldPresetKey } from '@/lib/cyd-layout/types'
import { FIELD_PRESETS } from '@/lib/cyd-layout/types'

export function CellSettingsPanel({ cell, onUpdateCell, onRemoveCell, pageDurationSec, onUpdateDuration }: {
  cell: LayoutCellOut | null
  onUpdateCell: (cell: LayoutCellOut) => void
  onRemoveCell: () => void
  pageDurationSec: number
  onUpdateDuration: (seconds: number) => void
}) {
  function handlePresetChange(preset: FieldPresetKey) {
    if (!cell || ('type' in cell && cell.type === 'label')) return
    onUpdateCell({ ...cell, fields: FIELD_PRESETS[preset] })
  }

  return (
    <div className="w-44 flex-shrink-0 space-y-4">
      <div>
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
