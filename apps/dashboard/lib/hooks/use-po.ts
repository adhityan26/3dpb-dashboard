'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { POData, POListItem, POInput, UpdatePOInput, OCRPOResult } from '@/lib/po/types'

const PO_KEY = ['po'] as const

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function usePOList() {
  return useQuery({
    queryKey: PO_KEY,
    queryFn: () => apiFetch<{ items: POListItem[] }>('/api/po').then(r => r.items),
  })
}

export function usePO(id: string) {
  return useQuery({
    queryKey: [...PO_KEY, id],
    queryFn: () => apiFetch<POData>(`/api/po/${id}`),
    enabled: !!id,
  })
}

export function useCreatePO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: POInput) => apiFetch<POData>('/api/po', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PO_KEY }),
  })
}

export function useUpdatePO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePOInput }) =>
      apiFetch<POData>(`/api/po/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: PO_KEY })
      qc.invalidateQueries({ queryKey: [...PO_KEY, id] })
    },
  })
}

export function useDeletePO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/po/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PO_KEY }),
  })
}

export function useReceivePO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/po/${id}/receive`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PO_KEY })
      qc.invalidateQueries({ queryKey: ['filament'] })
    },
  })
}

export function useOCRInvoice() {
  return useMutation({
    mutationFn: async (file: File): Promise<OCRPOResult> => {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/po/ocr', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error ?? 'OCR failed')
      }
      return res.json()
    },
  })
}
