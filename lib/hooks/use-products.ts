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
  productHpp: number | null
  variants: Array<{ variantId: string; hpp: number | null }>
}

async function setHpp(vars: SetHppVariables): Promise<void> {
  const res = await fetch(`/api/products/${vars.productId}/hpp`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productHpp: vars.productHpp,
      variants: vars.variants,
    }),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}
