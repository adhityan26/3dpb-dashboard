"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ShopeeCategory, ShopeeCategoryAttribute, ShopeeLogisticChannel } from "@/lib/shopee/types"
import type { ShopeeCreateProductInput } from "@/app/api/shopee/products/route"

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  const contentLength = res.headers.get("content-length")
  if (res.status === 204 || contentLength === "0" || !res.body) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function useShopeeCategories(parentCategoryId: number) {
  return useQuery({
    queryKey: ["shopee-categories", parentCategoryId],
    queryFn: () =>
      apiFetch<ShopeeCategory[]>(`/api/shopee/categories?parent_category_id=${parentCategoryId}`),
    staleTime: 10 * 60 * 1000,
  })
}

export function useShopeeAttributes(categoryId: number | null) {
  return useQuery({
    queryKey: ["shopee-attributes", categoryId],
    queryFn: () =>
      apiFetch<ShopeeCategoryAttribute[]>(`/api/shopee/attributes?category_id=${categoryId}`),
    enabled: categoryId != null,
    staleTime: 10 * 60 * 1000,
  })
}

export function useShopeeLogistics() {
  return useQuery({
    queryKey: ["shopee-logistics"],
    queryFn: () => apiFetch<ShopeeLogisticChannel[]>("/api/shopee/logistics"),
    staleTime: 10 * 60 * 1000,
  })
}

export interface ShopeeCreateProductResult {
  item_id: number
  shopeeEditUrl: string
}

export function useCreateShopeeProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ShopeeCreateProductInput) =>
      apiFetch<ShopeeCreateProductResult>("/api/shopee/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["katalog"] })
    },
  })
}
