// components/cyd-layout/CellSettingsPanel.tsx
'use client'

import { motion } from 'framer-motion'
import type { LayoutCellOut, FieldPresetKey } from '@/lib/cyd-layout/types'
import { FIELD_PRESETS, LAYOUT_LIMITS } from '@/lib/cyd-layout/types'

// Preset per-SEL (override) dibatasi buffer tetap firmware (MAX_CELL_FIELD_ROWS=3) — beda dari
// batas default per-halaman (8). Preset yang row-nya lebih banyak dari itu ("Detail", 5 baris)
// difilter di sini supaya tidak bisa dipilih untuk sel individual sama sekali — kalau tetap
// dipaksa lewat, firmware nolak SELURUH config (bukan cuma sel ini) saat parse.
const CELL_OVERRIDE_PRESETS = (Object.keys(FIELD_PRESETS) as FieldPresetKey[]).filter(
  (key) => FIELD_PRESETS[key].length <= LAYOUT_LIMITS.maxRowsPerFieldsCellOverride
)
const PRESET_LABELS: Record<FieldPresetKey, string> = { ringkas: 'Ringkas', detail: 'Detail' }

// Batas kolom cuma sanity check editor (firmware bagi lebar layar / cols, tidak ada array
// tetap yang bisa overflow). Batas baris WAJIB <=8 — firmware nolak config kalau rows >
// MAX_GRID_ROWS (rowWeights[MAX_GRID_ROWS] array tetap di layout_types.h firmware).
const GRID_COLS_RANGE = { min: 1, max: 20 }
const GRID_ROWS_RANGE = { min: 1, max: 8 }

export function CellSettingsPanel({ cell, onUpdateCell, onRemoveCell, pageDurationSec, onUpdateDuration, activePageId, gridCols, gridRows, onUpdateGrid }: {
  cell: LayoutCellOut | null
  onUpdateCell: (cell: LayoutCellOut) => void
  onRemoveCell: () => void
  pageDurationSec: number
  onUpdateDuration: (seconds: number) => void
  activePageId: string
  gridCols: number
  gridRows: number
  onUpdateGrid: (updates: { cols?: number; rows?: number }) => void
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

  const isLabel = cell !== null && 'type' in cell && cell.type === 'label'

  return (
    <div className="w-48 flex-shrink-0 space-y-3">
      <div className="g-card rounded-2xl p-3 backdrop-blur-[12px]">
        <div className="mb-2 flex items-center justify-between">
          <span className="g-t3 text-[10px] font-semibold uppercase tracking-[0.14em]">Sel Terpilih</span>
          {/* Badge & konten seleksi SENGAJA pakai animasi CSS (.glass-page-enter, jalan di
              compositor), BUKAN AnimatePresence: rantai exit→enter mode="wait" bergantung
              callback penyelesaian yang butuh rAF tick — di window yang rAF-nya di-throttle
              (tab background/occluded, tool screenshot) rantai itu tak pernah selesai dan
              form seleksi tidak pernah mount. Remount via key tetap memutar animasinya. */}
          {cell && (
            <span
              key={isLabel ? 'label' : 'printer'}
              className={`glass-page-enter rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                isLabel
                  ? 'bg-amber-500/12 text-amber-600 dark:text-amber-300'
                  : 'bg-indigo-500/12 text-indigo-500 dark:text-indigo-300'
              }`}
            >
              {isLabel ? 'Label' : 'Printer'}
            </span>
          )}
        </div>

        {/* key = selectedCellKey → remount konten (input uncontrolled baca ulang defaultValue)
            setiap seleksi berpindah; animasi masuknya CSS .glass-page-enter (bukan
            AnimatePresence — lihat komentar badge di atas: konten form harus mount di commit
            React yang sama dengan perubahan seleksi, tanpa menunggu exit animation). */}
        <div key={selectedCellKey} className="glass-page-enter">
            {!cell && (
              <div className="rounded-xl border border-dashed px-2 py-5 text-center" style={{ borderColor: 'var(--g-dashed)' }}>
                <motion.div
                  className="mb-1 text-lg"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  👆
                </motion.div>
                <p className="g-t3 text-[11px] leading-relaxed">Klik sel di canvas untuk mengatur</p>
              </div>
            )}

            {cell && !('type' in cell && cell.type === 'label') && (
              <div className="space-y-2.5">
                {'printer' in cell && <p className="g-t2 truncate font-mono text-xs">{cell.printer}</p>}
                <label className="g-t2 block text-xs">
                  Field preset
                  <select
                    className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
                    onChange={(e) => handlePresetChange(e.target.value as FieldPresetKey)}
                  >
                    {CELL_OVERRIDE_PRESETS.map((key) => (
                      <option key={key} value={key}>{PRESET_LABELS[key]}</option>
                    ))}
                  </select>
                  {CELL_OVERRIDE_PRESETS.length < Object.keys(FIELD_PRESETS).length && (
                    <span className="g-t4 mt-1 block text-[10px] leading-relaxed">
                      Preset dengan baris lebih banyak cuma bisa jadi default halaman, bukan per-sel (batas firmware).
                    </span>
                  )}
                </label>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onRemoveCell}
                  className="w-full rounded-[5px] border border-red-500/25 bg-red-500/5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
                >
                  Hapus dari grid
                </motion.button>
              </div>
            )}

            {cell && 'type' in cell && cell.type === 'label' && (
              <div className="space-y-2.5">
                <label className="g-t2 block text-xs">
                  Teks label
                  <input
                    defaultValue={cell.text}
                    onBlur={(e) => onUpdateCell({ ...cell, text: e.target.value })}
                    className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
                  />
                </label>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onRemoveCell}
                  className="w-full rounded-[5px] border border-red-500/25 bg-red-500/5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
                >
                  Hapus dari grid
                </motion.button>
              </div>
            )}
        </div>
      </div>

      <div className="g-card rounded-2xl p-3 backdrop-blur-[12px]">
        <div className="g-t3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]">Halaman</div>
        <label className="g-t2 block text-xs">
          Durasi rotasi (detik, 0 = statis)
          <input
            key={pageDurationSec}
            type="number"
            min={0}
            defaultValue={pageDurationSec}
            onBlur={(e) => onUpdateDuration(Number(e.target.value))}
            className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
          />
        </label>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <label className="g-t2 block text-xs">
            Kolom
            <input
              key={`cols-${activePageId}-${gridCols}`}
              type="number"
              min={GRID_COLS_RANGE.min}
              max={GRID_COLS_RANGE.max}
              defaultValue={gridCols}
              onBlur={(e) => {
                const clamped = Math.min(GRID_COLS_RANGE.max, Math.max(GRID_COLS_RANGE.min, Number(e.target.value) || gridCols))
                onUpdateGrid({ cols: clamped })
              }}
              className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
            />
          </label>
          <label className="g-t2 block text-xs">
            Baris
            <input
              key={`rows-${activePageId}-${gridRows}`}
              type="number"
              min={GRID_ROWS_RANGE.min}
              max={GRID_ROWS_RANGE.max}
              defaultValue={gridRows}
              onBlur={(e) => {
                const clamped = Math.min(GRID_ROWS_RANGE.max, Math.max(GRID_ROWS_RANGE.min, Number(e.target.value) || gridRows))
                onUpdateGrid({ rows: clamped })
              }}
              className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
            />
          </label>
        </div>
        <p className="g-t4 mt-1.5 text-[10px] leading-relaxed">Maks {GRID_ROWS_RANGE.max} baris (batas firmware). Ubah ukuran mereset penyesuaian tinggi baris manual.</p>
      </div>
    </div>
  )
}
