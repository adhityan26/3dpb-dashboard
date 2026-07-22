// components/cyd-layout/CellSettingsPanel.tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'
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

  const isLabel = cell !== null && 'type' in cell && cell.type === 'label'

  return (
    <div className="w-48 flex-shrink-0 space-y-3">
      <div className="g-card rounded-2xl p-3 backdrop-blur-[12px]">
        <div className="mb-2 flex items-center justify-between">
          <span className="g-t3 text-[10px] font-semibold uppercase tracking-[0.14em]">Sel Terpilih</span>
          <AnimatePresence mode="wait" initial={false}>
            {cell && (
              <motion.span
                key={isLabel ? 'label' : 'printer'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  isLabel
                    ? 'bg-amber-500/12 text-amber-600 dark:text-amber-300'
                    : 'bg-indigo-500/12 text-indigo-500 dark:text-indigo-300'
                }`}
              >
                {isLabel ? 'Label' : 'Printer'}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* key = selectedCellKey → remount konten (input uncontrolled baca ulang defaultValue)
            setiap seleksi berpindah; AnimatePresence menambahkan transisi mulus di momen itu. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selectedCellKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
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
                    className="glass-input mt-1 w-full rounded-[8px] px-2 py-1.5 text-xs"
                    onChange={(e) => handlePresetChange(e.target.value as FieldPresetKey)}
                  >
                    <option value="ringkas">Ringkas</option>
                    <option value="detail">Detail</option>
                  </select>
                </label>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onRemoveCell}
                  className="w-full rounded-[8px] border border-red-500/25 bg-red-500/5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
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
                    className="glass-input mt-1 w-full rounded-[8px] px-2 py-1.5 text-xs"
                  />
                </label>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onRemoveCell}
                  className="w-full rounded-[8px] border border-red-500/25 bg-red-500/5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
                >
                  Hapus dari grid
                </motion.button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
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
            className="glass-input mt-1 w-full rounded-[8px] px-2 py-1.5 text-xs"
          />
        </label>
      </div>
    </div>
  )
}
