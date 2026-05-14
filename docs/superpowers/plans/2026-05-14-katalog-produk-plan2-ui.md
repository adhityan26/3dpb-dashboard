# Plan 3b — Katalog Produk UI

**Date**: 2026-05-14  
**Project**: `shopee-dashboard`  
**Stack**: Next.js 16 App Router · React 19 · TypeScript · Prisma 7 (SQLite) · Tailwind v4 · @tanstack/react-query · Glass UI (dark navy)  
**Depends on**: Plan 3a (Foundation) — `ProdukInternal` model, API routes, and hooks must already exist.

---

## Types assumed from Plan 3a

```ts
// lib/katalog/types.ts  (created by Plan 3a)

export interface ProdukInternalData {
  id: string
  nama: string
  deskripsi?: string | null
  primaryKalkulasiId?: string | null
  hppTotal?: number | null
  floorPrice?: number | null
  shopeeA?: number | null
  kalkulasiStatus?: string | null
  kalkulasiNama?: string | null
  shopeeLinks: { id: string; shopeeItemId: string }[]
  createdAt: string
  updatedAt: string
}

export interface ProdukInternalInput {
  nama: string
  deskripsi?: string
}
```

## Hooks assumed from Plan 3a

```ts
// lib/hooks/use-katalog.ts  (created by Plan 3a)
useKatalogList()                                       // → { data: { items: ProdukInternalData[] } }
useKatalog(id: string)                                 // → { data: ProdukInternalData }
useCreateKatalog()                                     // mutationFn: (input: ProdukInternalInput) => ProdukInternalData
useUpdateKatalog()                                     // mutationFn: ({ id, input }) => ProdukInternalData
useDeleteKatalog()                                     // mutationFn: (id: string) => void
useAddShopeeLink()                                     // mutationFn: ({ katalogId, shopeeItemId }) => void
useRemoveShopeeLink()                                  // mutationFn: ({ katalogId, linkId }) => void
useSetKatalogKalkulasi()                               // mutationFn: ({ katalogId, kalkulasiId: string|null }) => void
```

---

## Task 1 — KatalogCard + KatalogForm

### Files
- **Create** `components/katalog/KatalogCard.tsx`
- **Create** `components/katalog/KatalogForm.tsx`

---

### `components/katalog/KatalogCard.tsx`

```tsx
"use client"

import { useState } from "react"
import { useDeleteKatalog } from "@/lib/hooks/use-katalog"
import type { ProdukInternalData } from "@/lib/katalog/types"
import { ShopeeLinksSection } from "./ShopeeLinksSection"
import { KalkulasiLinkSection } from "./KalkulasiLinkSection"

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

interface Props {
  produk: ProdukInternalData
  onEdit: (p: ProdukInternalData) => void
}

export function KatalogCard({ produk, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false)
  const deleteMut = useDeleteKatalog()

  async function handleDelete() {
    if (!confirm(`Hapus produk "${produk.nama}"?`)) return
    await deleteMut.mutateAsync(produk.id)
  }

  const hasHpp = produk.hppTotal != null && produk.hppTotal > 0

  return (
    <div
      className="rounded-[14px] overflow-hidden transition-all"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Main row */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Left: name + deskripsi */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[15px] font-bold truncate"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {produk.nama}
          </div>
          {produk.deskripsi && (
            <div
              className="text-[11px] mt-0.5 truncate"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {produk.deskripsi}
            </div>
          )}

          {/* HPP badge */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {hasHpp ? (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(52,211,153,0.12)",
                  color: "#34d399",
                  border: "1px solid rgba(52,211,153,0.2)",
                }}
              >
                HPP: {fmt(produk.hppTotal!)}
                {produk.kalkulasiNama && (
                  <span style={{ color: "rgba(52,211,153,0.65)" }}>
                    {" "}(dari: {produk.kalkulasiNama})
                  </span>
                )}
              </span>
            ) : (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(251,191,36,0.1)",
                  color: "#fbbf24",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}
              >
                Belum ada kalkulasi
              </span>
            )}

            {/* Shopee link count chip */}
            {produk.shopeeLinks.length > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  color: "#a5b4fc",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                {produk.shopeeLinks.length} Shopee link
              </span>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
            style={{
              background: expanded
                ? "rgba(99,102,241,0.2)"
                : "rgba(255,255,255,0.05)",
              border: expanded
                ? "1px solid rgba(99,102,241,0.35)"
                : "1px solid rgba(255,255,255,0.08)",
              color: expanded ? "#a5b4fc" : "rgba(255,255,255,0.5)",
            }}
          >
            {expanded ? "▲ Tutup" : "▼ Detail"}
          </button>
          <button
            onClick={() => onEdit(produk)}
            className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "#a5b4fc",
            }}
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="h-8 px-3 rounded-[8px] text-[10px] font-medium transition-all"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.15)",
              color: "#f87171",
            }}
          >
            {deleteMut.isPending ? "..." : "🗑️"}
          </button>
        </div>
      </div>

      {/* Expanded sections */}
      {expanded && (
        <div
          className="px-5 pb-5 space-y-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="pt-4">
            <ShopeeLinksSection produkId={produk.id} links={produk.shopeeLinks} />
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }} className="pt-4">
            <KalkulasiLinkSection
              produkId={produk.id}
              currentKalkulasiId={produk.primaryKalkulasiId ?? null}
              currentKalkulasiNama={produk.kalkulasiNama ?? null}
              currentHpp={produk.hppTotal ?? null}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

---

### `components/katalog/KatalogForm.tsx`

```tsx
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

  // Reset when `initial` changes (e.g., switching from create to edit)
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
          {/* Nama */}
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

          {/* Deskripsi */}
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

          {/* Error */}
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

          {/* Actions */}
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
```

---

## Task 2 — ShopeeLinksSection + KalkulasiLinkSection

### Files
- **Create** `components/katalog/ShopeeLinksSection.tsx`
- **Create** `components/katalog/KalkulasiLinkSection.tsx`

---

### `components/katalog/ShopeeLinksSection.tsx`

```tsx
"use client"

import { useState } from "react"
import { useAddShopeeLink, useRemoveShopeeLink } from "@/lib/hooks/use-katalog"
import { useProducts } from "@/lib/hooks/use-products"

interface LinkItem {
  id: string
  shopeeItemId: string
}

interface Props {
  produkId: string
  links: LinkItem[]
}

export function ShopeeLinksSection({ produkId, links }: Props) {
  const [search, setSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  const addLink = useAddShopeeLink()
  const removeLink = useRemoveShopeeLink()

  const { data: productsData } = useProducts()
  const allProducts = productsData?.products ?? []

  const linkedIds = new Set(links.map(l => l.shopeeItemId))

  const searchResults = search.trim()
    ? allProducts
        .filter(p =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.productId.toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 6)
    : allProducts.slice(0, 6)

  async function handleAdd(shopeeItemId: string) {
    if (linkedIds.has(shopeeItemId)) return
    await addLink.mutateAsync({ katalogId: produkId, shopeeItemId })
    setSearch("")
  }

  async function handleRemove(linkId: string) {
    await removeLink.mutateAsync({ katalogId: produkId, linkId })
  }

  return (
    <div className="space-y-3">
      {/* Section label */}
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgba(165,180,252,0.6)" }}
      >
        Link Shopee
      </div>

      {/* Current chips */}
      <div className="flex flex-wrap gap-2">
        {links.map(link => (
          <span
            key={link.id}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "#a5b4fc",
            }}
          >
            {link.shopeeItemId}
            <button
              onClick={() => handleRemove(link.id)}
              disabled={removeLink.isPending}
              className="ml-0.5 text-[9px] font-bold transition-all"
              style={{ color: "rgba(165,180,252,0.5)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(165,180,252,0.5)")}
            >
              ✕
            </button>
          </span>
        ))}

        {/* Add button */}
        <button
          onClick={() => setShowSearch(v => !v)}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px dashed rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.45)",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"
            e.currentTarget.style.color = "#a5b4fc"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"
            e.currentTarget.style.color = "rgba(255,255,255,0.45)"
          }}
        >
          + Link Shopee
        </button>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div
          className="rounded-[12px] p-3 space-y-2"
          style={{
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <input
            type="text"
            placeholder="Cari produk Shopee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input w-full h-8 rounded-[8px] px-3 text-[11px]"
            autoFocus
          />
          <div className="space-y-1">
            {searchResults.map(p => {
              const isLinked = linkedIds.has(p.productId)
              return (
                <div
                  key={p.productId}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] transition-all"
                  style={{
                    background: isLinked
                      ? "rgba(99,102,241,0.1)"
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${
                      isLinked
                        ? "rgba(99,102,241,0.25)"
                        : "rgba(255,255,255,0.05)"
                    }`,
                    cursor: isLinked ? "default" : "pointer",
                  }}
                  onClick={() => !isLinked && handleAdd(p.productId)}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[11px] font-medium truncate"
                      style={{ color: "rgba(255,255,255,0.8)" }}
                    >
                      {p.name}
                    </div>
                    <div
                      className="text-[9px]"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                    >
                      {p.productId}
                    </div>
                  </div>
                  {isLinked ? (
                    <span
                      className="text-[10px] flex-shrink-0"
                      style={{ color: "#a5b4fc" }}
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      className="text-[10px] flex-shrink-0"
                      style={{ color: "rgba(99,102,241,0.6)" }}
                    >
                      + Link
                    </span>
                  )}
                </div>
              )
            })}
            {searchResults.length === 0 && (
              <div
                className="text-[10px] text-center py-3"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                Tidak ada produk Shopee ditemukan
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

---

### `components/katalog/KalkulasiLinkSection.tsx`

```tsx
"use client"

import { useState } from "react"
import { useSetKatalogKalkulasi } from "@/lib/hooks/use-katalog"
import { useKalkulasiList } from "@/lib/hooks/use-kalkulator"

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

interface Props {
  produkId: string
  currentKalkulasiId: string | null
  currentKalkulasiNama: string | null
  currentHpp: number | null
}

export function KalkulasiLinkSection({
  produkId,
  currentKalkulasiId,
  currentKalkulasiNama,
  currentHpp,
}: Props) {
  const [showList, setShowList] = useState(false)
  const [search, setSearch] = useState("")

  const setKalkulasi = useSetKatalogKalkulasi()
  const { data: kalkData } = useKalkulasiList()
  const kalkulasiList = kalkData?.items ?? []

  const filtered = search.trim()
    ? kalkulasiList.filter(k =>
        k.nama.toLowerCase().includes(search.toLowerCase())
      )
    : kalkulasiList

  async function handleSelect(kalkulasiId: string) {
    await setKalkulasi.mutateAsync({ katalogId: produkId, kalkulasiId })
    setShowList(false)
    setSearch("")
  }

  async function handleClear() {
    if (!confirm("Lepas link kalkulasi dari produk ini?")) return
    await setKalkulasi.mutateAsync({ katalogId: produkId, kalkulasiId: null })
  }

  return (
    <div className="space-y-3">
      {/* Section label */}
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgba(165,180,252,0.6)" }}
      >
        Sumber HPP (Kalkulasi)
      </div>

      {/* Current state */}
      {currentKalkulasiId ? (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-[10px]"
          style={{
            background: "rgba(52,211,153,0.07)",
            border: "1px solid rgba(52,211,153,0.18)",
          }}
        >
          <div className="flex-1 min-w-0">
            <div
              className="text-[11px] font-semibold truncate"
              style={{ color: "#34d399" }}
            >
              {currentKalkulasiNama ?? "—"}
            </div>
            {currentHpp != null && (
              <div
                className="text-[10px]"
                style={{ color: "rgba(52,211,153,0.55)" }}
              >
                HPP: {fmt(currentHpp)}
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowList(v => !v)}
              className="h-7 px-2.5 rounded-[7px] text-[9px] font-medium transition-all"
              style={{
                background: "rgba(99,102,241,0.15)",
                color: "#a5b4fc",
              }}
            >
              Ganti
            </button>
            <button
              onClick={handleClear}
              disabled={setKalkulasi.isPending}
              className="h-7 px-2.5 rounded-[7px] text-[9px] font-medium transition-all"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "#f87171",
              }}
            >
              Lepas
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            className="text-[11px]"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Belum ada kalkulasi terhubung
          </span>
          <button
            onClick={() => setShowList(v => !v)}
            className="h-7 px-2.5 rounded-[7px] text-[9px] font-medium transition-all"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "#a5b4fc",
            }}
          >
            + Pilih Kalkulasi
          </button>
        </div>
      )}

      {/* Kalkulasi selection list */}
      {showList && (
        <div
          className="rounded-[12px] p-3 space-y-2"
          style={{
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <input
            type="text"
            placeholder="Cari kalkulasi..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input w-full h-8 rounded-[8px] px-3 text-[11px]"
            autoFocus
          />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filtered.map(k => {
              const isCurrent = k.id === currentKalkulasiId
              return (
                <div
                  key={k.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] transition-all"
                  style={{
                    background: isCurrent
                      ? "rgba(99,102,241,0.15)"
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${
                      isCurrent
                        ? "rgba(99,102,241,0.35)"
                        : "rgba(255,255,255,0.05)"
                    }`,
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                  onClick={() => !isCurrent && handleSelect(k.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[11px] font-medium truncate"
                      style={{ color: "rgba(255,255,255,0.82)" }}
                    >
                      {k.nama}
                    </div>
                    <div
                      className="text-[9px]"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                    >
                      HPP: {fmt(k.hppTotal)} · Floor: {fmt(k.floorPrice)}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span
                      className="text-[10px] flex-shrink-0"
                      style={{ color: "#a5b4fc" }}
                    >
                      ✓ Aktif
                    </span>
                  ) : (
                    <button
                      className="h-6 px-2 rounded-[6px] text-[9px] font-semibold text-white flex-shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #5055e8, #7c84f8)",
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        handleSelect(k.id)
                      }}
                    >
                      Pilih
                    </button>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div
                className="text-[10px] text-center py-3"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                Tidak ada kalkulasi ditemukan
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## Task 3 — KatalogTab (main container)

### File
- **Create** `components/katalog/KatalogTab.tsx`

```tsx
"use client"

import { useState } from "react"
import { useKatalogList } from "@/lib/hooks/use-katalog"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import { KatalogCard } from "./KatalogCard"
import { KatalogForm } from "./KatalogForm"
import type { ProdukInternalData } from "@/lib/katalog/types"

export function KatalogTab() {
  const { data, isLoading } = useKatalogList()
  const items: ProdukInternalData[] = data?.items ?? []

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
      <GlassPageHeader
        title="Katalog Produk"
        subtitle="Daftar produk internal yang kamu jual"
      >
        <button
          onClick={() => { setEditingProduk(null); setShowForm(true) }}
          className="h-9 px-4 rounded-[10px] text-[12px] font-semibold text-white flex items-center gap-1.5 transition-all"
          style={{
            background: "linear-gradient(135deg, #5055e8, #7c84f8)",
          }}
          onMouseEnter={e =>
            (e.currentTarget.style.opacity = "0.9")
          }
          onMouseLeave={e =>
            (e.currentTarget.style.opacity = "1")
          }
        >
          <span className="text-[15px] leading-none">+</span>
          Produk Baru
        </button>
      </GlassPageHeader>

      {/* Loading */}
      {isLoading && (
        <div
          className="text-[11px] text-center py-12"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          Memuat katalog...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-[16px] gap-4"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.1)",
          }}
        >
          <div className="text-4xl">📦</div>
          <div
            className="text-[13px] font-medium text-center"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Belum ada produk di katalog.
          </div>
          <button
            onClick={() => { setEditingProduk(null); setShowForm(true) }}
            className="h-9 px-5 rounded-[10px] text-[12px] font-semibold text-white transition-all"
            style={{
              background: "linear-gradient(135deg, #5055e8, #7c84f8)",
            }}
          >
            Tambah produk pertama →
          </button>
        </div>
      )}

      {/* Product list */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-3">
          {items.map(p => (
            <KatalogCard key={p.id} produk={p} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <KatalogForm
          initial={editingProduk}
          onClose={handleCloseForm}
        />
      )}
    </div>
  )
}
```

---

## Task 4 — Replace LinkProdukModal

### File
- **Replace** `components/kalkulator/LinkProdukModal.tsx`

The new modal replaces the old shopee/manual-tab UI. It now lets the user pick which `ProdukInternal` this kalkulasi should power (or create a brand-new one inline).

```tsx
"use client"

import { useState } from "react"
import {
  useKatalogList,
  useSetKatalogKalkulasi,
  useCreateKatalog,
} from "@/lib/hooks/use-katalog"
import type { KalkulasiData } from "@/lib/kalkulator/types"
import type { ProdukInternalData } from "@/lib/katalog/types"

interface Props {
  kalkulasi: KalkulasiData
  onClose: () => void
}

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

export function LinkProdukModal({ kalkulasi, onClose }: Props) {
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [newNama, setNewNama] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)

  const { data } = useKatalogList()
  const items: ProdukInternalData[] = data?.items ?? []

  const setKalkulasi = useSetKatalogKalkulasi()
  const createKatalog = useCreateKatalog()

  const filtered = search.trim()
    ? items.filter(p =>
        p.nama.toLowerCase().includes(search.toLowerCase())
      )
    : items

  async function handlePilih(katalogId: string) {
    await setKalkulasi.mutateAsync({
      katalogId,
      kalkulasiId: kalkulasi.id,
    })
    onClose()
  }

  async function handleCreateAndLink() {
    const trimmedNama = newNama.trim()
    if (!trimmedNama) {
      setCreateError("Nama produk wajib diisi.")
      return
    }
    setCreateError(null)
    try {
      const created = await createKatalog.mutateAsync({ nama: trimmedNama })
      await setKalkulasi.mutateAsync({
        katalogId: created.id,
        kalkulasiId: kalkulasi.id,
      })
      onClose()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Gagal menyimpan.")
    }
  }

  const isPending = setKalkulasi.isPending || createKatalog.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[440px] max-h-[80vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{
          background: "rgba(14,14,44,0.97)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
        >
          <div>
            <div
              className="text-[14px] font-bold"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              🔗 Pilih Produk Katalog
            </div>
            <div
              className="text-[11px] mt-0.5 truncate max-w-[320px]"
              style={{ color: "rgba(165,180,252,0.5)" }}
            >
              {kalkulasi.nama}
            </div>
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

        {/* Search */}
        <div
          className="px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <input
            type="text"
            placeholder="Cari produk katalog..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
            autoFocus
          />
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {filtered.length === 0 && !showCreate && (
            <div
              className="text-[11px] text-center py-6"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              {items.length === 0
                ? "Belum ada produk di katalog."
                : "Tidak ada produk ditemukan."}
            </div>
          )}

          {filtered.map(p => {
            const isCurrent = p.primaryKalkulasiId === kalkulasi.id
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-3 rounded-[10px] transition-all"
                style={{
                  background: isCurrent
                    ? "rgba(99,102,241,0.15)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    isCurrent
                      ? "rgba(99,102,241,0.35)"
                      : "rgba(255,255,255,0.06)"
                  }`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[12px] font-semibold truncate"
                    style={{ color: "rgba(255,255,255,0.88)" }}
                  >
                    {p.nama}
                  </div>
                  <div
                    className="text-[10px] mt-0.5"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    {p.hppTotal != null
                      ? `HPP saat ini: ${fmt(p.hppTotal)}${
                          p.kalkulasiNama ? ` (${p.kalkulasiNama})` : ""
                        }`
                      : "Belum ada HPP"}
                  </div>
                </div>
                {isCurrent ? (
                  <span
                    className="text-[10px] px-2.5 py-1 rounded-full flex-shrink-0 font-medium"
                    style={{
                      background: "rgba(99,102,241,0.2)",
                      color: "#a5b4fc",
                    }}
                  >
                    ✓ Aktif
                  </span>
                ) : (
                  <button
                    onClick={() => handlePilih(p.id)}
                    disabled={isPending}
                    className="h-7 px-3 rounded-[8px] text-[10px] font-semibold text-white flex-shrink-0 transition-all"
                    style={{
                      background: isPending
                        ? "rgba(99,102,241,0.3)"
                        : "linear-gradient(135deg, #5055e8, #7c84f8)",
                      cursor: isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    Pilih
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Divider + Create new product */}
        <div
          className="flex-shrink-0 px-5 py-4 space-y-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {!showCreate ? (
            <button
              onClick={() => { setShowCreate(true); setNewNama("") }}
              className="w-full h-9 rounded-[10px] text-[11px] font-medium transition-all flex items-center justify-center gap-1.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px dashed rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.45)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"
                e.currentTarget.style.color = "#a5b4fc"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"
                e.currentTarget.style.color = "rgba(255,255,255,0.45)"
              }}
            >
              + Buat Produk Baru &amp; Hubungkan
            </button>
          ) : (
            <div className="space-y-2">
              <div
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "rgba(165,180,252,0.6)" }}
              >
                Nama Produk Baru
              </div>
              <input
                type="text"
                value={newNama}
                onChange={e => { setNewNama(e.target.value); setCreateError(null) }}
                onKeyDown={e => e.key === "Enter" && handleCreateAndLink()}
                placeholder="Contoh: Flexi Shark..."
                className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
                autoFocus
              />
              {createError && (
                <div
                  className="text-[10px] px-3 py-1.5 rounded-[7px]"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#f87171",
                  }}
                >
                  ⚠️ {createError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 h-9 rounded-[9px] text-[11px] transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  Batal
                </button>
                <button
                  onClick={handleCreateAndLink}
                  disabled={isPending || !newNama.trim()}
                  className="flex-1 h-9 rounded-[9px] text-[11px] font-semibold text-white transition-all"
                  style={{
                    background:
                      isPending || !newNama.trim()
                        ? "rgba(99,102,241,0.3)"
                        : "linear-gradient(135deg, #5055e8, #7c84f8)",
                    cursor:
                      isPending || !newNama.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Menyimpan..." : "Buat & Hubungkan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## Task 5 — Update KalkulasiTab + KalkulasiHistory

Both files have **minimal changes** — the `linkingKalk` state and the `🔗` button already exist. The only thing that changes is the import path of `LinkProdukModal` still resolves to the same file (it was replaced in-place in Task 4), so no code changes are needed in `KalkulasiTab.tsx` itself.

`KalkulasiHistory.tsx` likewise requires **no changes** — it already calls `onLinkProduk(k)` on the `🔗` button, which is wired in `KalkulasiTab`.

However, `KalkulasiHistory.tsx` currently renders a legacy badge for `produkLinks` that checks `k.produkLinks.some(l => l.isPrimary)` — these old fields are on the `KalkulasiData` type from Plan 3a (which should keep them for backward compat). If Plan 3a removes `produkLinks` from `KalkulasiData`, update the badge block as shown below.

### `components/kalkulator/KalkulasiHistory.tsx` — diff only

Find the section that renders `k.produkLinks.length > 0` and `k.produkLinks.some(...)` badges. Replace with a check against the new `ProdukInternal` linkage exposed by Plan 3a (e.g., `k.katalogNama`). If Plan 3a adds a `katalogNama?: string | null` field to `KalkulasiData`, update:

```tsx
// OLD (lines 107–115):
{k.produkLinks.length > 0 && (
  <span ...>🔗 {k.produkLinks.length}</span>
)}
{k.produkLinks.some(l => l.isPrimary) && (
  <span ...>🔑</span>
)}

// NEW (only if Plan 3a removes produkLinks and adds katalogNama):
{k.katalogNama && (
  <span className="text-[8px] px-1.5 py-0.5 rounded"
        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
    🔗 {k.katalogNama}
  </span>
)}
```

> **If Plan 3a keeps `produkLinks` on `KalkulasiData`**: no change needed in `KalkulasiHistory.tsx`. The old badges will still work.

### `components/kalkulator/KalkulasiTab.tsx` — no changes required

The existing file already has:
- `linkingKalk` state
- `LinkProdukModal` import from `./LinkProdukModal`
- `🔗 Link Produk` button in the success banner
- `onLinkProduk={k => setLinkingKalk(k)}` prop on `KalkulasiHistory`

Because `LinkProdukModal` was replaced in-place in Task 4, `KalkulasiTab.tsx` automatically uses the new modal without any code changes.

---

## Task 6 — Add Katalog tab to Produk page

### File
- **Modify** `app/(dashboard)/produk/page.tsx`

Four changes are needed:

1. Import `KatalogTab`
2. Extend `VALID_TABS` to include `"katalog"`
3. Extend the `ProdukTab` type
4. Add the tab button (matching indigo style of the Kalkulator tab)
5. Add the conditional render

### Full updated file

```tsx
"use client"

import { useMemo, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { FilamenTab } from "@/components/filamen/FilamenTab"
import { KalkulasiTab } from "@/components/kalkulator/KalkulasiTab"
import { KatalogTab } from "@/components/katalog/KatalogTab"
import { ProductsKpiBar } from "@/components/products/ProductsKpiBar"
import { ProductFilter } from "@/components/products/ProductFilter"
import { ProductList } from "@/components/products/ProductList"
import { HppEditModal } from "@/components/products/HppEditModal"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import {
  useProducts,
  useSetHpp,
  useUploadProductImage,
} from "@/lib/hooks/use-products"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { ProductSummary } from "@/lib/products/types"
import type { ProductFilterValue } from "@/components/products/types"

export default function ProdukPage() {
  return (
    <Suspense>
      <ProdukPageInner />
    </Suspense>
  )
}

function ProdukPageInner() {
  const { data: session } = useSession()
  const canEditHpp = session?.user?.role === "OWNER"
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useProducts()
  const setHpp = useSetHpp()
  const uploadImage = useUploadProductImage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const VALID_TABS = ["produk", "filamen", "kalkulator", "katalog"] as const
  type ProdukTab = typeof VALID_TABS[number]
  const rawTab = searchParams.get("tab") ?? "produk"
  const produkTab: ProdukTab = (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as ProdukTab)
    : "produk"

  function setProdukTab(tab: ProdukTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const [filter, setFilter] = useState<ProductFilterValue>("perlu_perhatian")
  const [editingProduct, setEditingProduct] = useState<ProductSummary | null>(null)
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    message: string
    type: "success" | "error"
  } | null>(null)

  function handleUploadImage(productId: string, file: File) {
    setUploadingImageFor(productId)
    setToast(null)
    uploadImage.mutate(
      { productId, file },
      {
        onSuccess: () => {
          setToast({
            message:
              "✅ Foto di-upload. Shopee mungkin review perubahan dalam beberapa menit.",
            type: "success",
          })
        },
        onError: (err) => {
          setToast({
            message: `❌ Upload gagal: ${err.message}`,
            type: "error",
          })
        },
        onSettled: () => {
          setUploadingImageFor(null)
          setTimeout(() => setToast(null), 6000)
        },
      },
    )
  }

  const filtered = useMemo(() => {
    if (!data) return []
    switch (filter) {
      case "perlu_perhatian":
        return data.products.filter((p) => p.perluPerhatian)
      case "stok_kritis":
        return data.products.filter((p) => p.isStockLow)
      case "unlist":
        return data.products.filter((p) => p.status === "UNLIST")
      default:
        return data.products
    }
  }, [data, filter])

  const counts = useMemo(() => {
    if (!data) return { all: 0, perlu_perhatian: 0, stok_kritis: 0, unlist: 0 }
    return {
      all: data.products.length,
      perlu_perhatian: data.products.filter((p) => p.perluPerhatian).length,
      stok_kritis: data.products.filter((p) => p.isStockLow).length,
      unlist: data.products.filter((p) => p.status === "UNLIST").length,
    }
  }, [data])

  return (
    <div className="space-y-4">
      {/* Sub-tab nav: Produk / Filamen / Kalkulator / Katalog */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setProdukTab("produk")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            produkTab === "produk"
              ? "border-[#EE4D2D] text-[#EE4D2D]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Produk
        </button>
        <button
          onClick={() => setProdukTab("filamen")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            produkTab === "filamen"
              ? "border-[#EE4D2D] text-[#EE4D2D]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Filamen
        </button>
        <button
          onClick={() => setProdukTab("kalkulator")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            produkTab === "kalkulator"
              ? "border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
        >
          🧮 Kalkulator
        </button>
        <button
          onClick={() => setProdukTab("katalog")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            produkTab === "katalog"
              ? "border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
        >
          📦 Katalog
        </button>
      </div>

      {produkTab === "katalog" ? (
        <KatalogTab />
      ) : produkTab === "kalkulator" ? (
        <KalkulasiTab />
      ) : produkTab === "filamen" ? (
        <FilamenTab />
      ) : (
        <>
          {isLoading && !data && (
            <div className="py-12 text-center text-gray-400">
              Memuat produk...
            </div>
          )}

          {isError && (() => {
            const msg = error instanceof Error ? error.message : "Unknown error"
            const needsConnect =
              msg.toLowerCase().includes("not authorized") ||
              msg.toLowerCase().includes("shop_id not found")
            return (
              <div className="py-12 text-center space-y-3">
                <div className="text-red-500">{msg}</div>
                {needsConnect && (
                  <a
                    href="/api/shopee/auth"
                    className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#EE4D2D] hover:bg-[#d44226] text-white text-sm font-medium"
                  >
                    Hubungkan Shopee
                  </a>
                )}
                <div>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Coba lagi
                  </Button>
                </div>
              </div>
            )
          })()}

          {data && (
            <>
              <GlassPageHeader title="Produk" subtitle="Pantau produk aktif dan HPP">
                <RefreshIndicator
                  lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
                  intervalMs={intervalMs}
                  onRefresh={() => refetch()}
                />
              </GlassPageHeader>

              <ProductsKpiBar kpi={data.kpi} />

              <ProductFilter
                value={filter}
                onChange={setFilter}
                counts={counts}
              />

              <ProductList
                products={filtered}
                onEditHpp={setEditingProduct}
                onQuickSetHpp={(productId, hpp, variantId) => {
                  if (variantId) {
                    setHpp.mutate({ productId, variants: [{ variantId, hpp }] })
                  } else {
                    setHpp.mutate({ productId, productHpp: hpp })
                  }
                }}
                onUploadImage={handleUploadImage}
                uploadingImageFor={uploadingImageFor}
                canEditHpp={canEditHpp}
              />

              {toast && (
                <div
                  className={`fixed bottom-4 right-4 z-50 max-w-sm p-3 rounded-md shadow-lg text-sm ${
                    toast.type === "success"
                      ? "bg-green-50 border border-green-200 text-green-800"
                      : "bg-red-50 border border-red-200 text-red-800"
                  }`}
                >
                  {toast.message}
                </div>
              )}

              <HppEditModal
                product={editingProduct}
                onClose={() => setEditingProduct(null)}
                onSave={(vars) => {
                  setHpp.mutate(vars, {
                    onSuccess: () => setEditingProduct(null),
                  })
                }}
                isPending={setHpp.isPending}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
```

---

## Task 7 — Build + Deploy

```bash
# From shopee-dashboard/
pnpm build
```

Expected output: no TypeScript errors, no missing module errors. Deploy to Vercel or local via `pnpm start`.

### Pre-deploy checklist

- [ ] Plan 3a is already merged (Prisma migration ran, API routes exist, `lib/hooks/use-katalog.ts` exports all 8 hooks, `lib/katalog/types.ts` exports `ProdukInternalData` and `ProdukInternalInput`)
- [ ] `components/katalog/` directory is created with 5 new files
- [ ] `components/kalkulator/LinkProdukModal.tsx` replaced in-place (old shopee/manual tabs gone)
- [ ] `app/(dashboard)/produk/page.tsx` imports `KatalogTab` and renders it
- [ ] `KalkulasiHistory.tsx` badge block updated if Plan 3a removed `produkLinks` from `KalkulasiData`
- [ ] `pnpm build` passes cleanly

---

## Self-review

### Spec coverage

| Spec requirement | Status |
|---|---|
| KatalogCard: name + deskripsi | ✅ |
| KatalogCard: HPP badge green if set, amber if not | ✅ |
| KatalogCard: Shopee link chips with ✕ | ✅ (in ShopeeLinksSection via expanded panel) |
| KatalogCard: "+ Link Shopee" button | ✅ (ShopeeLinksSection) |
| KatalogCard: Edit + Delete actions | ✅ |
| KatalogCard: ShopeeLinksSection + KalkulasiLinkSection collapsed by default | ✅ (expanded state, default false) |
| KatalogForm: nama required, deskripsi optional | ✅ |
| KatalogForm: used for create and edit | ✅ (initial prop) |
| ShopeeLinksSection: chips + ✕ per chip | ✅ |
| ShopeeLinksSection: search using useProducts() | ✅ |
| KalkulasiLinkSection: shows current kalkulasi + HPP | ✅ |
| KalkulasiLinkSection: useKalkulasiList() | ✅ |
| KalkulasiLinkSection: useSetKatalogKalkulasi | ✅ |
| KalkulasiLinkSection: Clear (passes null) | ✅ ("Lepas" button) |
| New LinkProdukModal: no shopee/manual tabs | ✅ |
| New LinkProdukModal: title "🔗 Pilih Produk Katalog" | ✅ |
| New LinkProdukModal: shows kalkulasi name | ✅ |
| New LinkProdukModal: list ProdukInternal + search | ✅ |
| New LinkProdukModal: "Pilih" → useSetKatalogKalkulasi | ✅ |
| New LinkProdukModal: "Buat Produk Baru" inline | ✅ (showCreate state) |
| KatalogTab: header + subtitle | ✅ |
| KatalogTab: "+" button | ✅ |
| KatalogTab: KatalogCard list | ✅ |
| KatalogTab: empty state with CTA | ✅ |
| Produk page: 4th "Katalog" tab | ✅ |
| Produk page: tab style matches indigo Kalkulator tab | ✅ |
| KalkulasiTab: no changes needed | ✅ (confirmed — existing linkingKalk wires new modal) |
| KalkulasiHistory: "🔗" button kept | ✅ (no changes to the button itself) |

### Placeholder scan

No `// TODO`, `// ...`, `// implement`, `// similar to above`, or `placeholder` strings found in any code block.

### Type consistency

- All hooks (`useKatalogList`, `useCreateKatalog`, `useUpdateKatalog`, `useDeleteKatalog`, `useAddShopeeLink`, `useRemoveShopeeLink`, `useSetKatalogKalkulasi`) are imported from `@/lib/hooks/use-katalog` — the exact path Plan 3a will create.
- `ProdukInternalData` and `ProdukInternalInput` are imported from `@/lib/katalog/types` — consistent throughout.
- `useKalkulasiList` is imported from `@/lib/hooks/use-kalkulator` (existing file, confirmed present).
- `useProducts` is imported from `@/lib/hooks/use-products` (existing file, confirmed present).
- `KalkulasiData` is imported from `@/lib/kalkulator/types` (existing file, confirmed present).
- `fmt()` helper is defined locally in every file that needs it — no cross-file shared utility required.
- `useSetKatalogKalkulasi` mutationFn signature `{ katalogId, kalkulasiId: string | null }` is used consistently in both `KalkulasiLinkSection` ("Lepas" passes `null`) and `LinkProdukModal` (passes `kalkulasi.id`).
- `createKatalog.mutateAsync` returns `ProdukInternalData` (as specified by Plan 3a's `useCreateKatalog` return type), so `created.id` is valid in `handleCreateAndLink`.
