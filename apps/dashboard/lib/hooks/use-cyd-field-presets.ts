'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CydFieldPresetData } from '@/lib/cyd-layout/field-preset-service'
import type { FieldRow } from '@/lib/cyd-layout/types'

const CYD_FIELD_PRESETS_KEY = ['cyd-field-presets'] as const

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

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function useCydFieldPresets() {
  return useQuery({
    queryKey: CYD_FIELD_PRESETS_KEY,
    queryFn: () => apiFetch<CydFieldPresetData[]>('/api/cyd-field-presets'),
  })
}

export function useCreateCydFieldPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; fields: FieldRow[] }) =>
      apiFetch<CydFieldPresetData>('/api/cyd-field-presets', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CYD_FIELD_PRESETS_KEY }),
  })
}

export function useUpdateCydFieldPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; fields?: FieldRow[] }) =>
      apiFetch<CydFieldPresetData>(`/api/cyd-field-presets/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CYD_FIELD_PRESETS_KEY }),
  })
}

export function useDeleteCydFieldPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/cyd-field-presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CYD_FIELD_PRESETS_KEY }),
  })
}
