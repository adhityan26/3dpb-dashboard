"use client"

import { useState, useMemo } from "react"
import { useSpools } from "@/lib/hooks/use-filamen"
import { SpoolKpiBar } from "./SpoolKpiBar"
import { SpoolCard } from "./SpoolCard"
import type { SpoolData, SpoolStatus } from "@/lib/filamen/types"

export function SpoolTab() {
  const { data, isLoading } = useSpools()
  const [statusFilter, setStatusFilter] = useState<SpoolStatus | "all">("all")
  const [search, setSearch] = useState("")
  const [editingSpool, setEditingSpool] = useState<SpoolData | null>(null)
  const [printingSpool, setPrintingSpool] = useState<SpoolData | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    return data.spools.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          s.brand.toLowerCase().includes(q) ||
          s.colorName.toLowerCase().includes(q) ||
          s.material.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [data, statusFilter, search])

  // Group by brand+colorName+material
  const grouped = useMemo(() => {
    const map = new Map<string, SpoolData[]>()
    for (const s of filtered) {
      const key = `${s.brand}|||${s.colorName}|||${s.material}`
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return map
  }, [filtered])

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Memuat spool...</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <SpoolKpiBar kpi={data.kpi} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button className="bg-[#EE4D2D] text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226]">
          + Spool Baru
        </button>
        <button className="border border-gray-300 text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50">
          📷 Scan
        </button>
        <button className="border border-gray-300 text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50">
          📡 NFC
        </button>
        <div className="flex-1" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SpoolStatus | "all")}
          className="border border-gray-300 text-sm px-2 py-1.5 rounded-md text-gray-600"
        >
          <option value="all">Semua Status</option>
          <option value="new">New</option>
          <option value="full">Full</option>
          <option value="mid">Mid</option>
          <option value="low">Low</option>
          <option value="empty">Empty</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari brand/warna..."
          className="border border-gray-300 text-sm px-2 py-1.5 rounded-md w-40"
        />
      </div>

      {/* Grouped grid */}
      {Array.from(grouped.entries()).map(([key, spools]) => {
        const [brand, colorName, material] = key.split("|||")
        const hasLow = spools.some((s) => s.status === "low" || s.status === "empty")
        return (
          <div key={key}>
            <div className={`text-xs uppercase tracking-widest mb-2 ${hasLow ? "text-orange-500" : "text-gray-400"}`}>
              {brand} {colorName} · {material}
              {hasLow && " ⚠️"}
              <span className="ml-2 text-gray-400">{spools.length} spool</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {spools.map((s) => (
                <SpoolCard
                  key={s.id}
                  spool={s}
                  onEdit={setEditingSpool}
                  onPrint={setPrintingSpool}
                />
              ))}
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div className="text-gray-400 py-8 text-center">Tidak ada spool ditemukan.</div>
      )}

      {/* Modals — wired in later tasks */}
      {editingSpool && <div>{/* SpoolForm modal — Task 11 */}</div>}
      {printingSpool && <div>{/* PrintModal — Task 13 */}</div>}
    </div>
  )
}
