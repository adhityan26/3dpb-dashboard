"use client"

import { useState, useMemo } from "react"
import { useSpools } from "@/lib/hooks/use-filamen"
import { SpoolKpiBar } from "./SpoolKpiBar"
import { SpoolCard } from "./SpoolCard"
import { SpoolForm } from "./SpoolForm"
import { SpoolAddPicker } from "./SpoolAddPicker"
import { ScanModal } from "./ScanModal"
import { NfcLinkModal } from "./NfcLinkModal"
import { SpoolActionSheet } from "./SpoolActionSheet"
import type { SpoolData, SpoolStatus } from "@/lib/filamen/types"
import { PrintModal } from "./PrintModal"
import { BatchPrintModal } from "./BatchPrintModal"

export function SpoolTab() {
  const { data, isLoading, isError } = useSpools()
  const [statusFilter, setStatusFilter] = useState<SpoolStatus | "all">("all")
  const [search, setSearch] = useState("")
  const [editingSpool, setEditingSpool] = useState<SpoolData | null>(null)
  const [printingSpool, setPrintingSpool] = useState<SpoolData | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [prefillNfc, setPrefillNfc] = useState<string | undefined>()
  const [showScanModal, setShowScanModal] = useState(false)
  const [nfcLinkTagId, setNfcLinkTagId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchPrint, setShowBatchPrint] = useState(false)
  const [actionSheetSpool, setActionSheetSpool] = useState<SpoolData | null>(null)

  function toggleSelect(spool: SpoolData) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(spool.id)) next.delete(spool.id)
      else next.add(spool.id)
      return next
    })
  }

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

  if (isLoading) return <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Memuat spool...</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Gagal memuat data spool.</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <SpoolKpiBar kpi={data.kpi} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700"
        >
          + Spool Baru
        </button>
        <button
          onClick={() => setShowScanModal(true)}
          className="border border-gray-300 dark:border-slate-600 text-sm px-3 py-1.5 rounded-md text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          📷 Scan / 📡 NFC
        </button>
        {selectedIds.size > 0 ? (
          <>
            <button
              onClick={() => setShowBatchPrint(true)}
              className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700"
            >
              🏷 Print {selectedIds.size} Stiker
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="border border-gray-300 dark:border-slate-600 text-sm px-3 py-1.5 rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Batal pilih
            </button>
          </>
        ) : null}
        <div className="flex-1" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SpoolStatus | "all")}
          className="border border-gray-300 dark:border-slate-600 text-sm px-2 py-1.5 rounded-md text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800"
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
          className="border border-gray-300 dark:border-slate-600 text-sm px-2 py-1.5 rounded-md w-40 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />
      </div>

      {/* Grouped grid */}
      {Array.from(grouped.entries()).map(([key, spools]) => {
        const { brand, colorName, material } = spools[0]
        const hasLow = spools.some((s) => s.status === "low" || s.status === "empty")
        return (
          <div key={key}>
            <div className={`text-xs uppercase tracking-widest mb-2 ${hasLow ? "text-orange-500" : "text-gray-400 dark:text-slate-500"}`}>
              {brand} {colorName} · {material}
              {hasLow && " ⚠️"}
              <span className="ml-2 text-gray-400 dark:text-slate-600">{spools.length} spool</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {spools.map((s) => (
                <SpoolCard
                  key={s.id}
                  spool={s}
                  onEdit={setEditingSpool}
                  onPrint={setPrintingSpool}
                  onTap={setActionSheetSpool}
                  selected={selectedIds.has(s.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Tidak ada spool ditemukan.</div>
      )}

      {/* SpoolActionSheet — tap on card */}
      {actionSheetSpool && (
        <SpoolActionSheet
          spool={actionSheetSpool}
          onEdit={setEditingSpool}
          onPrint={setPrintingSpool}
          onScanNfc={() => setShowScanModal(true)}
          onClose={() => setActionSheetSpool(null)}
        />
      )}

      {showScanModal && (
        <ScanModal
          onFound={(spool) => { setShowScanModal(false); setEditingSpool(spool) }}
          onNotFound={(rawValue, type) => {
            setShowScanModal(false)
            if (type === "nfc") {
              setNfcLinkTagId(rawValue)
            } else {
              setPrefillNfc(undefined)
              setShowAddForm(true)
            }
          }}
          onClose={() => setShowScanModal(false)}
        />
      )}

      {nfcLinkTagId && (
        <NfcLinkModal
          nfcTagId={nfcLinkTagId}
          onLinked={(spool) => { setNfcLinkTagId(null); setEditingSpool(spool) }}
          onAddNew={() => {
            setPrefillNfc(nfcLinkTagId ?? undefined)
            setNfcLinkTagId(null)
            setShowAddForm(true)
          }}
          onClose={() => setNfcLinkTagId(null)}
        />
      )}

      {showAddForm && !editingSpool && (
        <SpoolAddPicker
          prefillNfcTagId={prefillNfc}
          onClose={() => { setShowAddForm(false); setPrefillNfc(undefined) }}
        />
      )}

      {editingSpool && (
        <SpoolForm
          spool={editingSpool}
          onClose={() => setEditingSpool(null)}
        />
      )}
      {printingSpool && (
        <PrintModal
          spool={printingSpool}
          onClose={() => setPrintingSpool(null)}
        />
      )}
      {showBatchPrint && data && (
        <BatchPrintModal
          spools={data.spools.filter((s) => selectedIds.has(s.id))}
          onClose={() => { setShowBatchPrint(false); setSelectedIds(new Set()) }}
        />
      )}
    </div>
  )
}
