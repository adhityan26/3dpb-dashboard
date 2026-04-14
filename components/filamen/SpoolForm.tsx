"use client"

import { useState } from "react"
import { useCatalog, useCreateSpool, useUpdateSpool, useDeleteSpool } from "@/lib/hooks/use-filamen"
import type { SpoolData, SpoolStatus } from "@/lib/filamen/types"
import { writeNfcTag } from "@/lib/filamen/nfc-writer"

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
  const [colorHex, setColorHex] = useState(spool?.colorHex ?? "")
  const [status, setStatus] = useState<SpoolStatus>(spool?.status ?? "new")
  const [notes, setNotes] = useState(spool?.notes ?? "")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [nfcStatus, setNfcStatus] = useState<"idle" | "writing" | "done" | "error">("idle")
  const [nfcError, setNfcError] = useState<string | null>(null)

  const catalog = catalogData?.catalog ?? {}
  const brands = Object.keys(catalog).sort()
  const materials = brand ? Object.keys(catalog[brand] ?? {}).sort() : []
  const colors = brand && material ? (catalog[brand]?.[material] ?? []) : []

  function handleColorSelect(name: string) {
    setColorName(name)
    const entry = colors.find((c) => c.colorName === name)
    if (entry) setColorHex(entry.colorHex)
  }

  const isPending = createSpool.isPending || updateSpool.isPending || deleteSpool.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    try {
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
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Gagal menyimpan.")
    }
  }

  async function handleDelete() {
    if (!spool) return
    if (!confirm(`Hapus spool ${spool.brand} ${spool.colorName}? Tidak bisa dibatalkan.`)) return
    setSubmitError(null)
    try {
      await deleteSpool.mutateAsync(spool.id)
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Gagal menghapus.")
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose() }}
      tabIndex={-1}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md shadow-xl" role="dialog" aria-modal="true" aria-labelledby="spool-form-title">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700">
          <h2 id="spool-form-title" className="font-semibold text-gray-800 dark:text-slate-100">
            {spool ? "Edit Spool" : "Tambah Spool Baru"}
          </h2>
          <button onClick={onClose} aria-label="Tutup" className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Add mode: pick from catalog */}
          {!spool && (
            <>
              <div>
                <label htmlFor="spool-brand" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Brand</label>
                <select
                  id="spool-brand"
                  value={brand}
                  onChange={(e) => { setBrand(e.target.value); setMaterial(""); setColorName("") }}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  required
                >
                  <option value="">Pilih brand...</option>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="spool-material" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Material</label>
                <select
                  id="spool-material"
                  value={material}
                  onChange={(e) => { setMaterial(e.target.value); setColorName("") }}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  required
                  disabled={!brand}
                >
                  <option value="">Pilih material...</option>
                  {materials.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="spool-color" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Warna</label>
                <div className="flex gap-2">
                  <select
                    id="spool-color"
                    value={colorName}
                    onChange={(e) => handleColorSelect(e.target.value)}
                    className="flex-1 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                    required
                    disabled={!material}
                  >
                    <option value="">Pilih warna...</option>
                    {colors.map((c) => (
                      <option key={c.id} value={c.colorName}>{c.colorName}</option>
                    ))}
                  </select>
                  {colorHex && (
                    <div
                      className="w-8 h-8 rounded border border-gray-300 dark:border-slate-600 flex-shrink-0"
                      style={{ backgroundColor: colorHex }}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Edit mode: only status + notes */}
          {spool && (
            <div>
              <label htmlFor="spool-status" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Status</label>
              <select
                id="spool-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as SpoolStatus)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
              >
                <option value="new">NEW — tersegel</option>
                <option value="full">FULL — sudah dibuka, masih penuh</option>
                <option value="mid">MID — separuh</option>
                <option value="low">LOW — hampir habis</option>
                <option value="empty">EMPTY — habis</option>
              </select>
            </div>
          )}

          {spool && (
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Tag NFC</label>
              {spool.nfcTagId ? (
                <p className="text-xs text-green-600">📡 Tag terpasang: {spool.nfcTagId.slice(0, 16)}...</p>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    setNfcStatus("writing")
                    setNfcError(null)
                    try {
                      await writeNfcTag(spool.id)
                      await updateSpool.mutateAsync({ id: spool.id, nfcTagId: spool.id })
                      setNfcStatus("done")
                    } catch (e) {
                      setNfcStatus("error")
                      setNfcError(e instanceof Error ? e.message : "Gagal menulis tag.")
                    }
                  }}
                  disabled={nfcStatus === "writing"}
                  className="text-sm border border-indigo-300 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-50 disabled:opacity-50"
                >
                  {nfcStatus === "idle" && "✍️ Tulis NFC Tag"}
                  {nfcStatus === "writing" && "Dekatkan HP ke tag..."}
                  {nfcStatus === "done" && "✅ Tag berhasil ditulis"}
                  {nfcStatus === "error" && "❌ Gagal — coba lagi"}
                </button>
              )}
              {nfcError && (
                <p className="text-xs text-red-600 mt-1">{nfcError}</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="spool-notes" className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Catatan</label>
            <input
              id="spool-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsional..."
              className="w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {prefillNfcTagId && (
            <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded">
              📡 NFC tag akan otomatis ter-link ke spool ini.
            </p>
          )}

          {submitError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{submitError}</p>
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
              className="text-sm text-gray-600 dark:text-slate-300 px-3 py-1.5 rounded border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm bg-[#EE4D2D] dark:bg-indigo-600 text-white px-4 py-1.5 rounded hover:bg-[#d44226] dark:hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
