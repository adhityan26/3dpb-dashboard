"use client"

import { useState, useEffect, useRef } from "react"
import { useCreateKatalog, useUpdateKatalog, useKatalogList } from "@/lib/hooks/use-katalog"
import type { ProdukInternalData } from "@/lib/katalog/types"

interface Props {
  initial?: ProdukInternalData | null
  onClose: () => void
  onSaved?: (p: ProdukInternalData) => void
}

export function KatalogForm({ initial, onClose, onSaved }: Props) {
  const [nama, setNama] = useState(initial?.nama ?? "")
  const [deskripsi, setDeskripsi] = useState(initial?.deskripsi ?? "")
  const [kategori, setKategori] = useState(initial?.kategori ?? "")
  const [sourceModel, setSourceModel] = useState(initial?.sourceModel ?? "")
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [tagInput, setTagInput] = useState("")
  const [showKategoriDropdown, setShowKategoriDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kategoriRef = useRef<HTMLDivElement>(null)

  const createMut = useCreateKatalog()
  const updateMut = useUpdateKatalog()
  const { data: allItems } = useKatalogList()
  const isPending = createMut.isPending || updateMut.isPending

  // Collect unique existing categories and tags from catalog
  const existingKategoris = Array.from(
    new Set((allItems ?? []).map(i => i.kategori).filter(Boolean) as string[])
  ).filter(k => k !== kategori)

  const existingTags = Array.from(
    new Set((allItems ?? []).flatMap(i => i.tags))
  ).filter(t => !tags.includes(t))

  useEffect(() => {
    setNama(initial?.nama ?? "")
    setDeskripsi(initial?.deskripsi ?? "")
    setKategori(initial?.kategori ?? "")
    setSourceModel(initial?.sourceModel ?? "")
    setTags(initial?.tags ?? [])
    setTagInput("")
    setError(null)
  }, [initial?.id])

  // Close kategori dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (kategoriRef.current && !kategoriRef.current.contains(e.target as Node)) {
        setShowKategoriDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function addTag(tag: string) {
    const t = tag.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput("")
  }

  function removeTag(tag: string) {
    setTags(prev => prev.filter(t => t !== tag))
  }

  async function handleSubmit() {
    const trimmedNama = nama.trim()
    if (!trimmedNama) { setError("Nama produk wajib diisi."); return }
    setError(null)
    try {
      const input = {
        nama: trimmedNama,
        deskripsi: deskripsi.trim() || null,
        kategori: kategori.trim() || null,
        tags,
        sourceModel: sourceModel.trim() || null,
      }
      const saved = initial
        ? await updateMut.mutateAsync({ id: initial.id, input })
        : await createMut.mutateAsync(input)
      onSaved?.(saved)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.")
    }
  }

  const fieldLabel = "block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
  const fieldColor = { color: "rgba(165,180,252,0.6)" }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[480px] max-h-[90vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.97)", border: "1px solid rgba(99,102,241,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
             style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
          <div className="text-[14px] font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
            {initial ? "Edit Produk" : "Tambah Produk Baru"}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-base"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Nama */}
          <div>
            <label className={fieldLabel} style={fieldColor}>Nama Produk *</label>
            <input type="text" value={nama}
              onChange={e => { setNama(e.target.value); setError(null) }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="Contoh: Flexi Shark, Bacang..."
              className="glass-input w-full h-10 rounded-[10px] px-3 text-sm" autoFocus />
          </div>

          {/* Kategori — appendable dropdown */}
          <div ref={kategoriRef} className="relative">
            <label className={fieldLabel} style={fieldColor}>Kategori (opsional)</label>
            <input
              type="text"
              value={kategori}
              onChange={e => { setKategori(e.target.value); setShowKategoriDropdown(true) }}
              onFocus={() => setShowKategoriDropdown(true)}
              placeholder="Cth: Keychain, Figurine, Aksesori..."
              className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
            />
            {showKategoriDropdown && existingKategoris.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-[10px] overflow-hidden z-10"
                style={{ background: "rgba(14,14,44,0.98)", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                {existingKategoris
                  .filter(k => !kategori || k.toLowerCase().includes(kategori.toLowerCase()))
                  .slice(0, 6)
                  .map(k => (
                    <button
                      key={k}
                      className="w-full text-left px-3 py-2 text-sm transition-all"
                      style={{ color: "rgba(255,255,255,0.7)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.12)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      onClick={() => { setKategori(k); setShowKategoriDropdown(false) }}
                    >
                      {k}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Tags — chip input */}
          <div>
            <label className={fieldLabel} style={fieldColor}>Tags (opsional)</label>
            {/* Current tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-[9px] font-bold ml-0.5 transition-colors"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
                    >✕</button>
                  </span>
                ))}
              </div>
            )}
            {/* Tag input */}
            <div className="relative">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                    e.preventDefault()
                    addTag(tagInput)
                  }
                }}
                placeholder="Ketik tag lalu Enter..."
                className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
              />
              {/* Suggestion chips */}
              {tagInput.trim() === "" && existingTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {existingTags.slice(0, 8).map(tag => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      className="text-[10px] px-2 py-0.5 rounded-full transition-all"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.4)" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.35)"; e.currentTarget.style.color = "#a5b4fc" }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)" }}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Source Model */}
          <div>
            <label className={fieldLabel} style={fieldColor}>Source / Model Referensi (opsional)</label>
            <input
              type="text"
              value={sourceModel}
              onChange={e => setSourceModel(e.target.value)}
              placeholder="URL, path folder, atau keterangan bebas..."
              className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
            />
            <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
              Cth: https://makerworld.com/... · /Designs/Flexi Shark/ · Dibuat dari scratch
            </div>
          </div>

          {/* Deskripsi */}
          <div>
            <label className={fieldLabel} style={fieldColor}>Deskripsi (opsional)</label>
            <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)}
              placeholder="Catatan singkat tentang produk ini..."
              rows={3}
              className="glass-input w-full rounded-[10px] px-3 py-2.5 text-sm resize-none"
              style={{ lineHeight: 1.5 }}
            />
          </div>

          {error && (
            <div className="text-[11px] px-3 py-2 rounded-[8px]"
                 style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 h-10 rounded-[10px] text-[12px] font-medium transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
              Batal
            </button>
            <button onClick={handleSubmit} disabled={isPending || !nama.trim()}
                    className="flex-1 h-10 rounded-[10px] text-[12px] font-semibold text-white transition-all"
                    style={{
                      background: isPending || !nama.trim() ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #5055e8, #7c84f8)",
                      cursor: isPending || !nama.trim() ? "not-allowed" : "pointer",
                    }}>
              {isPending ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Tambah Produk"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
