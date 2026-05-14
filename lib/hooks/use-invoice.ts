'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  QuotationData, QuotationListItem, QuotationInput, UpdateQuotationInput
} from '@/lib/invoice/types'

const INVOICE_KEY = ['invoice'] as const

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

export function useInvoiceList() {
  return useQuery({
    queryKey: INVOICE_KEY,
    queryFn: () => apiFetch<{ items: QuotationListItem[] }>('/api/invoice').then(r => r.items),
  })
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: [...INVOICE_KEY, id],
    queryFn: () => apiFetch<QuotationData>(`/api/invoice/${id}`),
    enabled: !!id,
  })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: QuotationInput) =>
      apiFetch<QuotationData>('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICE_KEY }),
  })
}

export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQuotationInput }) =>
      apiFetch<QuotationData>(`/api/invoice/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEY })
      qc.invalidateQueries({ queryKey: [...INVOICE_KEY, id] })
    },
  })
}

export function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/invoice/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICE_KEY }),
  })
}
