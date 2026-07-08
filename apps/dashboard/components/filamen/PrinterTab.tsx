"use client"

import { useState } from "react"
import { usePrinters, useCreatePrinter, useUpdatePrinter, useDeletePrinter } from "@/lib/hooks/use-filamen"
import type { PrinterData } from "@/lib/filamen/types"

export function PrinterTab() {
  const { data: printers, isLoading } = usePrinters()
  const createPrinter = useCreatePrinter()
  const updatePrinter = useUpdatePrinter()
  const deletePrinter = useDeletePrinter()

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", model: "", notes: "" })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<PrinterData>>({})
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!form.name.trim()) { setError("Nama printer wajib diisi"); return }
    setError(null)
    try {
      await createPrinter.mutateAsync(form)
      setForm({ name: "", model: "", notes: "" })
      setShowAdd(false)
    } catch { setError("Gagal tambah printer") }
  }

  async function handleUpdate(id: string) {
    try {
      await updatePrinter.mutateAsync({ id, ...editForm })
      setEditingId(null)
    } catch { setError("Gagal update printer") }
  }

  async function handleToggle(p: PrinterData) {
    await updatePrinter.mutateAsync({ id: p.id, isActive: !p.isActive })
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus printer ini?")) return
    await deletePrinter.mutateAsync(id)
  }

  if (isLoading) return <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Memuat printer...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-slate-400">Daftar printer yang digunakan untuk produksi</p>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700"
        >
          + Tambah Printer
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-900 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-200">Printer Baru</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block" htmlFor="add-name">Nama *</label>
              <input id="add-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. X1C #1" className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block" htmlFor="add-model">Model</label>
              <input id="add-model" value={form.model} onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="e.g. X1C, P1S" className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block" htmlFor="add-notes">Catatan</label>
            <input id="add-notes" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Opsional" className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={createPrinter.isPending}
              className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700 disabled:opacity-50">
              Simpan
            </button>
            <button onClick={() => { setShowAdd(false); setError(null) }}
              className="text-sm text-gray-500 dark:text-slate-400 px-4 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700">
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Printer list */}
      {!printers || printers.length === 0 ? (
        <div className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">Belum ada printer.</div>
      ) : (
        <div className="space-y-2">
          {printers.map((p: PrinterData) => (
            <div key={p.id} className={`border rounded-lg p-4 bg-white dark:bg-slate-800 ${p.isActive ? "border-gray-200 dark:border-slate-700" : "border-gray-100 dark:border-slate-700 opacity-60"}`}>
              {editingId === p.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={editForm.name ?? p.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100" placeholder="Nama" />
                    <input value={editForm.model ?? p.model} onChange={(e) => setEditForm(f => ({ ...f, model: e.target.value }))}
                      className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100" placeholder="Model" />
                  </div>
                  <input value={editForm.notes ?? p.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100" placeholder="Catatan" />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(p.id)} className="text-sm bg-[#EE4D2D] dark:bg-indigo-600 text-white px-3 py-1 rounded hover:bg-[#d44226] dark:hover:bg-indigo-700">Simpan</button>
                    <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 dark:text-slate-400 px-3 py-1 rounded border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700">Batal</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-100">{p.name}
                      {p.model && <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{p.model}</span>}
                    </p>
                    {p.notes && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{p.notes}</p>}
                  </div>
                  <button onClick={() => handleToggle(p)}
                    className={`text-xs px-2 py-1 rounded-full border ${p.isActive ? "border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30" : "border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500"}`}>
                    {p.isActive ? "Aktif" : "Nonaktif"}
                  </button>
                  <button onClick={() => { setEditingId(p.id); setEditForm({}) }}
                    className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1">Hapus</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
