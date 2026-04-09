"use client"

import { useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { ProductsKpiBar } from "@/components/products/ProductsKpiBar"
import { ProductFilter } from "@/components/products/ProductFilter"
import { ProductList } from "@/components/products/ProductList"
import { HppEditModal } from "@/components/products/HppEditModal"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import { useProducts, useSetHpp } from "@/lib/hooks/use-products"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import type { ProductSummary } from "@/lib/products/types"
import type { ProductFilterValue } from "@/components/products/types"

export default function ProdukPage() {
  const { data: session } = useSession()
  const canEditHpp = session?.user?.role === "OWNER"
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useProducts()
  const setHpp = useSetHpp()
  const [filter, setFilter] = useState<ProductFilterValue>("perlu_perhatian")
  const [editingProduct, setEditingProduct] = useState<ProductSummary | null>(
    null,
  )

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

  if (isLoading && !data) {
    return (
      <div className="py-12 text-center text-gray-400">Memuat produk...</div>
    )
  }

  if (isError) {
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
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Produk</h1>
        <RefreshIndicator
          lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
          intervalMs={intervalMs}
          onRefresh={() => refetch()}
        />
      </div>

      <ProductsKpiBar kpi={data.kpi} />

      <ProductFilter value={filter} onChange={setFilter} counts={counts} />

      <ProductList
        products={filtered}
        onEditHpp={setEditingProduct}
        canEditHpp={canEditHpp}
      />

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
    </div>
  )
}
