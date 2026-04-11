"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ProductsListResult } from "@/lib/products/types"
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
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    refetchIntervalInBackground: false,
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
