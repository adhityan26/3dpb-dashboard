'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { motion } from 'framer-motion'
import { PrinterStatusBadge } from '@/components/printers/PrinterStatusBadge'

interface PaletteItem {
  id: string // = slug
  name: string
  model: string
  live: { state: string; progress: number; remainingMin: number } | null
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 420, damping: 30 } },
}

function DraggablePrinterCard({ printer, disabled }: { printer: PaletteItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${printer.id}`,
    data: { type: 'printer', printerId: printer.id },
    disabled,
  })

  return (
    <motion.div variants={itemVariants} className="relative" style={{ zIndex: isDragging ? 50 : undefined }}>
      <div
        ref={setNodeRef}
        {...(disabled ? {} : { ...listeners, ...attributes })}
        className="touch-none select-none"
        style={{
          transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
          cursor: disabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
        }}
      >
        <motion.div
          animate={{
            scale: isDragging ? 1.05 : 1,
            rotate: isDragging ? 1.5 : 0,
            boxShadow: isDragging
              ? '0 14px 32px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(99,102,241,0.55)'
              : '0 1px 2px rgba(0,0,0,0.05), 0 0 0 0px rgba(99,102,241,0)',
          }}
          whileHover={disabled || isDragging ? undefined : { y: -2, scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 480, damping: 30 }}
          className={`g-inner rounded-xl px-2.5 py-2 backdrop-blur-sm transition-colors ${
            disabled ? 'opacity-40 saturate-50' : 'hover:border-indigo-400/40'
          }`}
          title={disabled ? 'Sudah dipakai di halaman ini' : 'Tarik ke grid'}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="g-t1 truncate text-xs font-medium">🖨️ {printer.name}</span>
            <PrinterStatusBadge state={printer.live?.state ?? null} />
          </div>
          {printer.model && <span className="g-t4 text-[10px]">{printer.model}</span>}
        </motion.div>
      </div>
    </motion.div>
  )
}

export function PrinterPalette({ usedSlugsOnActivePage }: { usedSlugsOnActivePage: string[] }) {
  const [printers, setPrinters] = useState<PaletteItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cyd-layout/printers')
      .then((r) => (r.ok ? (r.json() as Promise<PaletteItem[]>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setPrinters(data))
      .catch(() => setPrinters([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="w-44 flex-shrink-0">
      <div className="g-card rounded-2xl p-3 backdrop-blur-[12px]">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="g-t3 text-[10px] font-semibold uppercase tracking-[0.14em]">Printer</span>
          {!loading && printers.length > 0 && (
            <span className="rounded-full bg-indigo-500/12 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-500 dark:text-indigo-300">
              {printers.length}
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="g-inner h-[46px] animate-pulse rounded-xl" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}

        {!loading && printers.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-xl border border-dashed px-2 py-4 text-center"
            style={{ borderColor: 'var(--g-dashed)' }}
          >
            <motion.div
              className="mb-1.5 text-xl"
              animate={{ rotate: [0, -6, 6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.5 }}
            >
              🖨️
            </motion.div>
            <p className="g-t3 text-[11px] leading-relaxed">
              Belum ada printer aktif dengan slug. Tambah/lengkapi di Produk → Filamen → Printer.
            </p>
          </motion.div>
        )}

        {!loading && printers.length > 0 && (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2">
            {printers.map((p) => (
              <DraggablePrinterCard key={p.id} printer={p} disabled={usedSlugsOnActivePage.includes(p.id)} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
