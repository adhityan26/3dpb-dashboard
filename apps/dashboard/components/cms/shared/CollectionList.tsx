"use client"

import type React from "react"

interface Column<T> {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  width?: string
}

interface CollectionListProps<T extends { _id: string }> {
  items: T[]
  columns: Column<T>[]
  onEdit?: (item: T) => void
  onDelete?: (id: string) => void
  isDeleting?: string | null
  emptyMessage?: string
  dragHandle?: boolean
}

export function CollectionList<T extends { _id: string }>({
  items,
  columns,
  onEdit,
  onDelete,
  isDeleting,
  emptyMessage = "Belum ada item.",
  dragHandle = false,
}: CollectionListProps<T>) {
  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-[5px] overflow-hidden border border-white/8">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {dragHandle && <th className="w-8 px-2 py-2" />}
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                style={{ color: "rgba(165,180,252,0.6)", width: col.width }}
              >
                {col.label}
              </th>
            ))}
            {(onEdit || onDelete) && <th className="w-20 px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item._id}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              className="hover:bg-white/[0.02] transition-colors"
            >
              {dragHandle && (
                <td className="px-2 py-2 text-center" style={{ color: "rgba(255,255,255,0.2)", cursor: "grab" }}>
                  ⠿
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {col.render(item)}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-3 py-2">
                  <div className="flex gap-2 justify-end">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(item)}
                        className="text-[11px] px-2 py-1 rounded-[5px]"
                        style={{ background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.9)" }}
                      >
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(item._id)}
                        disabled={isDeleting === item._id}
                        className="text-[11px] px-2 py-1 rounded-[5px]"
                        style={{ background: "rgba(239,68,68,0.12)", color: "rgba(252,165,165,0.8)" }}
                      >
                        {isDeleting === item._id ? "..." : "Hapus"}
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
