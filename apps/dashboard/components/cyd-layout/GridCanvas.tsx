// components/cyd-layout/GridCanvas.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { motion, AnimatePresence } from 'framer-motion'
import type { LayoutPageOut, LayoutCellOut } from '@/lib/cyd-layout/types'
import { CYD_COLORS, stateColor } from '@/lib/cyd-layout/colors'

interface LivePrinterInfo {
  state: string
  progress: number
}

interface GridCanvasProps {
  page: LayoutPageOut
  livePrinters: Record<string, LivePrinterInfo>
  selectedCellIndex: number | null
  onSelectCell: (index: number | null) => void
  onAddCell: (cell: LayoutCellOut) => void
  onUpdateCell: (index: number, cell: LayoutCellOut) => void
  onUpdatePage: (updates: Partial<LayoutPageOut>) => void
}

// Aksen editor (chrome) — indigo design system. Warna KONTEN canvas tetap CYD_COLORS (fidelitas firmware).
const ACCENT = '#6366f1'

// Posisi grid (col,row) -> index cell yang menempati situ (kalau ada), null kalau kosong.
function findCellAt(cells: LayoutCellOut[], col: number, row: number): number | null {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const colSpan = c.colSpan ?? 1
    const rowSpan = c.rowSpan ?? 1
    if (col >= c.col && col < c.col + colSpan && row >= c.row && row < c.row + rowSpan) return i
  }
  return null
}

function EmptyCellMenu({ onPickPrinter, onPickLabel, onClose }: { onPickPrinter: () => void; onPickLabel: () => void; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -2, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      className="absolute left-0 top-full z-20 mt-1.5 w-32 overflow-hidden rounded-lg border border-black/10 bg-white/95 shadow-xl backdrop-blur-xl dark:border-indigo-500/25 dark:bg-[#12122a]/95"
    >
      <button
        onClick={() => { onPickPrinter(); onClose() }}
        className="w-full px-2.5 py-2 text-left text-xs text-gray-800 transition-colors hover:bg-indigo-500/10 dark:text-slate-100"
      >
        🖨️ Printer
      </button>
      <button
        onClick={() => { onPickLabel(); onClose() }}
        className="w-full px-2.5 py-2 text-left text-xs text-gray-800 transition-colors hover:bg-indigo-500/10 dark:text-slate-100"
      >
        🏷️ Label
      </button>
    </motion.div>
  )
}

function EmptyCell({ col, row, onAddCell }: { col: number; row: number; onAddCell: (cell: LayoutCellOut) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${col}-${row}`, data: { type: 'cell', col, row } })

  return (
    <div
      ref={setNodeRef}
      className="group relative flex cursor-pointer items-center justify-center border border-dashed transition-colors duration-150"
      style={{
        gridColumn: `${col + 1} / span 1`,
        gridRow: `${row + 1} / span 1`,
        borderColor: isOver ? ACCENT : 'rgba(255,255,255,.14)',
        background: isOver ? 'rgba(99,102,241,0.16)' : 'transparent',
      }}
      onClick={() => setMenuOpen((v) => !v)}
    >
      <motion.span
        animate={{ scale: isOver ? 1.5 : 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 26 }}
        className={`select-none text-lg leading-none transition-opacity duration-150 ${isOver ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ color: isOver ? '#a5b4fc' : 'rgba(255,255,255,0.3)' }}
      >
        +
      </motion.span>
      <AnimatePresence>
        {menuOpen && (
          <EmptyCellMenu
            onClose={() => setMenuOpen(false)}
            onPickPrinter={() => { /* drag-drop dari palette yang isi beneran; klik cuma buka petunjuk */ }}
            onPickLabel={() => onAddCell({ type: 'label', text: 'Label baru', col, row })}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ResizeHandle({ onResize }: { onResize: (deltaCol: number, deltaRow: number) => void }) {
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  function handlePointerDown(startEvent: React.PointerEvent) {
    startEvent.stopPropagation()
    const startX = startEvent.clientX
    const startY = startEvent.clientY
    const cellEl = (startEvent.target as HTMLElement).closest('[data-cell-size]') as HTMLElement | null
    const cellW = cellEl?.offsetWidth ?? 50
    const cellH = cellEl?.offsetHeight ?? 50

    function handlePointerMove(moveEvent: PointerEvent) {
      if (!mountedRef.current) { cleanup(); return }
      const dCol = Math.round((moveEvent.clientX - startX) / cellW)
      const dRow = Math.round((moveEvent.clientY - startY) / cellH)
      onResize(dCol, dRow)
    }
    function handlePointerUp() {
      cleanup()
    }
    function cleanup() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <motion.div
      onPointerDown={handlePointerDown}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.35 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      style={{
        position: 'absolute', bottom: -5, right: -5, width: 12, height: 12,
        background: ACCENT, borderRadius: 9999, border: '2px solid rgba(255,255,255,0.9)',
        boxShadow: '0 2px 8px rgba(99,102,241,0.55)', cursor: 'nwse-resize', zIndex: 6, touchAction: 'none',
      }}
    />
  )
}

// Ring seleksi via boxShadow (bukan ganti tebal border) — transisi mulus, tanpa layout shift,
// dan tidak menyentuh warna konten canvas.
const SELECTED_RING = `0 0 0 2px rgba(99,102,241,1), 0 0 18px rgba(99,102,241,0.45)`
const UNSELECTED_RING = `0 0 0 0px rgba(99,102,241,0), 0 0 0px rgba(99,102,241,0)`
// Ring target-tukar (amber) — beda warna dari SELECTED_RING (indigo) biar tidak ketuker maknanya.
const SWAP_TARGET_RING = `0 0 0 2px rgba(245,158,11,0.9), 0 0 20px rgba(245,158,11,0.5)`

// Preview drag utk sel kanvas yang sudah terisi (DragOverlay di page.tsx) — versi ringkas,
// dipakai lepas dari pohon FilledCell (bukan dari useDraggable-nya langsung).
export function CanvasCellPreview({ cell }: { cell: LayoutCellOut }) {
  const isLabel = 'type' in cell
  return (
    <div
      style={{
        width: 96,
        padding: '8px 10px',
        background: isLabel ? '#050508' : '#0a0a10',
        border: '1px solid rgba(99,102,241,0.7)',
        borderRadius: 4,
        boxShadow: '0 14px 32px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(99,102,241,0.6)',
        transform: 'scale(1.05) rotate(-1deg)',
        fontFamily: 'monospace',
        fontSize: 12,
        color: isLabel ? CYD_COLORS.dim : '#fff',
      }}
    >
      {isLabel ? cell.text : cell.printer}
    </div>
  )
}

function FilledCell({ cell, index, isSelected, live, onSelect, onUpdateCell, gridCols, gridRows }: {
  cell: LayoutCellOut; index: number; isSelected: boolean; live: LivePrinterInfo | undefined; onSelect: () => void
  onUpdateCell: (index: number, cell: LayoutCellOut) => void; gridCols: number; gridRows: number
}) {
  const gridColumn = `${cell.col + 1} / span ${cell.colSpan ?? 1}`
  const gridRow = `${cell.row + 1} / span ${cell.rowSpan ?? 1}`

  // Sel terisi bisa DI-drag (pindah/tukar posisi) sekaligus jadi target DROP (buat ditukar
  // sama sel lain yang di-drag ke sini) — dua hook beda, node DOM sama, ref digabung di bawah.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `canvas-cell-drag-${index}`,
    data: { type: 'canvas-cell', cellIndex: index },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `canvas-cell-drop-${index}`,
    data: { type: 'cell', col: cell.col, row: cell.row, cellIndex: index },
  })
  const setNodeRef = useCallback((node: HTMLElement | null) => { setDragRef(node); setDropRef(node) }, [setDragRef, setDropRef])

  function handleResize(deltaCol: number, deltaRow: number) {
    const maxColSpan = gridCols - cell.col
    const maxRowSpan = gridRows - cell.row
    const newColSpan = Math.max(1, Math.min(maxColSpan, (cell.colSpan ?? 1) + deltaCol))
    const newRowSpan = Math.max(1, Math.min(maxRowSpan, (cell.rowSpan ?? 1) + deltaRow))
    onUpdateCell(index, { ...cell, colSpan: newColSpan, rowSpan: newRowSpan })
  }

  const ring = isOver ? SWAP_TARGET_RING : isSelected ? SELECTED_RING : UNSELECTED_RING
  const motionProps = {
    ref: setNodeRef,
    onClick: onSelect,
    ...listeners,
    ...attributes,
    initial: { opacity: 0, scale: 0.85 },
    animate: { opacity: isDragging ? 0.35 : 1, scale: isOver ? 1.03 : 1, boxShadow: ring },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15, ease: 'easeIn' as const } },
    transition: { type: 'spring' as const, stiffness: 380, damping: 26, boxShadow: { duration: 0.18 } },
  }

  if ('type' in cell) {
    return (
      <motion.div
        data-cell-size
        {...motionProps}
        // Warna konten (bg/border/teks) = fidelitas firmware — JANGAN diubah.
        style={{ gridColumn, gridRow, background: '#050508', border: '1px solid rgba(255,255,255,.15)', position: 'relative', zIndex: isSelected ? 2 : 1 }}
        className="flex touch-none cursor-grab items-center justify-center px-1 active:cursor-grabbing"
      >
        <span style={{ color: CYD_COLORS.dim, fontFamily: 'monospace', fontSize: 13 }}>{cell.text}</span>
        {isSelected && <ResizeHandle onResize={handleResize} />}
      </motion.div>
    )
  }

  const color = stateColor(live?.state ?? null)
  return (
    <motion.div
      data-cell-size
      {...motionProps}
      // Warna konten (bg/border/strip status/teks) = fidelitas firmware — JANGAN diubah.
      style={{ gridColumn, gridRow, background: '#0a0a10', border: '1px solid #1a1a22', position: 'relative', zIndex: isSelected ? 2 : 1 }}
      className="touch-none cursor-grab overflow-hidden active:cursor-grabbing"
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: color }} />
      <div style={{ paddingLeft: 10, paddingTop: 4, fontFamily: 'monospace' }}>
        <div style={{ color: '#fff', fontSize: 15 }}>{cell.printer}</div>
        {live && <div style={{ color, fontSize: 12 }}>{live.state.toUpperCase()} {live.progress}%</div>}
        {!live && <div style={{ color: CYD_COLORS.dim, fontSize: 12 }}>— tak ada data —</div>}
      </div>
      {isSelected && <ResizeHandle onResize={handleResize} />}
    </motion.div>
  )
}

function RowDivider({ rowIndex, onDrag }: { rowIndex: number; onDrag: (rowIndex: number, deltaFraction: number) => void }) {
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  function handlePointerDown(startEvent: React.PointerEvent) {
    startEvent.stopPropagation()
    const startY = startEvent.clientY
    const container = (startEvent.target as HTMLElement).closest('[data-canvas-height]') as HTMLElement | null
    const containerH = container?.offsetHeight ?? 240

    function handlePointerMove(moveEvent: PointerEvent) {
      if (!mountedRef.current) { cleanup(); return }
      const deltaFraction = (moveEvent.clientY - startY) / containerH
      onDrag(rowIndex, deltaFraction)
    }
    function handlePointerUp() {
      cleanup()
    }
    function cleanup() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      className="group flex items-center"
      style={{ gridColumn: '1 / -1', gridRow: `${rowIndex + 1} / span 1`, alignSelf: 'end', height: 10, marginBottom: -5, cursor: 'ns-resize', zIndex: 5, touchAction: 'none' }}
    >
      <div className="h-[2px] w-full rounded-full bg-white/15 transition-all duration-150 group-hover:h-[3px] group-hover:bg-indigo-400 group-hover:shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
    </div>
  )
}

export function GridCanvas({ page, livePrinters, selectedCellIndex, onSelectCell, onAddCell, onUpdateCell, onUpdatePage }: GridCanvasProps) {
  const rowWeights = page.grid.rowWeights ?? Array.from({ length: page.grid.rows }, () => 1 / page.grid.rows)

  function handleRowDrag(rowIndex: number, deltaFraction: number) {
    const next = [...rowWeights]
    const minWeight = 0.02
    const amount = Math.max(-(next[rowIndex] - minWeight), Math.min(next[rowIndex + 1] - minWeight, deltaFraction))
    next[rowIndex] += amount
    next[rowIndex + 1] -= amount
    onUpdatePage({ grid: { ...page.grid, rowWeights: next } })
  }

  return (
    <div className="w-full" style={{ maxWidth: 940 }}>
      {/* Bezel device — chrome editor, meniru fisik LCD. Layar di dalamnya tetap warna firmware. */}
      <div
        className="rounded-[20px] p-2.5"
        style={{
          background: 'linear-gradient(160deg, #23232e 0%, #15151c 60%, #101016 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 16px 44px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.09)',
        }}
      >
        <div
          data-canvas-height
          style={{
            aspectRatio: '320 / 240',
            background: CYD_COLORS.bg, // warna layar persis firmware — JANGAN diubah
            border: '1px solid #333',
            borderRadius: 4,
            display: 'grid',
            gridTemplateColumns: `repeat(${page.grid.cols}, 1fr)`,
            gridTemplateRows: rowWeights.map((w) => `${w}fr`).join(' '),
            gap: 1,
            width: '100%',
            position: 'relative',
          }}
        >
          <AnimatePresence>
            {Array.from({ length: page.grid.rows }, (_, row) =>
              Array.from({ length: page.grid.cols }, (_, col) => {
                const cellIndex = findCellAt(page.cells, col, row)
                if (cellIndex === null) {
                  return <EmptyCell key={`empty-${col}-${row}`} col={col} row={row} onAddCell={onAddCell} />
                }
                const cell = page.cells[cellIndex]
                // Cuma render sekali per cell multi-span, di posisi (cell.col, cell.row)-nya sendiri
                if (cell.col !== col || cell.row !== row) return null
                const live = 'printer' in cell ? livePrinters[cell.printer] : undefined
                // Key by identitas cell (bukan posisi murni) supaya AnimatePresence bisa mainkan
                // exit animation saat cell dihapus — EmptyCell pengganti punya prefix key beda.
                const cellKey = 'printer' in cell ? `cell-p-${cell.printer}` : `cell-l-${cell.col}-${cell.row}`
                return (
                  <FilledCell
                    key={cellKey}
                    cell={cell}
                    index={cellIndex}
                    isSelected={selectedCellIndex === cellIndex}
                    live={live}
                    onSelect={() => onSelectCell(cellIndex)}
                    onUpdateCell={onUpdateCell}
                    gridCols={page.grid.cols}
                    gridRows={page.grid.rows}
                  />
                )
              })
            )}
          </AnimatePresence>

          {page.cells.length === 0 && (
            <motion.div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5"
              style={{ zIndex: 4 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.3 }}
            >
              <motion.span
                className="text-2xl"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                🖨️
              </motion.span>
              <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Tarik printer ke sini, atau klik sel untuk label
              </span>
            </motion.div>
          )}

          {Array.from({ length: page.grid.rows - 1 }, (_, i) => (
            <RowDivider key={`divider-${i}`} rowIndex={i} onDrag={handleRowDrag} />
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between px-1.5">
        <span className="g-t4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Preview CYD
        </span>
        <span className="g-t4 font-mono text-[10px]">320×240 • grid {page.grid.cols}×{page.grid.rows}</span>
      </div>
    </div>
  )
}
