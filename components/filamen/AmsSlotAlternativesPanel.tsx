"use client"

import { useState } from "react"
import { useAddAlternative, useDeleteAlternative, useCatalog } from "@/lib/hooks/use-filamen"
import type { AmsSlotData } from "@/lib/filamen/types"

export function AmsSlotAlternativesPanel({ slot }: { slot: AmsSlotData }) {
  const addAlt = useAddAlternative()
  const deleteAlt = useDeleteAlternative()
  const { data: catalogData } = useCatalog()

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<"specific" | "general">("specific")
  const [search, setSearch] = useState("")
  const [selectedCatalogId, setSelectedCatalogId] = useState("")
  const [brand, setBrand] = useState("")
  const [material, setMaterial] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Flatten catalog for search
  const flatCatalog = catalogData
    ? Object.values(catalogData.catalog).flatMap((byMaterial) =>
        Object.values(byMaterial as Record<string, unknown[]>).flat()
      ) as Array<{ id: string; brand: string; material: string; colorName: string; colorHex: string }>
    : []

  const filtered = search.trim()
    ? flatCatalog.filter((e) => {
        const q = search.toLowerCase()
        return `${e.brand} ${e.material} ${e.colorName}`.toLowerCase().includes(q)
      })
    : flatCatalog.slice(0, 20)

  async function handleAdd() {
    setError(null)
    try {
      if (type === "specific") {
        if (!selectedCatalogId) { setError("Pilih filamen dulu"); return }
        await addAlt.mutateAsync({ slotId: slot.id, type: "specific", catalogId: selectedCatalogId })
      } else {
        if (!brand.trim() || !material.trim()) { setError("Brand dan material wajib diisi"); return }
        await addAlt.mutateAsync({ slotId: slot.id, type: "general", brand: brand.trim(), material: material.trim() })
      }
      setShowForm(false)
      setSearch("")
      setSelectedCatalogId("")
      setBrand("")
      setMaterial("")
    } catch { setError("Gagal menyimpan") }
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400 font-medium">Alternatif filamen</span>
        <button onClick={() => { setShowForm(!showForm); setError(null) }}
          className="text-xs text-[#EE4D2D] hover:underline">
          {showForm ? "Batal" : "+ Tambah"}
        </button>
      </div>

      {/* Existing alternatives */}
      {slot.alternatives.length > 0 && (
        <div className="space-y-1 mb-2">
          {slot.alternatives.map((alt) => (
            <div key={alt.id} className="flex items-center gap-2 text-xs text-gray-600">
              {alt.type === "specific" ? (
                <>
                  <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                    style={{ backgroundColor: alt.catalogColorHex ?? "#ccc", display: "inline-block" }} />
                  <span className="flex-1 truncate">
                    {alt.catalogBrand} {alt.catalogColorName} · {alt.catalogMaterial}
                  </span>
                  <span className="text-gray-300 text-xs px-1 py-0.5 rounded bg-gray-100">spesifik</span>
                </>
              ) : (
                <>
                  <span className="w-3 h-3 rounded-full flex-shrink-0 border border-dashed border-gray-400 bg-white inline-block" />
                  <span className="flex-1 truncate">{alt.brand} · {alt.material} (warna apapun)</span>
                  <span className="text-gray-300 text-xs px-1 py-0.5 rounded bg-gray-100">umum</span>
                </>
              )}
              <button onClick={() => deleteAlt.mutateAsync(alt.id)}
                className="text-red-400 hover:text-red-600 ml-1">✕</button>
            </div>
          ))}
        </div>
      )}

      {slot.alternatives.length === 0 && !showForm && (
        <p className="text-xs text-gray-300 italic">Belum ada alternatif</p>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {/* Type toggle */}
          <div className="flex gap-1">
            {(["specific", "general"] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`text-xs px-3 py-1 rounded-full border ${type === t ? "bg-[#EE4D2D] text-white border-[#EE4D2D]" : "bg-white text-gray-600 border-gray-300"}`}>
                {t === "specific" ? "Spesifik (brand+jenis+warna)" : "Umum (brand+jenis)"}
              </button>
            ))}
          </div>

          {type === "specific" ? (
            <div>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari filamen..." className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-1" />
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {filtered.map((e) => (
                  <button key={e.id} onClick={() => setSelectedCatalogId(e.id)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded text-xs ${selectedCatalogId === e.id ? "bg-orange-50 border border-[#EE4D2D]" : "hover:bg-gray-100"}`}>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.colorHex }} />
                    <span className="truncate">{e.brand} {e.colorName} · {e.material}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Tidak ditemukan</p>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input value={brand} onChange={(e) => setBrand(e.target.value)}
                placeholder="Brand (e.g. eSUN)" className="border border-gray-300 rounded px-2 py-1 text-xs" />
              <input value={material} onChange={(e) => setMaterial(e.target.value)}
                placeholder="Material (e.g. PLA)" className="border border-gray-300 rounded px-2 py-1 text-xs" />
            </div>
          )}

          <button onClick={handleAdd} disabled={addAlt.isPending}
            className="bg-[#EE4D2D] text-white text-xs px-3 py-1.5 rounded hover:bg-[#d44226] disabled:opacity-50 w-full">
            {addAlt.isPending ? "Menyimpan..." : "Simpan Alternatif"}
          </button>
        </div>
      )}
    </div>
  )
}
