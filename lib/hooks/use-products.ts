"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ProductsListResult, ProductsPageResult } from "@/lib/products/types"
import { useRefreshConfig } from "@/lib/use-refresh-config"

const PRODUCTS_KEY = ["products"] as const

async function fetchProducts(): Promise<ProductsListResult> {
  const res = await fetch("/api/products")
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useProducts() {
  const { intervalMs } = useRefreshConfig()
  return useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: fetchProducts,
    staleTime: 4 * 60 * 1000, // 4 min — don't re-fetch if cached data is fresh
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    refetchIntervalInBackground: false,
  })
}

export function useRefreshProducts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // Invalidate server-side cache then refetch
      await fetch("/api/products/refresh", { method: "POST" })
      return qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}

interface SetHppVariables {
  productId: string
  /** Omit to leave unchanged, `null` to delete, number to upsert */
  productHpp?: number | null
  /** Variants not listed are untouched */
  variants?: Array<{ variantId: string; hpp: number | null }>
}

async function setHpp(vars: SetHppVariables): Promise<void> {
  const payload: Record<string, unknown> = {}
  if ("productHpp" in vars) payload.productHpp = vars.productHpp
  if (vars.variants) payload.variants = vars.variants

  const res = await fetch(`/api/products/${vars.productId}/hpp`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useSetHpp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setHpp,
    // Optimistic update: patch the cache immediately so UI reflects the change
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: PRODUCTS_KEY })
      const previous = queryClient.getQueryData<ProductsListResult>(PRODUCTS_KEY)
      if (!previous) return { previous }

      const updatedProducts = previous.products.map((p) => {
        if (p.productId !== vars.productId) return p

        let nextProduct = p
        if ("productHpp" in vars) {
          nextProduct = { ...nextProduct, hpp: vars.productHpp ?? null }
        }

        if (vars.variants && vars.variants.length > 0) {
          const overrideMap = new Map(
            vars.variants.map((v) => [v.variantId, v.hpp]),
          )
          nextProduct = {
            ...nextProduct,
            variants: nextProduct.variants.map((v) =>
              overrideMap.has(v.variantId)
                ? { ...v, hpp: overrideMap.get(v.variantId) ?? null }
                : v,
            ),
          }
        }

        // Recompute gross margin
        const effectiveHpp = nextProduct.hpp
        nextProduct = {
          ...nextProduct,
          grossMargin30d:
            effectiveHpp !== null
              ? nextProduct.omzet30d - effectiveHpp * nextProduct.qtySold30d
              : null,
        }

        return nextProduct
      })

      queryClient.setQueryData<ProductsListResult>(PRODUCTS_KEY, {
        ...previous,
        products: updatedProducts,
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(PRODUCTS_KEY, ctx.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}

interface UploadImageVars {
  productId: string
  file: File
}

interface UploadImageResult {
  ok: boolean
  imageId?: string
  imageUrl?: string
  totalImages?: number
}

async function uploadProductImage(
  vars: UploadImageVars,
): Promise<UploadImageResult> {
  const fd = new FormData()
  fd.append("image", vars.file)
  const res = await fetch(`/api/products/${vars.productId}/image`, {
    method: "POST",
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useUploadProductImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: uploadProductImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}

// ── KPI from DB index (fast, no Shopee API) ───────────────────────────────

export function useProductsKpi() {
  return useQuery({
    queryKey: ["products-kpi"],
    queryFn: async () => {
      const res = await fetch("/api/products/kpi")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{ totalProducts: number; stokKritis: number; perluPerhatian: number; totalStockItems: number }>
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Paginated product index ────────────────────────────────────────────────

interface ProductsPageOpts {
  page: number
  limit: number
  q: string
  status?: string
}

export function useProductsPage(opts: ProductsPageOpts) {
  return useQuery({
    queryKey: ["products-page", opts],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(opts.page),
        limit: String(opts.limit),
        ...(opts.q ? { q: opts.q } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      })
      const res = await fetch(`/api/products/page?${params}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<ProductsPageResult>
    },
    staleTime: 4 * 60 * 1000,
  })
}

export function useSyncProductIndex() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await fetch("/api/products/sync-index", { method: "POST" })
      return qc.invalidateQueries({ queryKey: ["products-page"] })
    },
  })
}
