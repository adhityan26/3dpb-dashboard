"use client"

import { useMemo, useState } from "react"
import { useShopeeProductCatalog } from "@/lib/hooks/use-working-projects"

// Search-by-name picker for a list of Shopee item IDs — replaces having to
// copy the numeric ID out of a product's Shopee URL by hand. Selected IDs
// show as removable chips (with the real product name when the catalog has
// it); a manual-entry fallback stays available for an ID not in the
// catalog yet (e.g. a brand new listing) or for bulk-pasting many at once.
export function ShopeeProductIdPicker({
  ids,
  onChange,
}: {
  ids: string[]
  onChange: (ids: string[]) => void
}) {
  const { data: catalog, isLoading, isError } = useShopeeProductCatalog()
  const [query, setQuery] = useState("")
  const [manualOpen, setManualOpen] = useState(false)
  const [manualText, setManualText] = useState("")

  const nameById = useMemo(() => new Map((catalog ?? []).map((p) => [p.itemId, p.name])), [catalog])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !catalog) return []
    return catalog
      .filter((p) => !ids.includes(p.itemId) && (p.name.toLowerCase().includes(q) || p.itemId.includes(q)))
      .slice(0, 8)
  }, [catalog, query, ids])

  function addId(id: string) {
    const trimmed = id.trim()
    if (!trimmed || ids.includes(trimmed)) return
    onChange([...ids, trimmed])
    setQuery("")
  }

  function removeId(id: string) {
    onChange(ids.filter((existing) => existing !== id))
  }

  function applyManualText() {
    const parsed = manualText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    const merged = [...ids]
    for (const id of parsed) if (!merged.includes(id)) merged.push(id)
    onChange(merged)
    setManualText("")
    setManualOpen(false)
  }

  return (
    <div className="space-y-2">
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs g-accent"
              style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}
              title={id}
            >
              {nameById.get(id) ?? id}
              <button type="button" onClick={() => removeId(id)} aria-label={`Hapus ${nameById.get(id) ?? id}`} className="g-t4 hover:opacity-70">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isLoading ? "Memuat daftar produk Shopee..." : "🔍 Cari nama produk Shopee..."}
          disabled={isLoading}
          className="glass-input w-full h-9 rounded-[5px] px-3 text-sm"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-10 max-h-56 overflow-y-auto rounded-[5px]" style={{ background: "var(--g-modal)", border: "1px solid var(--g-card-border)" }}>
            {suggestions.map((p) => (
              <button
                key={p.itemId}
                type="button"
                onClick={() => addId(p.itemId)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5"
              >
                {p.name}
                <span className="g-t4 ml-2 text-xs">#{p.itemId}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isError && (
        <p className="text-xs text-red-500">
          Gagal memuat katalog Shopee — masih bisa tambah ID manual di bawah.
        </p>
      )}

      <button type="button" onClick={() => setManualOpen((v) => !v)} className="text-xs g-accent underline">
        {manualOpen ? "Tutup input manual" : "Produk tidak ketemu? Input ID manual"}
      </button>
      {manualOpen && (
        <div className="flex gap-2 items-start">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={"Satu Item ID per baris\n46464886596"}
            rows={3}
            className="flex-1 rounded-[5px] px-3 py-2 text-sm font-mono glass-input"
          />
          <button type="button" onClick={applyManualText} className="h-9 px-3 rounded-[5px] text-sm g-btn-ghost">
            Tambah
          </button>
        </div>
      )}
    </div>
  )
}
