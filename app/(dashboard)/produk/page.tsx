"use client"

import { useMemo, useState, Suspense } from "react"
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
  useProducts,
  useRefreshProducts,
  useUploadProductImage,
} from "@/lib/hooks/use-products"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { ProductFilterValue } from "@/components/products/types"

export default function ProdukPage() {
  return (
    <Suspense>
      <ProdukPageInner />
    </Suspense>
  )
}

function ProdukPageInner() {
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useProducts()
  const refreshProducts = useRefreshProducts()
  const uploadImage = useUploadProductImage()

  async function handleRefresh() {
    await refreshProducts.mutateAsync()
  }
  const router = useRouter()
  const searchParams = useSearchParams()

  const VALID_TABS: ProdukTab[] = ["katalog", "produk", "kalkulator", "filamen"]
  const rawTab = searchParams.get("tab") ?? "katalog"
  const produkTab: ProdukTab = VALID_TABS.includes(rawTab as ProdukTab) ? rawTab as ProdukTab : "katalog"

  const [sidebarOpen, setSidebarOpen] = useState(false)

  function setProdukTab(tab: ProdukTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
    setSidebarOpen(false)
  }

  const [filter, setFilter] = useState<ProductFilterValue>("perlu_perhatian")
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  function handleUploadImage(productId: string, file: File) {
    setUploadingImageFor(productId)
    setToast(null)
    uploadImage.mutate(
      { productId, file },
      {
        onSuccess: () => {
          setToast({
            message: "✅ Foto di-upload. Shopee mungkin review perubahan dalam beberapa menit.",
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

  const filtered = useMemo(() => {
    if (!data) return []
    switch (filter) {
      case "perlu_perhatian": return data.products.filter((p) => p.perluPerhatian)
      case "stok_kritis":     return data.products.filter((p) => p.isStockLow)
      case "unlist":          return data.products.filter((p) => p.status === "UNLIST")
      default:                return data.products
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
    <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <SidebarDrawerShell
        open={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      >
        <ProdukSidebar active={produkTab} onChange={setProdukTab} />
      </SidebarDrawerShell>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {produkTab === "katalog" ? (
          <KatalogTab />
        ) : produkTab === "kalkulator" ? (
          <KalkulasiTab />
        ) : produkTab === "filamen" ? (
          <FilamenTab />
        ) : (
          <>
            {isLoading && !data && (
              <div className="py-12 text-center text-gray-400">Memuat produk...</div>
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
                  <div className="flex items-center gap-2">
                    {data.fetchedAt && (
                      <span className="text-[10px] g-t5">
                        Data Shopee: {new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    <RefreshIndicator
                      lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
                      intervalMs={intervalMs}
                      onRefresh={handleRefresh}
                    />
                  </div>
                </GlassPageHeader>
                <div className="space-y-4 mt-4">
                  <ProductsKpiBar kpi={data.kpi} />
                  <ProductFilter value={filter} onChange={setFilter} counts={counts} />
                  <ProductList
                    products={filtered}
                    onUploadImage={handleUploadImage}
                    uploadingImageFor={uploadingImageFor}
                  />
                </div>
              </>
            )}
          </>
        )}
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
