"use client"

import { useState } from "react"
import { useKatalogList } from "@/lib/hooks/use-katalog"
import { KatalogCard } from "./KatalogCard"
import { KatalogForm } from "./KatalogForm"
import type { ProdukInternalData } from "@/lib/katalog/types"

export function KatalogTab() {
  const { data, isLoading } = useKatalogList()
  const items: ProdukInternalData[] = data ?? []

  const [showForm, setShowForm] = useState(false)
  const [editingProduk, setEditingProduk] = useState<ProdukInternalData | null>(null)

  function handleEdit(p: ProdukInternalData) {
    setEditingProduk(p)
    setShowForm(true)
  }

  function handleCloseForm() {
    setShowForm(false)
    setEditingProduk(null)
  }

  return (
    <div className="space-y-6">
      {/* Judul halaman diurus PageShell di halaman produk */}
      <div className="flex justify-end">
        <button
          onClick={() => { setEditingProduk(null); setShowForm(true) }}
          className="h-9 px-4 rounded-[10px] text-[12px] font-semibold text-white flex items-center gap-1.5 transition-all"
          style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          <span className="text-[15px] leading-none">+</span>
          Produk Baru
        </button>
      </div>

      {isLoading && (
        <div className="text-[11px] text-center py-12 g-t4">
          Memuat katalog...
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-[16px] gap-4 g-card"
             style={{ borderStyle: "dashed" }}>
          <div className="text-4xl">📦</div>
          <div className="text-[13px] font-medium text-center g-t4">
            Belum ada produk di katalog.
          </div>
          <button
            onClick={() => { setEditingProduk(null); setShowForm(true) }}
            className="h-9 px-5 rounded-[10px] text-[12px] font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
          >
            Tambah produk pertama →
          </button>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-3">
          {/* Column headers */}
          <div
            className="items-center px-5 pb-1 gap-3"
            style={{ display: "grid", gridTemplateColumns: "52px 1fr 140px 140px 160px 96px" }}
          >
            <div />
            <div className="text-[9px] font-semibold uppercase tracking-wider g-t5">Produk</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider g-t5">Offline</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider g-t5">Rekm Shopee</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider g-t5">Harga Shopee</div>
            <div />
          </div>
          {items.map(p => (
            <KatalogCard key={p.id} produk={p} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {showForm && (
        <KatalogForm
          initial={editingProduk}
          onClose={handleCloseForm}
        />
      )}
    </div>
  )
}
