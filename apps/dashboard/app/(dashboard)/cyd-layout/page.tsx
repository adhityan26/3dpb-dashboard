'use client'

import { useEffect, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { PageShell } from '@/components/layout/PageShell'
import { PrinterPalette, PrinterCardPreview, type PaletteItem } from '@/components/cyd-layout/PrinterPalette'
import { GridCanvas, CanvasCellPreview } from '@/components/cyd-layout/GridCanvas'
import { PageTabs } from '@/components/cyd-layout/PageTabs'
import { CellSettingsPanel } from '@/components/cyd-layout/CellSettingsPanel'
import { FIELD_PRESETS } from '@/lib/cyd-layout/types'
import type { LayoutConfigOut, LayoutPageOut, LayoutCellOut } from '@/lib/cyd-layout/types'

const DEFAULT_CONFIG: LayoutConfigOut = {
  schemaVersion: 1,
  pages: [
    { id: 'rack', grid: { cols: 10, rows: 8 }, fields: FIELD_PRESETS.ringkas, durationSec: 0, cells: [] },
  ],
}

interface LiveMap { [printerId: string]: { state: string; progress: number } }

export default function CydLayoutPage() {
  const [config, setConfig] = useState<LayoutConfigOut>(DEFAULT_CONFIG)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null)
  const [liveMap, setLiveMap] = useState<LiveMap>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'confirmed' | 'timeout' | 'error'>('idle')
  const [draggingPrinter, setDraggingPrinter] = useState<PaletteItem | null>(null)
  const [draggingCanvasCell, setDraggingCanvasCell] = useState<LayoutCellOut | null>(null)
  // distance:4 supaya klik-biasa (buat select) tetap bisa dibedakan dari drag di FilledCell —
  // tanpa ini, PointerSensor default mulai drag pada gerakan sekecil apa pun, menelan onClick.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  // Monotonic counter for generating new page ids — never reused even after a page is removed,
  // so a later add can't collide with an id still (or previously) present in `config.pages`.
  const nextPageNumberRef = useRef(DEFAULT_CONFIG.pages.length + 1)

  useEffect(() => {
    fetch('/api/cyd-layout/printers')
      .then((r) => r.json())
      .then((printers: { id: string; live: { state: string; progress: number } | null }[]) => {
        const map: LiveMap = {}
        for (const p of printers) if (p.live) map[p.id] = p.live
        setLiveMap(map)
      })
  }, [])

  const activePage = config.pages[activePageIndex]
  const usedSlugsOnActivePage = activePage.cells.filter((c): c is Extract<LayoutCellOut, { printer: string }> => 'printer' in c).map((c) => c.printer)

  function updateActivePage(updates: Partial<LayoutPageOut>) {
    setConfig((cfg) => ({
      ...cfg,
      pages: cfg.pages.map((p, i) => (i === activePageIndex ? { ...p, ...updates } : p)),
    }))
  }

  // Ganti cols/rows manual selalu drop rowWeights lama (bisa beda panjang dari rows baru) —
  // GridCanvas jatuh balik ke bagi rata otomatis begitu rowWeights undefined.
  function updateGrid(updates: { cols?: number; rows?: number }) {
    updateActivePage({ grid: { cols: activePage.grid.cols, rows: activePage.grid.rows, ...updates } })
  }

  function addCell(cell: LayoutCellOut) {
    updateActivePage({ cells: [...activePage.cells, cell] })
  }

  function updateCell(index: number, cell: LayoutCellOut) {
    updateActivePage({ cells: activePage.cells.map((c, i) => (i === index ? cell : c)) })
  }

  function removeCell(index: number) {
    updateActivePage({ cells: activePage.cells.filter((_, i) => i !== index) })
    setSelectedCellIndex(null)
  }

  // Tukar posisi (col/row) dua sel yang sudah terisi — ukuran (span) masing-masing tetap ikut sel-nya.
  function swapCells(indexA: number, indexB: number) {
    const a = activePage.cells[indexA]
    const b = activePage.cells[indexB]
    updateActivePage({
      cells: activePage.cells.map((c, i) => {
        if (i === indexA) return { ...a, col: b.col, row: b.row }
        if (i === indexB) return { ...b, col: a.col, row: a.row }
        return c
      }),
    })
  }

  function moveCellTo(index: number, col: number, row: number) {
    updateActivePage({ cells: activePage.cells.map((c, i) => (i === index ? { ...c, col, row } : c)) })
  }

  function handleDragStart(event: DragStartEvent) {
    const activeData = event.active.data.current as { type: string; printer?: PaletteItem; cellIndex?: number } | undefined
    if (activeData?.type === 'printer' && activeData.printer) setDraggingPrinter(activeData.printer)
    if (activeData?.type === 'canvas-cell' && activeData.cellIndex !== undefined) {
      setDraggingCanvasCell(activePage.cells[activeData.cellIndex] ?? null)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingPrinter(null)
    setDraggingCanvasCell(null)
    const { active, over } = event
    if (!over) return
    const overData = over.data.current as { type: string; col: number; row: number; cellIndex?: number } | undefined
    const activeData = active.data.current as { type: string; printerId?: string; cellIndex?: number } | undefined
    if (!overData || overData.type !== 'cell') return

    if (activeData?.type === 'printer' && activeData.printerId) {
      if (overData.cellIndex !== undefined) return  // drop dari palette ke sel yang sudah terisi: no-op
      if (usedSlugsOnActivePage.includes(activeData.printerId)) return  // dobel di halaman sama, cegah
      addCell({ printer: activeData.printerId, col: overData.col, row: overData.row })
      return
    }

    if (activeData?.type === 'canvas-cell' && activeData.cellIndex !== undefined) {
      const fromIndex = activeData.cellIndex
      if (overData.cellIndex !== undefined) {
        if (overData.cellIndex !== fromIndex) swapCells(fromIndex, overData.cellIndex)
      } else {
        moveCellTo(fromIndex, overData.col, overData.row)
      }
    }
  }

  function addPage() {
    const newId = `halaman-${nextPageNumberRef.current++}`
    setConfig((cfg) => ({
      ...cfg,
      pages: [...cfg.pages, { id: newId, grid: { cols: 10, rows: 8 }, fields: FIELD_PRESETS.ringkas, durationSec: 8, cells: [] }],
    }))
    setActivePageIndex(config.pages.length)
  }

  function removePage(index: number) {
    if (config.pages.length <= 1) return  // minimal 1 halaman
    // Kalau yang dihapus adalah halaman yang lagi aktif, halaman yang jadi aktif setelah ini pasti
    // beda (isi cells beda) — selectedCellIndex lama (index numerik ke array cells halaman lama)
    // jadi tidak relevan lagi dan bisa salah nunjuk ke sel di halaman baru (lihat Bug 2 fix di onSelect).
    if (index === activePageIndex) setSelectedCellIndex(null)
    setConfig((cfg) => ({ ...cfg, pages: cfg.pages.filter((_, i) => i !== index) }))
    setActivePageIndex((i) => Math.max(0, i - (index <= i ? 1 : 0)))
  }

  async function handlePublish() {
    setStatus('saving')
    try {
      const res = await fetch('/api/cyd-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      const body = await res.json()
      if (!res.ok) { setStatus('error'); return }
      setStatus(body.confirmed ? 'confirmed' : 'timeout')
    } catch {
      setStatus('error')
    }
  }

  const selectedCell = selectedCellIndex !== null ? (activePage.cells[selectedCellIndex] ?? null) : null

  return (
    <MotionConfig reducedMotion="user">
      <PageShell
        title="Layout CYD"
        description="Susun halaman, drag printer/label ke grid, resize baris & sel."
        actions={
          <motion.button
            onClick={handlePublish}
            disabled={status === 'saving'}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="relative h-10 rounded-[5px] px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 55%, #818cf8 100%)',
              boxShadow: '0 4px 18px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <span className="flex items-center gap-2">
              {status === 'saving' && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {status === 'saving' ? 'Menyimpan…' : 'Simpan & Terapkan'}
            </span>
          </motion.button>
        }
      >
        {/* Status publish — pil animasi, momen "confirmed" dapat perlakuan spesial */}
        <AnimatePresence>
          {status === 'confirmed' && (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="mb-3 flex w-fit items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-[#047857] dark:text-[#34d399]"
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <motion.span
                  className="absolute inset-0 rounded-full bg-emerald-400/40"
                  initial={{ scale: 0.5, opacity: 0.9 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                />
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d="M4 12.5l5 5L20 6.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.12, duration: 0.35, ease: 'easeOut' }}
                  />
                </svg>
              </span>
              Diterapkan ke CYD
            </motion.div>
          )}
          {status === 'timeout' && (
            <motion.div
              key="timeout"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
              className="mb-3 w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-[#b45309] dark:text-amber-300"
            >
              ⚠️ Tersimpan, tapi device belum konfirmasi (cek koneksi CYD)
            </motion.div>
          )}
          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
              className="mb-3 w-fit rounded-full border border-red-500/25 bg-red-500/10 px-3.5 py-1.5 text-xs font-medium text-[#b91c1c] dark:text-red-400"
            >
              Gagal menyimpan, coba lagi.
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <PageTabs
            pages={config.pages}
            activeIndex={activePageIndex}
            onSelect={(i) => { setActivePageIndex(i); setSelectedCellIndex(null) }}
            onAdd={addPage}
            onRemove={removePage}
            onReorder={(newPages) => setConfig((cfg) => ({ ...cfg, pages: newPages }))}
          />
        </motion.div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setDraggingPrinter(null); setDraggingCanvasCell(null) }}
        >
          <div className="flex items-start gap-4">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
            >
              <PrinterPalette usedSlugsOnActivePage={usedSlugsOnActivePage} />
            </motion.div>

            <motion.div
              className="min-w-0 flex-1"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.1, ease: 'easeOut' }}
            >
              {/* Transisi konten saat ganti tab halaman — fade/slide, bukan swap mendadak */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activePage.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <GridCanvas
                    page={activePage}
                    livePrinters={liveMap}
                    selectedCellIndex={selectedCellIndex}
                    onSelectCell={setSelectedCellIndex}
                    onAddCell={addCell}
                    onUpdateCell={updateCell}
                    onUpdatePage={updateActivePage}
                  />
                </motion.div>
              </AnimatePresence>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
            >
              <CellSettingsPanel
                cell={selectedCell}
                activePageId={activePage.id}
                onUpdateCell={(cell) => selectedCellIndex !== null && updateCell(selectedCellIndex, cell)}
                onRemoveCell={() => selectedCellIndex !== null && removeCell(selectedCellIndex)}
                pageDurationSec={activePage.durationSec}
                onUpdateDuration={(seconds) => updateActivePage({ durationSec: seconds })}
                gridCols={activePage.grid.cols}
                gridRows={activePage.grid.rows}
                onUpdateGrid={updateGrid}
              />
            </motion.div>
          </div>

          {/* Preview yang ikut kursor — di-portal keluar dari pohon DOM (dnd-kit), jadi tidak
              tersandera stacking context motion.div palette/canvas di atas (itu penyebab
              printer yang di-drag dulu ke-timpa canvas). */}
          <DragOverlay dropAnimation={null}>
            {draggingPrinter && <PrinterCardPreview printer={draggingPrinter} />}
            {draggingCanvasCell && <CanvasCellPreview cell={draggingCanvasCell} />}
          </DragOverlay>
        </DndContext>
      </PageShell>
    </MotionConfig>
  )
}
