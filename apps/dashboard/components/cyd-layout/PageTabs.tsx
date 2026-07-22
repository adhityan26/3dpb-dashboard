// components/cyd-layout/PageTabs.tsx
'use client'

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import type { LayoutPageOut } from '@/lib/cyd-layout/types'

function SortableTab({ page, isActive, onSelect, onRemove }: { page: LayoutPageOut; isActive: boolean; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.85 : 1, zIndex: isDragging ? 30 : undefined }}
      onClick={onSelect}
      className={`relative flex cursor-pointer select-none items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        isActive ? 'text-white' : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="cyd-page-tab-blob"
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(135deg, #5055e8, #818cf8)',
            boxShadow: '0 4px 14px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span className="relative z-10 font-medium">{page.id}</span>
      <motion.span
        whileHover={{ scale: 1.25 }}
        whileTap={{ scale: 0.85 }}
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 transition-colors hover:opacity-100 ${
          isActive ? 'hover:bg-white/25' : 'hover:bg-red-500/15 hover:text-red-500'
        }`}
      >
        ✕
      </motion.span>
    </div>
  )
}

export function PageTabs({ pages, activeIndex, onSelect, onAdd, onRemove, onReorder }: {
  pages: LayoutPageOut[]; activeIndex: number; onSelect: (i: number) => void; onAdd: () => void; onRemove: (i: number) => void; onReorder: (newPages: LayoutPageOut[]) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pages.findIndex((p) => p.id === active.id)
    const newIndex = pages.findIndex((p) => p.id === over.id)
    onReorder(arrayMove(pages, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="g-card inline-flex flex-wrap items-center gap-1 rounded-full p-1 backdrop-blur-[12px]">
          <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
            {pages.map((p, i) => (
              <SortableTab key={p.id} page={p} isActive={i === activeIndex} onSelect={() => onSelect(i)} onRemove={() => onRemove(i)} />
            ))}
          </SortableContext>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={onAdd}
          className="rounded-full border border-dashed border-gray-400/60 px-3.5 py-1.5 text-sm text-gray-500 transition-colors hover:border-indigo-400/70 hover:bg-indigo-500/5 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-indigo-400/60 dark:hover:text-indigo-300"
        >
          + Halaman
        </motion.button>
      </div>
    </DndContext>
  )
}
