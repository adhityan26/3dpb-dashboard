"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useCatalog, useCreateSpool } from "@/lib/hooks/use-filamen"
import type { FilamentCatalogEntry } from "@/lib/filamen/types"

interface SpoolAddPickerProps {
  prefillNfcTagId?: string
  onClose: () => void
}

type Mode = "list" | "manual"

// ── Fix 1: CatalogRow extracted as module-level component ──────────────────────
interface CatalogRowProps {
  entry: FilamentCatalogEntry
  isExpanded: boolean
  notes: string
  rowError: string | null
  isPending: boolean
  prefillNfcTagId?: string
  onToggle: (id: string) => void
  onNotesChange: (id: string, value: string) => void
  onSave: (entry: FilamentCatalogEntry) => void
  onCancel: () => void
}

function CatalogRow({ entry, isExpanded, notes, rowError, isPending, prefillNfcTagId, onToggle, onNotesChange, onSave, onCancel }: CatalogRowProps) {
  return (
    <div className="border-b border-gray-100 dark:border-slate-700 last:border-0">
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700">
        {/* Color swatch */}
        <div
          className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-200 dark:border-slate-600"
          style={{ backgroundColor: entry.colorHex }}
          aria-hidden="true"
        />
        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Fix 4: font-medium → font-semibold */}
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate block">
            {entry.brand} · {entry.colorName}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">{entry.material}</span>
        </div>
        {/* Fix 5: aria-expanded added to + button */}
        <button
          type="button"
          onClick={() => onToggle(entry.id)}
          aria-label={`Tambah ${entry.colorName}`}
          aria-expanded={isExpanded}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0 transition-colors ${
            isExpanded
              ? "bg-gray-400 hover:bg-gray-500"
              : "bg-[#EE4D2D] dark:bg-indigo-600 hover:bg-[#d44226] dark:hover:bg-indigo-700"
          }`}
        >
          {isExpanded ? "−" : "+"}
        </button>
      </div>

      {/* Expanded inline notes */}
      {isExpanded && (
        <div className="px-4 pb-3 bg-orange-50 dark:bg-slate-900 border-t border-orange-100 dark:border-slate-700">
          <label className="text-xs text-gray-500 dark:text-slate-400 block mt-2 mb-1">Catatan (opsional)</label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(entry.id, e.target.value)}
            placeholder="Contoh: beli batch ke-2..."
            rows={2}
            className="w-full border border-gray-200 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm resize-none bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            autoFocus
          />
          {prefillNfcTagId && (
            <p className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded mt-1">
              NFC tag akan otomatis ter-link.
            </p>
          )}
          {rowError && (
            <p className="text-xs text-red-600 mt-1">{rowError}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-600 dark:text-slate-300 px-3 py-1.5 rounded border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => onSave(entry)}
              disabled={isPending}
              className="text-sm bg-[#EE4D2D] dark:bg-indigo-600 text-white px-4 py-1.5 rounded hover:bg-[#d44226] dark:hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function SpoolAddPicker({ prefillNfcTagId, onClose }: SpoolAddPickerProps) {
  const [mode, setMode] = useState<Mode>("list")
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({})
  const [rowError, setRowError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const { data: catalogData, isLoading: catalogLoading } = useCatalog()
  const createSpool = useCreateSpool()

  // Auto-focus search on open
  useEffect(() => {
    if (mode === "list") {
      searchRef.current?.focus()
    }
  }, [mode])

  // Escape key closes modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Flatten catalog into a list grouped by brand
  const flatEntries = useMemo<FilamentCatalogEntry[]>(() => {
    const catalog = catalogData?.catalog ?? {}
    const entries: FilamentCatalogEntry[] = []
    const brands = Object.keys(catalog).sort()
    for (const brand of brands) {
      const materials = Object.keys(catalog[brand] ?? {}).sort()
      for (const material of materials) {
        for (const entry of catalog[brand][material] ?? []) {
          entries.push(entry)
        }
      }
    }
    return entries
  }, [catalogData])

  const filteredEntries = useMemo<FilamentCatalogEntry[]>(() => {
    if (!search.trim()) return flatEntries
    // Split query into words — every word must match somewhere (AND logic)
    // e.g. "esun blue" → must contain "esun" AND "blue" anywhere in brand+material+colorName
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    return flatEntries.filter((e) => {
      const haystack = `${e.brand} ${e.material} ${e.colorName}`.toLowerCase()
      return words.every((w) => haystack.includes(w))
    })
  }, [flatEntries, search])

  const isSearching = search.trim().length > 0

  // Group by brand for display (only when not searching)
  const groupedEntries = useMemo<{ brand: string; entries: FilamentCatalogEntry[] }[]>(() => {
    if (isSearching) return []
    const map = new Map<string, FilamentCatalogEntry[]>()
    for (const entry of filteredEntries) {
      const list = map.get(entry.brand) ?? []
      list.push(entry)
      map.set(entry.brand, list)
    }
    return Array.from(map.entries()).map(([brand, entries]) => ({ brand, entries }))
  }, [filteredEntries, isSearching])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    },
    [onClose]
  )

  const handleRowToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
    setRowError(null)
  }, [])

  const handleRowNotesChange = useCallback((id: string, value: string) => {
    setRowNotes((prev) => ({ ...prev, [id]: value }))
  }, [])

  const handleRowCancel = useCallback(() => {
    setExpandedId(null)
    setRowError(null)
  }, [])

  async function handleRowSave(entry: FilamentCatalogEntry) {
    setRowError(null)
    try {
      await createSpool.mutateAsync({
        brand: entry.brand,
        material: entry.material,
        colorName: entry.colorName,
        colorHex: entry.colorHex,
        catalogId: entry.id,
        nfcTagId: prefillNfcTagId,
        notes: rowNotes[entry.id] ?? "",
      })
      onClose()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Gagal menyimpan.")
    }
  }

  // ── Manual mode state ──────────────────────────────────────────────────────
  const [manualBrand, setManualBrand] = useState("")
  const [manualMaterial, setManualMaterial] = useState("")
  const [manualColorName, setManualColorName] = useState("")
  const [manualColorHex, setManualColorHex] = useState("#ffffff")
  const [manualNotes, setManualNotes] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)

  async function handleManualSave(e: React.FormEvent) {
    e.preventDefault()
    setManualError(null)
    try {
      await createSpool.mutateAsync({
        brand: manualBrand,
        material: manualMaterial,
        colorName: manualColorName,
        colorHex: manualColorHex,
        nfcTagId: prefillNfcTagId,
        notes: manualNotes,
      })
      onClose()
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Gagal menyimpan.")
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spool-picker-title"
      >
        {/* Fix 3: Header always 2 flex children — left group + close button */}
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700">
          <div className="flex items-center gap-2">
            {mode === "manual" && (
              <button onClick={() => setMode("list")} className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 text-sm">← Kembali</button>
            )}
            <h2 id="spool-picker-title" className="font-semibold text-gray-800 dark:text-slate-100">
              {mode === "list" ? "Tambah Spool" : "Tambah Manual"}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">✕</button>
        </div>

        {/* ── Mode 1: List ──────────────────────────────────────────────────── */}
        {mode === "list" && (
          <>
            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setExpandedId(null) }}
                placeholder="Cari brand, material, atau warna..."
                className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/30 focus:border-[#EE4D2D] bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                aria-label="Cari filamen"
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-96 flex-1">
              {catalogLoading && (
                <div className="py-10 text-center text-gray-400 dark:text-slate-500 text-sm">Memuat katalog...</div>
              )}

              {!catalogLoading && filteredEntries.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-500 dark:text-slate-400">
                  Tidak ditemukan.{" "}
                  <button
                    type="button"
                    onClick={() => setMode("manual")}
                    className="text-[#EE4D2D] dark:text-indigo-400 hover:underline font-medium"
                  >
                    Tambah manual →
                  </button>
                </div>
              )}

              {!catalogLoading && filteredEntries.length > 0 && isSearching && (
                // Flat list when searching
                filteredEntries.map((entry) => (
                  <CatalogRow
                    key={entry.id}
                    entry={entry}
                    isExpanded={expandedId === entry.id}
                    notes={rowNotes[entry.id] ?? ""}
                    rowError={expandedId === entry.id ? rowError : null}
                    isPending={createSpool.isPending}
                    prefillNfcTagId={prefillNfcTagId}
                    onToggle={handleRowToggle}
                    onNotesChange={handleRowNotesChange}
                    onSave={handleRowSave}
                    onCancel={handleRowCancel}
                  />
                ))
              )}

              {!catalogLoading && filteredEntries.length > 0 && !isSearching && (
                // Grouped by brand
                groupedEntries.map(({ brand, entries: brandEntries }) => (
                  <div key={brand}>
                    <div className="sticky top-0 bg-gray-50 dark:bg-slate-900 px-4 py-1 text-[10px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-semibold z-10">
                      {brand}
                    </div>
                    {brandEntries.map((entry) => (
                      <CatalogRow
                        key={entry.id}
                        entry={entry}
                        isExpanded={expandedId === entry.id}
                        notes={rowNotes[entry.id] ?? ""}
                        rowError={expandedId === entry.id ? rowError : null}
                        isPending={createSpool.isPending}
                        prefillNfcTagId={prefillNfcTagId}
                        onToggle={handleRowToggle}
                        onNotesChange={handleRowNotesChange}
                        onSave={handleRowSave}
                        onCancel={handleRowCancel}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Fix 2: Footer visible when catalog has data (flatEntries), not just filtered */}
            {!catalogLoading && flatEntries.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="text-xs text-gray-400 dark:text-slate-500 hover:text-[#EE4D2D] dark:hover:text-indigo-400 transition-colors"
                >
                  Filamen tidak ada di katalog? Tambah manual →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Mode 2: Manual ────────────────────────────────────────────────── */}
        {mode === "manual" && (
          <form onSubmit={handleManualSave} className="p-5 space-y-4 overflow-y-auto">
            <div>
              <label htmlFor="manual-brand" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">
                Brand
              </label>
              <input
                id="manual-brand"
                value={manualBrand}
                onChange={(e) => setManualBrand(e.target.value)}
                required
                placeholder="Contoh: Bambu Lab"
                className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="manual-material" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">
                Material
              </label>
              <input
                id="manual-material"
                value={manualMaterial}
                onChange={(e) => setManualMaterial(e.target.value)}
                required
                placeholder="Contoh: PLA"
                className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="manual-color-name" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">
                Nama Warna
              </label>
              <input
                id="manual-color-name"
                value={manualColorName}
                onChange={(e) => setManualColorName(e.target.value)}
                required
                placeholder="Contoh: Jade White"
                className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="manual-color-hex" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">
                Warna (Color Picker)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  id="manual-color-hex"
                  type="color"
                  value={manualColorHex}
                  onChange={(e) => setManualColorHex(e.target.value)}
                  className="w-10 h-8 rounded border border-gray-200 dark:border-slate-600 cursor-pointer p-0.5"
                />
                <span className="text-sm text-gray-500 dark:text-slate-400 font-mono">{manualColorHex}</span>
              </div>
            </div>
            <div>
              <label htmlFor="manual-notes" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">
                Catatan
              </label>
              <input
                id="manual-notes"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Opsional..."
                className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            {prefillNfcTagId && (
              <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded">
                NFC tag akan otomatis ter-link ke spool ini.
              </p>
            )}
            {manualError && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{manualError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-600 dark:text-slate-300 px-3 py-1.5 rounded border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Batal
              </button>
              <div className="flex-1" />
              <button
                type="submit"
                disabled={createSpool.isPending}
                className="text-sm bg-[#EE4D2D] dark:bg-indigo-600 text-white px-4 py-1.5 rounded hover:bg-[#d44226] dark:hover:bg-indigo-700 disabled:opacity-50"
              >
                {createSpool.isPending ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
