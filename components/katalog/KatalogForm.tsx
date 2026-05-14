"use client"

import { useState, useEffect } from "react"
import { useCreateKatalog, useUpdateKatalog } from "@/lib/hooks/use-katalog"
import type { ProdukInternalData } from "@/lib/katalog/types"

interface Props {
  initial?: ProdukInternalData | null
  onClose: () => void
  onSaved?: (p: ProdukInternalData) => void
}

export function KatalogForm({ initial, onClose, onSaved }: Props) {
  const [nama, setNama] = useState(initial?.nama ?? "")
  const [deskripsi, setDeskripsi] = useState(initial?.deskripsi ?? "")
  const [error, setError] = useState<string | null>(null)

  const createMut = useCreateKatalog()
  const updateMut = useUpdateKatalog()
  const isPending = createMut.isPending || updateMut.isPending

  useEffect(() => {
    setNama(initial?.nama ?? "")
    setDeskripsi(initial?.deskripsi ?? "")
    setError(null)
  }, [initial?.id])

  async function handleSubmit() {
    const trimmedNama = nama.trim()
    if (!trimmedNama) {
      setError("Nama produk wajib diisi.")
      return
    }
    setError(null)
    try {
      const input = { nama: trimmedNama, deskripsi: deskripsi.trim() || undefined }
      let saved: ProdukInternalData
      if (initial) {
        saved = await updateMut.mutateAsync({ id: initial.id, input })
      } else {
        saved = await createMut.mutateAsync(input)
      }
      onSaved?.(saved)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.")
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[420px] rounded-[20px] overflow-hidden"
        style={{
          background: "rgba(14,14,44,0.97)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
        >
          <div
            className="text-[14px] font-bold"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {initial ? "Edit Produk" : "Tambah Produk Baru"}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-base transition-all"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label
              className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "rgba(165,180,252,0.6)" }}
            >
              Nama Produk *
            </label>
            <input
              type="text"
              value={nama}
              onChange={e => { setNama(e.target.value); setError(null) }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="Contoh: Flexi Shark, Bacang..."
              className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label
              className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "rgba(165,180,252,0.6)" }}
            >
              Deskripsi (opsional)
            </label>
            <textarea
              value={deskripsi}
              onChange={e => setDeskripsi(e.target.value)}
              placeholder="Catatan singkat tentang produk ini..."
              rows={3}
              className="glass-input w-full rounded-[10px] px-3 py-2.5 text-sm resize-none"
              style={{ lineHeight: 1.5 }}
            />
          </div>

          {error && (
            <div
              className="text-[11px] px-3 py-2 rounded-[8px]"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#f87171",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 rounded-[10px] text-[12px] font-medium transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending || !nama.trim()}
              className="flex-1 h-10 rounded-[10px] text-[12px] font-semibold text-white transition-all"
              style={{
                background:
                  isPending || !nama.trim()
                    ? "rgba(99,102,241,0.3)"
                    : "linear-gradient(135deg, #5055e8, #7c84f8)",
                cursor: isPending || !nama.trim() ? "not-allowed" : "pointer",
              }}
            >
              {isPending ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Tambah Produk"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
