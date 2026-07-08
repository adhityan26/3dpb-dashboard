'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProdukHistoryData, ProdukHistoryInput, ProdukHistoryStats } from '@/lib/history/types'

function historyKey(produkId: string) { return ['history', produkId] as const }

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  const contentLength = res.headers.get('content-length')
  if (res.status === 204 || contentLength === '0' || !res.body) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function useProdukHistory(produkId: string) {
  return useQuery({
    queryKey: historyKey(produkId),
    queryFn: () =>
      apiFetch<{ items: ProdukHistoryData[]; stats: ProdukHistoryStats }>(
        `/api/history/${produkId}`,
      ),
    enabled: !!produkId,
  })
}

export function useAddHistory(produkId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProdukHistoryInput) =>
      apiFetch<ProdukHistoryData>(`/api/history/${produkId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: historyKey(produkId) }),
  })
}

export function useDeleteHistory(produkId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (historyId: string) =>
      apiFetch<void>(`/api/history/${produkId}/${historyId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: historyKey(produkId) }),
  })
}
