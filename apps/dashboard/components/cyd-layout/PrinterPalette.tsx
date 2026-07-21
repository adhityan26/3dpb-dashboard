'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { PrinterStatusBadge } from '@/components/printers/PrinterStatusBadge'

interface PaletteItem {
  id: string // = slug
  name: string
  model: string
  live: { state: string; progress: number; remainingMin: number } | null
}

function DraggablePrinterCard({ printer, disabled }: { printer: PaletteItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${printer.id}`,
    data: { type: 'printer', printerId: printer.id },
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : { ...listeners, ...attributes })}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: disabled ? 0.4 : isDragging ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'grab',
      }}
      className="border border-gray-300 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 select-none"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-gray-800 dark:text-slate-100 truncate">🖨️ {printer.name}</span>
        <PrinterStatusBadge state={printer.live?.state ?? null} />
      </div>
      {printer.model && <span className="text-[10px] text-gray-400 dark:text-slate-500">{printer.model}</span>}
    </div>
  )
}

export function PrinterPalette({ usedSlugsOnActivePage }: { usedSlugsOnActivePage: string[] }) {
  const [printers, setPrinters] = useState<PaletteItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cyd-layout/printers')
      .then((r) => r.json())
      .then((data: PaletteItem[]) => setPrinters(data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="w-40 flex-shrink-0 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold">Printer</div>
      {loading && <div className="text-xs text-gray-400 dark:text-slate-500">Memuat...</div>}
      {!loading && printers.length === 0 && (
        <div className="text-xs text-gray-400 dark:text-slate-500">
          Belum ada printer aktif dengan slug. Tambah/lengkapi di Produk→Filamen→Printer.
        </div>
      )}
      {printers.map((p) => (
        <DraggablePrinterCard key={p.id} printer={p} disabled={usedSlugsOnActivePage.includes(p.id)} />
      ))}
    </div>
  )
}
