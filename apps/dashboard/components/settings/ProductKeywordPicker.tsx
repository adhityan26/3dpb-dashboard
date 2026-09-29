"use client"

import { useMemo, useState } from "react"
import { useProductCatalog } from "@/lib/hooks/use-working-projects"

// Search-by-name picker for a table group's keyword list (Jadwal Kirim
// table grouping, Settings > Working Project) — picking a real product
// from the Shopee/Tokopedia catalog adds its exact name as a keyword chip,
// instead of having to type a partial keyword blind. A manual-entry
// fallback stays available for a broader partial keyword (e.g. "gl" to
// catch every GL-branded listing at once) that isn't one exact product name.
export function ProductKeywordPicker({
  keywords,
  onChange,
}: {
  keywords: string[]
  onChange: (keywords: string[]) => void
}) {
  const { data: catalog, isLoading, isError } = useProductCatalog()
  const [query, setQuery] = useState("")
  const [manualOpen, setManualOpen] = useState(false)
  const [manualText, setManualText] = useState("")

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !catalog) return []
    const seen = new Set(keywords.map((k) => k.toLowerCase()))
    return catalog
      .filter((p) => !seen.has(p.name.toLowerCase()) && p.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [catalog, query, keywords])

  function addKeyword(value: string) {
    const trimmed = value.trim()
    if (!trimmed || keywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) return
    onChange([...keywords, trimmed])
    setQuery("")
  }

  function removeKeyword(value: string) {
    onChange(keywords.filter((k) => k !== value))
  }

  function applyManualText() {
    const parsed = manualText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    const merged = [...keywords]
    for (const k of parsed) if (!merged.some((existing) => existing.toLowerCase() === k.toLowerCase())) merged.push(k)
    onChange(merged)
    setManualText("")
    setManualOpen(false)
  }

  return (
    <div className="space-y-2">
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs g-accent"
              style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}
            >
              {k}
              <button type="button" onClick={() => removeKeyword(k)} aria-label={`Hapus ${k}`} className="g-t4 hover:opacity-70">
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
          placeholder={isLoading ? "Memuat katalog produk..." : "🔍 Cari nama produk Shopee/Tokopedia..."}
          disabled={isLoading}
          className="glass-input w-full h-9 rounded-[5px] px-3 text-sm"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-10 max-h-56 overflow-y-auto rounded-[5px]" style={{ background: "var(--g-modal)", border: "1px solid var(--g-card-border)" }}>
            {suggestions.map((p) => (
              <button
                key={`${p.platform}::${p.name}`}
                type="button"
                onClick={() => addKeyword(p.name)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5"
              >
                {p.name}
                <span className="g-t4 ml-2 text-xs">{p.platform === "shopee" ? "Shopee" : "Tokopedia"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isError && (
        <p className="text-xs text-red-500">Gagal memuat katalog produk — masih bisa tambah kata kunci manual di bawah.</p>
      )}

      <button type="button" onClick={() => setManualOpen((v) => !v)} className="text-xs g-accent underline">
        {manualOpen ? "Tutup input manual" : "Kata kunci parsial (mis. \"gl\")? Input manual"}
      </button>
      {manualOpen && (
        <div className="flex gap-2 items-start">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={"Satu kata kunci per baris\ngl\ngreen lantern"}
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
