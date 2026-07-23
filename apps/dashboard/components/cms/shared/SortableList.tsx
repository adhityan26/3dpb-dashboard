"use client"

import type React from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface SortableItemProps {
  id: string
  children: React.ReactNode
}

function SortableRow({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
      className="hover:bg-white/[0.02]"
    >
      <td className="px-2 py-2 w-8">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing select-none"
          style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}
        >
          ⠿
        </span>
      </td>
      {children}
    </tr>
  )
}

interface SortableListProps<T extends { _id: string }> {
  items: T[]
  onReorder: (newItems: T[]) => void
  renderRow: (item: T) => React.ReactNode
  headers: { label: string; width?: string }[]
  actionHeader?: boolean
}

export function SortableList<T extends { _id: string }>({
  items,
  onReorder,
  renderRow,
  headers,
  actionHeader = false,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i._id === String(active.id))
    const newIndex = items.findIndex((i) => i._id === String(over.id))
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="rounded-[5px] overflow-hidden border border-white/8">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className="w-8 px-2 py-2" />
              {headers.map((h) => (
                <th
                  key={h.label}
                  className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                  style={{ color: "rgba(165,180,252,0.6)", width: h.width }}
                >
                  {h.label}
                </th>
              ))}
              {actionHeader && <th className="w-24 px-3 py-2" />}
            </tr>
          </thead>
          <SortableContext items={items.map((i) => i._id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {items.map((item) => (
                <SortableRow key={item._id} id={item._id}>
                  {renderRow(item)}
                </SortableRow>
              ))}
            </tbody>
          </SortableContext>
        </table>
      </div>
    </DndContext>
  )
}
