// components/cyd-layout/GridCanvas.tsx
'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
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
    <div className="absolute z-10 top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg overflow-hidden w-28">
      <button onClick={() => { onPickPrinter(); onClose() }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-100">
        🖨️ Printer
      </button>
      <button onClick={() => { onPickLabel(); onClose() }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-100">
        🏷️ Label
      </button>
    </div>
  )
}

function EmptyCell({ col, row, onAddCell }: { col: number; row: number; onAddCell: (cell: LayoutCellOut) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${col}-${row}`, data: { type: 'cell', col, row } })

  return (
    <div
      ref={setNodeRef}
      className="relative border border-dashed flex items-center justify-center cursor-pointer"
      style={{ borderColor: isOver ? CYD_COLORS.purple : 'rgba(255,255,255,.2)', background: isOver ? `${CYD_COLORS.purple}22` : 'transparent' }}
      onClick={() => setMenuOpen((v) => !v)}
    >
      <span className="text-gray-500 text-lg select-none">+</span>
      {menuOpen && (
        <EmptyCellMenu
          onClose={() => setMenuOpen(false)}
          onPickPrinter={() => { /* drag-drop dari palette yang isi beneran; klik cuma buka petunjuk */ }}
          onPickLabel={() => onAddCell({ type: 'label', text: 'Label baru', col, row })}
        />
      )}
    </div>
  )
}

function ResizeHandle({ onResize }: { onResize: (deltaCol: number, deltaRow: number) => void }) {
  function handlePointerDown(startEvent: React.PointerEvent) {
    startEvent.stopPropagation()
    const startX = startEvent.clientX
    const startY = startEvent.clientY
    const cellEl = (startEvent.target as HTMLElement).closest('[data-cell-size]') as HTMLElement | null
    const cellW = cellEl?.offsetWidth ?? 50
    const cellH = cellEl?.offsetHeight ?? 50

    function handlePointerMove(moveEvent: PointerEvent) {
      const dCol = Math.round((moveEvent.clientX - startX) / cellW)
      const dRow = Math.round((moveEvent.clientY - startY) / cellH)
      onResize(dCol, dRow)
    }
    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{ position: 'absolute', bottom: -4, right: -4, width: 10, height: 10, background: CYD_COLORS.purple, borderRadius: 2, cursor: 'nwse-resize' }}
    />
  )
}

function FilledCell({ cell, index, isSelected, live, onSelect, onUpdateCell, gridCols, gridRows }: {
  cell: LayoutCellOut; index: number; isSelected: boolean; live: LivePrinterInfo | undefined; onSelect: () => void
  onUpdateCell: (index: number, cell: LayoutCellOut) => void; gridCols: number; gridRows: number
}) {
  const gridColumn = `${cell.col + 1} / span ${cell.colSpan ?? 1}`
  const gridRow = `${cell.row + 1} / span ${cell.rowSpan ?? 1}`

  function handleResize(deltaCol: number, deltaRow: number) {
    const maxColSpan = gridCols - cell.col
    const maxRowSpan = gridRows - cell.row
    const newColSpan = Math.max(1, Math.min(maxColSpan, (cell.colSpan ?? 1) + deltaCol))
    const newRowSpan = Math.max(1, Math.min(maxRowSpan, (cell.rowSpan ?? 1) + deltaRow))
    onUpdateCell(index, { ...cell, colSpan: newColSpan, rowSpan: newRowSpan })
  }

  if ('type' in cell) {
    return (
      <div
        data-cell-size
        onClick={onSelect}
        style={{ gridColumn, gridRow, background: '#050508', border: isSelected ? `2px solid ${CYD_COLORS.purple}` : '1px solid rgba(255,255,255,.15)', position: 'relative' }}
        className="flex items-center justify-center px-1 cursor-pointer"
      >
        <span style={{ color: CYD_COLORS.dim, fontFamily: 'monospace', fontSize: 13 }}>{cell.text}</span>
        {isSelected && <ResizeHandle onResize={handleResize} />}
      </div>
    )
  }

  const color = stateColor(live?.state ?? null)
  return (
    <div
      data-cell-size
      onClick={onSelect}
      style={{ gridColumn, gridRow, background: '#0a0a10', border: isSelected ? `2px solid ${CYD_COLORS.purple}` : '1px solid #1a1a22', position: 'relative' }}
      className="cursor-pointer overflow-hidden"
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: color }} />
      <div style={{ paddingLeft: 10, paddingTop: 4, fontFamily: 'monospace' }}>
        <div style={{ color: '#fff', fontSize: 15 }}>{cell.printer}</div>
        {live && <div style={{ color, fontSize: 12 }}>{live.state.toUpperCase()} {live.progress}%</div>}
        {!live && <div style={{ color: CYD_COLORS.dim, fontSize: 12 }}>— tak ada data —</div>}
      </div>
      {isSelected && <ResizeHandle onResize={handleResize} />}
    </div>
  )
}

function RowDivider({ rowIndex, onDrag }: { rowIndex: number; onDrag: (rowIndex: number, deltaFraction: number) => void }) {
  function handlePointerDown(startEvent: React.PointerEvent) {
    startEvent.stopPropagation()
    const startY = startEvent.clientY
    const container = (startEvent.target as HTMLElement).closest('[data-canvas-height]') as HTMLElement | null
    const containerH = container?.offsetHeight ?? 240

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaFraction = (moveEvent.clientY - startY) / containerH
      onDrag(rowIndex, deltaFraction)
    }
    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{ gridColumn: '1 / -1', gridRow: `${rowIndex + 1} / span 1`, alignSelf: 'end', height: 4, marginBottom: -2, background: CYD_COLORS.purple, cursor: 'ns-resize', zIndex: 5 }}
    />
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
    <div
      data-canvas-height
      style={{
        aspectRatio: '320 / 240',
        background: CYD_COLORS.bg,
        border: '2px solid #333',
        borderRadius: 4,
        display: 'grid',
        gridTemplateColumns: `repeat(${page.grid.cols}, 1fr)`,
        gridTemplateRows: rowWeights.map((w) => `${w}fr`).join(' '),
        gap: 1,
        width: '100%',
        maxWidth: 900,
        position: 'relative',
      }}
    >
      {Array.from({ length: page.grid.rows }, (_, row) =>
        Array.from({ length: page.grid.cols }, (_, col) => {
          const cellIndex = findCellAt(page.cells, col, row)
          if (cellIndex === null) {
            return <EmptyCell key={`${col}-${row}`} col={col} row={row} onAddCell={onAddCell} />
          }
          const cell = page.cells[cellIndex]
          // Cuma render sekali per cell multi-span, di posisi (cell.col, cell.row)-nya sendiri
          if (cell.col !== col || cell.row !== row) return null
          const live = 'printer' in cell ? livePrinters[cell.printer] : undefined
          return (
            <FilledCell
              key={`${col}-${row}`}
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
      {Array.from({ length: page.grid.rows - 1 }, (_, i) => (
        <RowDivider key={`divider-${i}`} rowIndex={i} onDrag={handleRowDrag} />
      ))}
    </div>
  )
}
