"use client"

import { useState } from "react"
import { useCatalog, useCreateSpool, useUpdateSpool, useDeleteSpool } from "@/lib/hooks/use-filamen"
import type { SpoolData, SpoolStatus } from "@/lib/filamen/types"

interface SpoolFormProps {
  /** null = add mode, SpoolData = edit mode */
  spool: SpoolData | null
  /** Pre-fill nfcTagId when opening from NFC scan */
  prefillNfcTagId?: string
  onClose: () => void
}

export function SpoolForm({ spool, prefillNfcTagId, onClose }: SpoolFormProps) {
  const { data: catalogData } = useCatalog()
  const createSpool = useCreateSpool()
  const updateSpool = useUpdateSpool()
  const deleteSpool = useDeleteSpool()

  const [brand, setBrand] = useState(spool?.brand ?? "")
  const [material, setMaterial] = useState(spool?.material ?? "")
  const [colorName, setColorName] = useState(spool?.colorName ?? "")
  const [colorHex, setColorHex] = useState(spool?.colorHex ?? "#000000")
  const [status, setStatus] = useState<SpoolStatus>(spool?.status ?? "new")
  const [notes, setNotes] = useState(spool?.notes ?? "")

  const catalog = catalogData?.catalog ?? {}
  const brands = Object.keys(catalog).sort()
  const materials = brand ? Object.keys(catalog[brand] ?? {}).sort() : []
  const colors = brand && material ? (catalog[brand]?.[material] ?? []) : []

  function handleColorSelect(name: string) {
    setColorName(name)
    const entry = colors.find((c) => c.colorName === name)
    if (entry) setColorHex(entry.colorHex)
  }

  const isPending = createSpool.isPending || updateSpool.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (spool) {
      await updateSpool.mutateAsync({ id: spool.id, status, notes })
    } else {
      const entry = colors.find((c) => c.colorName === colorName)
      await createSpool.mutateAsync({
        brand,
        material,
        colorName,
        colorHex,
        catalogId: entry?.id,
        nfcTagId: prefillNfcTagId,
        notes,
      })
    }
    onClose()
  }

  async function handleDelete() {
    if (!spool) return
    if (!confirm(`Hapus spool ${spool.brand} ${spool.colorName}? Tidak bisa dibatalkan.`)) return
    await deleteSpool.mutateAsync(spool.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">
            {spool ? "Edit Spool" : "Tambah Spool Baru"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Add mode: pick from catalog */}
          {!spool && (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Brand</label>
                <select
                  value={brand}
                  onChange={(e) => { setBrand(e.target.value); setMaterial(""); setColorName("") }}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                  required
                >
                  <option value="">Pilih brand...</option>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Material</label>
                <select
                  value={material}
                  onChange={(e) => { setMaterial(e.target.value); setColorName("") }}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                  required
                  disabled={!brand}
                >
                  <option value="">Pilih material...</option>
                  {materials.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Warna</label>
                <div className="flex gap-2">
                  <select
                    value={colorName}
                    onChange={(e) => handleColorSelect(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                    required
                    disabled={!material}
                  >
                    <option value="">Pilih warna...</option>
                    {colors.map((c) => (
                      <option key={c.id} value={c.colorName}>{c.colorName}</option>
                    ))}
                  </select>
                  <div
                    className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: colorHex }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Edit mode: only status + notes */}
          {spool && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SpoolStatus)}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="new">NEW — tersegel</option>
                <option value="full">FULL — sudah dibuka, masih penuh</option>
                <option value="mid">MID — separuh</option>
                <option value="low">LOW — hampir habis</option>
                <option value="empty">EMPTY — habis</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Catatan</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsional..."
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>

          {prefillNfcTagId && (
            <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded">
              📡 NFC tag akan otomatis ter-link ke spool ini.
            </p>
          )}

          <div className="flex gap-2 pt-2">
            {spool && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteSpool.isPending}
                className="text-sm text-red-600 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 hover:bg-red-50"
              >
                Hapus
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-600 px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm bg-[#EE4D2D] text-white px-4 py-1.5 rounded hover:bg-[#d44226] disabled:opacity-50"
            >
              {isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
