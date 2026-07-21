'use client'

import { useEffect, useState } from 'react'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { PrinterPalette } from '@/components/cyd-layout/PrinterPalette'
import { GridCanvas } from '@/components/cyd-layout/GridCanvas'
import { PageTabs } from '@/components/cyd-layout/PageTabs'
import { CellSettingsPanel } from '@/components/cyd-layout/CellSettingsPanel'
import { FIELD_PRESETS } from '@/lib/cyd-layout/types'
import type { LayoutConfigOut, LayoutPageOut, LayoutCellOut } from '@/lib/cyd-layout/types'

const DEFAULT_CONFIG: LayoutConfigOut = {
  schemaVersion: 1,
  pages: [
    { id: 'rack', grid: { cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] }, fields: FIELD_PRESETS.ringkas, durationSec: 0, cells: [] },
  ],
}

interface LiveMap { [printerId: string]: { state: string; progress: number } }

export default function CydLayoutPage() {
  const [config, setConfig] = useState<LayoutConfigOut>(DEFAULT_CONFIG)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null)
  const [liveMap, setLiveMap] = useState<LiveMap>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'confirmed' | 'timeout' | 'error'>('idle')

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const overData = over.data.current as { type: string; col: number; row: number } | undefined
    const activeData = active.data.current as { type: string; printerId: string } | undefined
    if (overData?.type === 'cell' && activeData?.type === 'printer') {
      if (usedSlugsOnActivePage.includes(activeData.printerId)) return  // dobel di halaman sama, cegah
      addCell({ printer: activeData.printerId, col: overData.col, row: overData.row })
    }
  }

  function addPage() {
    const newId = `halaman-${config.pages.length + 1}`
    setConfig((cfg) => ({
      ...cfg,
      pages: [...cfg.pages, { id: newId, grid: { cols: 1, rows: 1 }, fields: FIELD_PRESETS.ringkas, durationSec: 8, cells: [] }],
    }))
    setActivePageIndex(config.pages.length)
  }

  function removePage(index: number) {
    if (config.pages.length <= 1) return  // minimal 1 halaman
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Layout CYD</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Susun halaman, drag printer/label ke grid, resize baris & sel.</p>
        </div>
        <button
          onClick={handlePublish}
          disabled={status === 'saving'}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {status === 'saving' ? 'Menyimpan...' : 'Simpan & Terapkan'}
        </button>
      </div>

      {status === 'confirmed' && <p className="mb-3 text-green-600 text-sm">✅ Diterapkan ke CYD</p>}
      {status === 'timeout' && <p className="mb-3 text-amber-600 text-sm">⚠️ Tersimpan, tapi device belum konfirmasi (cek koneksi CYD)</p>}
      {status === 'error' && <p className="mb-3 text-red-600 text-sm">Gagal menyimpan, coba lagi.</p>}

      <div className="mb-4">
        <PageTabs
          pages={config.pages}
          activeIndex={activePageIndex}
          onSelect={setActivePageIndex}
          onAdd={addPage}
          onRemove={removePage}
          onReorder={(newPages) => setConfig((cfg) => ({ ...cfg, pages: newPages }))}
        />
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 items-start">
          <PrinterPalette usedSlugsOnActivePage={usedSlugsOnActivePage} />
          <GridCanvas
            page={activePage}
            livePrinters={liveMap}
            selectedCellIndex={selectedCellIndex}
            onSelectCell={setSelectedCellIndex}
            onAddCell={addCell}
            onUpdateCell={updateCell}
            onUpdatePage={updateActivePage}
          />
          <CellSettingsPanel
            cell={selectedCell}
            activePageId={activePage.id}
            onUpdateCell={(cell) => selectedCellIndex !== null && updateCell(selectedCellIndex, cell)}
            onRemoveCell={() => selectedCellIndex !== null && removeCell(selectedCellIndex)}
            pageDurationSec={activePage.durationSec}
            onUpdateDuration={(seconds) => updateActivePage({ durationSec: seconds })}
          />
        </div>
      </DndContext>
    </div>
  )
}
