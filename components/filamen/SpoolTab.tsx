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

const ALL_STATUSES: SpoolStatus[] = ["new", "full", "mid", "low", "empty"]
const STATUS_LABELS: Record<SpoolStatus, string> = {
  new: "NEW",
  full: "FULL",
  mid: "MID",
  low: "LOW",
  empty: "EMPTY",
}

export function SpoolTab() {
  const { data, isLoading, isError } = useSpools()

  // --- filter state ---
  const [showEmpty, setShowEmpty] = useState(false)
  const [filterBrands, setFilterBrands] = useState<Set<string>>(new Set())
  const [filterMaterials, setFilterMaterials] = useState<Set<string>>(new Set())
  const [filterColor, setFilterColor] = useState("")
  const [filterStatuses, setFilterStatuses] = useState<Set<SpoolStatus>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // --- existing modal/selection state ---
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

  // --- toggle helpers ---
  function toggleBrand(b: string) {
    setFilterBrands((prev) => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n })
  }
  function toggleMaterial(m: string) {
    setFilterMaterials((prev) => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n })
  }
  function toggleStatus(s: SpoolStatus) {
    setFilterStatuses((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }
  function toggleCollapsed(key: string) {
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // --- available filter options ---
  const allBrands = useMemo(
    () => [...new Set(data?.spools.map((s) => s.brand) ?? [])].sort(),
    [data]
  )
  const allMaterials = useMemo(
    () => [...new Set(data?.spools.map((s) => s.material) ?? [])].sort(),
    [data]
  )

  // --- 4-level grouping ---
  const grouped = useMemo(() => {
    if (!data) return new Map<string, Map<string, Map<string, SpoolData[]>>>()
    let spools = data.spools
    if (!showEmpty) spools = spools.filter((s) => s.status !== "empty")
    if (filterBrands.size > 0) spools = spools.filter((s) => filterBrands.has(s.brand))
    if (filterMaterials.size > 0) spools = spools.filter((s) => filterMaterials.has(s.material))
    if (filterColor.trim())
      spools = spools.filter((s) =>
        s.colorName.toLowerCase().includes(filterColor.toLowerCase())
      )
    if (filterStatuses.size > 0)
      spools = spools.filter((s) => filterStatuses.has(s.status))

    // brand → material → colorName → SpoolData[]
    const result = new Map<string, Map<string, Map<string, SpoolData[]>>>()
    for (const s of spools) {
      if (!result.has(s.brand)) result.set(s.brand, new Map())
      const byMat = result.get(s.brand)!
      if (!byMat.has(s.material)) byMat.set(s.material, new Map())
      const byColor = byMat.get(s.material)!
      if (!byColor.has(s.colorName)) byColor.set(s.colorName, [])
      byColor.get(s.colorName)!.push(s)
    }
    return result
  }, [data, showEmpty, filterBrands, filterMaterials, filterColor, filterStatuses])

  const totalFiltered = useMemo(() => {
    let count = 0
    for (const byMat of grouped.values())
      for (const byColor of byMat.values())
        for (const spools of byColor.values()) count += spools.length
    return count
  }, [grouped])

  function collapseAll() {
    setCollapsed(new Set(grouped.keys()))
  }
  function expandAll() {
    setCollapsed(new Set())
  }

  if (isLoading) return <div className="g-t3 py-8 text-center">Memuat spool...</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Gagal memuat data spool.</div>
  if (!data) return null

  const chipActive = {
    background: "rgba(99,102,241,0.2)",
    border: "1px solid rgba(99,102,241,0.4)",
    color: "#a5b4fc",
  } as React.CSSProperties
  const chipInactive = {
    background: "var(--g-inner)",
    border: "1px solid var(--g-inner-border)",
    color: "var(--g-t3)",
  } as React.CSSProperties

  return (
    <div className="space-y-4">
      <SpoolKpiBar kpi={data.kpi} />

      {/* ── Toolbar ── */}
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
        {selectedIds.size > 0 && (
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
        )}
        <div className="flex-1" />
        <div className="flex gap-1 text-xs">
          <button
            onClick={expandAll}
            className="g-btn-ghost px-2 py-1 rounded text-xs"
            style={chipInactive}
          >
            ↕ Expand All
          </button>
          <button
            onClick={collapseAll}
            className="g-btn-ghost px-2 py-1 rounded text-xs"
            style={chipInactive}
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* ── Filter row ── */}
      <div
        className="rounded-lg p-3 space-y-2.5"
        style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}
      >
        {/* Brand chips */}
        {allBrands.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs g-t3 mr-1 shrink-0">Brand:</span>
            {allBrands.map((b) => (
              <button
                key={b}
                onClick={() => toggleBrand(b)}
                className="text-xs px-2 py-0.5 rounded-full transition-all"
                style={filterBrands.has(b) ? chipActive : chipInactive}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {/* Material chips */}
        {allMaterials.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs g-t3 mr-1 shrink-0">Material:</span>
            {allMaterials.map((m) => (
              <button
                key={m}
                onClick={() => toggleMaterial(m)}
                className="text-xs px-2 py-0.5 rounded-full transition-all"
                style={filterMaterials.has(m) ? chipActive : chipInactive}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs g-t3 mr-1 shrink-0">Status:</span>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className="text-xs px-2 py-0.5 rounded-full transition-all"
              style={filterStatuses.has(s) ? chipActive : chipInactive}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Color search + show empty toggle */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            value={filterColor}
            onChange={(e) => setFilterColor(e.target.value)}
            placeholder="🔍 Cari warna..."
            className="glass-input text-xs px-2 py-1 rounded-md w-40"
          />
          <label className="flex items-center gap-1.5 cursor-pointer text-xs g-t3 select-none">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-500"
            />
            Tampilkan empty
          </label>
        </div>
      </div>

      {/* ── Grouped 4-level display ── */}
      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([brand, byMat]) => {
          const brandKey = brand
          const brandCollapsed = collapsed.has(brandKey)

          // Count totals for brand header
          let brandTotal = 0
          let brandColors = 0
          for (const byColor of byMat.values()) {
            for (const spools of byColor.values()) {
              brandTotal += spools.length
              brandColors++
            }
          }

          return (
            <div
              key={brand}
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--g-card-border)" }}
            >
              {/* Brand header */}
              <button
                onClick={() => toggleCollapsed(brandKey)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[rgba(99,102,241,0.05)]"
                style={{
                  background: "var(--g-card)",
                  borderLeft: "3px solid rgba(99,102,241,0.5)",
                }}
              >
                <span className="text-xs g-t3 w-3 text-center">
                  {brandCollapsed ? "▶" : "▼"}
                </span>
                <span className="font-bold g-t1 text-sm flex-1">{brand}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "rgba(99,102,241,0.15)",
                    color: "#a5b4fc",
                  }}
                >
                  {brandColors} warna · {brandTotal} roll
                </span>
              </button>

              {!brandCollapsed && (
                <div className="px-3 pb-2 pt-1 space-y-1" style={{ background: "var(--g-inner)" }}>
                  {Array.from(byMat.entries()).map(([material, byColor]) => {
                    const matKey = `${brand}|||${material}`
                    const matCollapsed = collapsed.has(matKey)
                    let matTotal = 0
                    for (const spools of byColor.values()) matTotal += spools.length

                    return (
                      <div key={material} className="ml-2">
                        {/* Material header */}
                        <button
                          onClick={() => toggleCollapsed(matKey)}
                          className="flex items-center gap-2 py-1.5 text-left w-full group"
                        >
                          <span className="text-[10px] g-t4 w-3 text-center">
                            {matCollapsed ? "▶" : "▼"}
                          </span>
                          <span className="text-xs font-semibold g-t2">{material}</span>
                          <span className="text-[10px] g-t4">
                            {matTotal} roll
                          </span>
                        </button>

                        {!matCollapsed && (
                          <div className="ml-4 space-y-1">
                            {Array.from(byColor.entries()).map(([colorName, spools]) => {
                              const colorKey = `${brand}|||${material}|||${colorName}`
                              const colorCollapsed = collapsed.has(colorKey)
                              const colorHex = spools[0]?.colorHex ?? "#888"
                              const nonEmptyCount = spools.filter(
                                (s) => s.status !== "empty"
                              ).length

                              return (
                                <div key={colorName} className="ml-2">
                                  {/* Color header */}
                                  <button
                                    onClick={() => toggleCollapsed(colorKey)}
                                    className="flex items-center gap-2 py-1 text-left w-full"
                                  >
                                    <span className="text-[10px] g-t4 w-3 text-center">
                                      {colorCollapsed ? "▶" : "▼"}
                                    </span>
                                    {/* Color dot */}
                                    <span
                                      className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10 dark:border-white/10"
                                      style={{ backgroundColor: colorHex }}
                                    />
                                    <span className="text-xs g-t2">{colorName}</span>
                                    {nonEmptyCount > 0 && (
                                      <span
                                        className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
                                        style={{
                                          background: "rgba(99,102,241,0.15)",
                                          color: "#a5b4fc",
                                        }}
                                      >
                                        {nonEmptyCount}
                                      </span>
                                    )}
                                    {nonEmptyCount < spools.length && (
                                      <span className="text-[10px] g-t4">
                                        +{spools.length - nonEmptyCount} empty
                                      </span>
                                    )}
                                  </button>

                                  {!colorCollapsed && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 ml-5 mb-2">
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
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {totalFiltered === 0 && (
        <div className="g-t3 py-8 text-center">Tidak ada spool ditemukan.</div>
      )}

      {/* ── Modals (preserved) ── */}
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
