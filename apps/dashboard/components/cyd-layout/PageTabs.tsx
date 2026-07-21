// components/cyd-layout/PageTabs.tsx
'use client'

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayoutPageOut } from '@/lib/cyd-layout/types'

function SortableTab({ page, isActive, onSelect, onRemove }: { page: LayoutPageOut; isActive: boolean; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={onSelect}
      className={`px-3 py-1.5 rounded-md text-sm cursor-pointer flex items-center gap-1.5 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300'}`}
    >
      {page.id}
      <span
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="text-xs opacity-60 hover:opacity-100 ml-1"
      >
        ✕
      </span>
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
      <div className="flex items-center gap-2 flex-wrap">
        <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
          {pages.map((p, i) => (
            <SortableTab key={p.id} page={p} isActive={i === activeIndex} onSelect={() => onSelect(i)} onRemove={() => onRemove(i)} />
          ))}
        </SortableContext>
        <button onClick={onAdd} className="px-3 py-1.5 rounded-md text-sm border border-dashed border-gray-400 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800">
          + Halaman
        </button>
      </div>
    </DndContext>
  )
}
