"use client"

import { useMemo, useState, Suspense, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FilamenTab } from "@/components/filamen/FilamenTab"
import { KalkulasiTab } from "@/components/kalkulator/KalkulasiTab"
import { KatalogTab } from "@/components/katalog/KatalogTab"
import { ProductsKpiBar } from "@/components/products/ProductsKpiBar"
import { ProductFilter } from "@/components/products/ProductFilter"
import { ProductList } from "@/components/products/ProductList"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import { SidebarDrawerShell } from "@/components/layout/SidebarDrawerShell"
import { ProdukSidebar } from "@/components/produk/ProdukSidebar"
import type { ProdukTab } from "@/components/produk/ProdukSidebar"
import {
  useProductsKpi,
  useRefreshProducts,
  useUploadProductImage,
  useProductsPage,
  useSyncProductIndex,
} from "@/lib/hooks/use-products"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import { PageShell } from "@/components/layout/PageShell"
import type { ProductFilterValue } from "@/components/products/types"

export default function ProdukPage() {
  return (
    <Suspense>
      <ProdukPageInner />
    </Suspense>
  )
}

/** Judul PageShell mengikuti tab aktif, supaya selalu menggambarkan yang dilihat. */
const PRODUK_HEADING: Record<ProdukTab, { title: string; description: string }> = {
  katalog:    { title: "Katalog Produk",   description: "Daftar produk internal yang kamu jual" },
  produk:     { title: "Produk",           description: "Pantau produk aktif dan HPP" },
  kalkulator: { title: "Kalkulator Harga", description: "Hitung HPP, Floor Price, dan rekomendasi harga jual per produk" },
  filamen:    { title: "Filamen",          description: "Stok dan katalog filament" },
}

function ProdukPageInner() {
  const { intervalMs } = useRefreshConfig()
  const { data: kpiData } = useProductsKpi()
  const refreshProducts = useRefreshProducts()
  const dataUpdatedAt = undefined
  const uploadImage = useUploadProductImage()
  const syncIndex = useSyncProductIndex()

  async function handleRefresh() {
    await refreshProducts.mutateAsync()
  }

  const router = useRouter()
  const searchParams = useSearchParams()

  const VALID_TABS: ProdukTab[] = ["katalog", "produk", "kalkulator", "filamen"]
  const rawTab = searchParams.get("tab") ?? "katalog"
  const produkTab: ProdukTab = VALID_TABS.includes(rawTab as ProdukTab)
    ? (rawTab as ProdukTab)
    : "katalog"

  const [sidebarOpen, setSidebarOpen] = useState(false)

  function setProdukTab(tab: ProdukTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
    setSidebarOpen(false)
  }

  // ── Pagination & search state ────────────────────────────────────────
  const [filter, setFilter] = useState<ProductFilterValue>("all")
  const [searchInput, setSearchInput] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [page, setPage] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(val)
      setPage(1) // reset to page 1 on new search
    }, 400)
  }, [])

  // Reset page when filter changes (adjust state during render, per React docs)
  const [prevFilter, setPrevFilter] = useState(filter)
  if (filter !== prevFilter) {
    setPrevFilter(filter)
    setPage(1)
  }

  const statusParam =
    filter === "unlist" ? "UNLIST" :
    filter === "stok_kritis" ? "" :     // stock filter is client-side post-fetch
    filter === "perlu_perhatian" ? "" : // same
    ""

  const { data: pageData, isLoading: pageLoading, isError: pageError, error: pageErr } =
    useProductsPage({
      page,
      limit: 20,
      q: debouncedQ,
      status: statusParam,
    })

  // Additional client-side filter for stok_kritis / perlu_perhatian
  const displayedProducts = useMemo(() => {
    if (!pageData) return []
    if (filter === "stok_kritis") return pageData.products.filter((p) => p.isStockLow)
    if (filter === "perlu_perhatian") return pageData.products.filter((p) => p.perluPerhatian)
    return pageData.products
  }, [pageData, filter])

  // KPI counts — fast from DB index
  const counts = useMemo(() => {
    const total = kpiData?.totalProducts ?? pageData?.total ?? 0
    return {
      all: total,
      perlu_perhatian: kpiData?.perluPerhatian ?? 0,
      stok_kritis: kpiData?.stokKritis ?? 0,
      unlist: 0,
    }
  }, [kpiData, pageData])

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
          setToast({ message: `❌ Upload gagal: ${err.message}`, type: "error" })
        },
        onSettled: () => {
          setUploadingImageFor(null)
          setTimeout(() => setToast(null), 6000)
        },
      },
    )
  }

  // ── Empty index state: no products AND not loading AND no search query ──
  const indexEmpty =
    !pageLoading && !pageError && pageData && pageData.total === 0 && !debouncedQ

  const heading = PRODUK_HEADING[produkTab]

  return (
    <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <SidebarDrawerShell
        open={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      >
        <ProdukSidebar active={produkTab} onChange={setProdukTab} />
      </SidebarDrawerShell>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <PageShell
          title={heading.title}
          description={heading.description}
          actions={
            produkTab === "produk" ? (
              <div className="flex items-center gap-2">
                {pageData?.fetchedAt && (
                  <span className="text-[10px] g-t5">
                    Data:{" "}
                    {new Date(pageData.fetchedAt).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncIndex.mutate()}
                  disabled={syncIndex.isPending}
                  className="h-8 text-xs"
                >
                  {syncIndex.isPending ? "Sinkronisasi..." : "Sinkronisasi Index"}
                </Button>
                <RefreshIndicator
                  lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
                  intervalMs={intervalMs}
                  onRefresh={handleRefresh}
                />
              </div>
            ) : undefined
          }
        >
        {produkTab === "katalog" ? (
          <KatalogTab />
        ) : produkTab === "kalkulator" ? (
          <KalkulasiTab />
        ) : produkTab === "filamen" ? (
          <FilamenTab />
        ) : (
            <div className="space-y-4">
              {kpiData && <ProductsKpiBar kpi={kpiData} />}

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Cari produk..."
                  className="w-full max-w-sm h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Filter tabs */}
              <ProductFilter value={filter} onChange={setFilter} counts={counts} />

              {/* Empty index state */}
              {indexEmpty && (
                <div className="py-16 flex flex-col items-center gap-4 text-center">
                  <p className="text-slate-400 text-sm">
                    Index produk belum tersedia. Klik tombol di bawah untuk sinkronisasi pertama kali.
                  </p>
                  <Button
                    onClick={() => syncIndex.mutate()}
                    disabled={syncIndex.isPending}
                  >
                    {syncIndex.isPending ? "Sinkronisasi..." : "Sync Sekarang"}
                  </Button>
                </div>
              )}

              {/* Loading skeleton */}
              {pageLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-20 rounded-xl animate-pulse bg-white/5"
                    />
                  ))}
                </div>
              )}

              {/* Error state */}
              {pageError && (() => {
                const msg =
                  pageErr instanceof Error ? pageErr.message : "Unknown error"
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
                  </div>
                )
              })()}

              {/* Product list */}
              {!pageLoading && !pageError && !indexEmpty && (
                <ProductList
                  products={displayedProducts}
                  onUploadImage={handleUploadImage}
                  uploadingImageFor={uploadingImageFor}
                />
              )}

              {/* Pagination controls */}
              {pageData && pageData.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || pageLoading}
                    className="h-8"
                  >
                    ← Sebelumnya
                  </Button>
                  <span className="text-xs text-slate-400">
                    Halaman {page} / {pageData.totalPages}
                    <span className="ml-2 opacity-60">({pageData.total} produk)</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pageData.totalPages, p + 1))}
                    disabled={page >= pageData.totalPages || pageLoading}
                    className="h-8"
                  >
                    Berikutnya →
                  </Button>
                </div>
              )}
            </div>
        )}
        </PageShell>
      </div>

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
    </div>
  )
}
