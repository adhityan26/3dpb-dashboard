'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProdukInternalData, ProdukInternalInput } from '@/lib/katalog/types'

const KATALOG_KEY = ['katalog'] as const

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  // 204 No Content, 201 with empty body, etc.
  const contentLength = res.headers.get("content-length")
  if (res.status === 204 || contentLength === "0" || !res.body) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function useKatalogList() {
  return useQuery({ queryKey: KATALOG_KEY, queryFn: () => apiFetch<{ items: ProdukInternalData[] }>('/api/katalog').then((r) => r?.items ?? []) })
}

export function useKatalog(id: string) {
  return useQuery({ queryKey: [...KATALOG_KEY, id], queryFn: () => apiFetch<ProdukInternalData>(`/api/katalog/${id}`), enabled: !!id })
}

export function useCreateKatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProdukInternalInput) => apiFetch<ProdukInternalData>('/api/katalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KATALOG_KEY }),
  })
}

export function useUpdateKatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProdukInternalInput }) =>
      apiFetch<ProdukInternalData>(`/api/katalog/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: KATALOG_KEY }); qc.invalidateQueries({ queryKey: [...KATALOG_KEY, id] }) },
  })
}

export function useDeleteKatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/katalog/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KATALOG_KEY }),
  })
}

export function useAddShopeeLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ katalogId, shopeeItemId }: { katalogId: string; shopeeItemId: string }) =>
      apiFetch<void>(`/api/katalog/${katalogId}/shopee-links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopeeItemId }) }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useRemoveShopeeLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ katalogId, shopeeItemId }: { katalogId: string; shopeeItemId: string }) =>
      apiFetch<void>(`/api/katalog/${katalogId}/shopee-links/${shopeeItemId}`, { method: 'DELETE' }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

/** Set or clear kalkulasi for a specific Shopee variant link */
export function useSetVariantKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ katalogId, linkId, kalkulasiId }: { katalogId: string; linkId: string; kalkulasiId: string | null }) =>
      apiFetch<void>(`/api/katalog/${katalogId}/shopee-links/${linkId}/kalkulasi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kalkulasiId }),
      }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useSetKatalogKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ katalogId, kalkulasiId }: { katalogId: string; kalkulasiId: string | null }) =>
      apiFetch<ProdukInternalData>(`/api/katalog/${katalogId}/kalkulasi`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kalkulasiId }) }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useUploadKatalogImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ katalogId, file }: { katalogId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/katalog/${katalogId}/image`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error ?? 'Upload gagal')
      }
      return res.json() as Promise<{ imageUrl: string }>
    },
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
    },
  })
}

export function useDeleteKatalogImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (katalogId: string) =>
      apiFetch<void>(`/api/katalog/${katalogId}/image`, { method: 'DELETE' }),
    onSuccess: (_, katalogId) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
    },
  })
}
