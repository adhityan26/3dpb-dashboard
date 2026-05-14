'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  KalkulasiData, KalkulasiInput, KalkulasiListResponse,
  FilamentHargaData, ResinHargaData, KalkulatorRates, KalkulasiProdukInput
} from '@/lib/kalkulator/types'

const KALK_KEY = ['kalkulator'] as const
const FILAMENT_KEY = ['kalkulator', 'filament-harga'] as const
const RESIN_KEY = ['kalkulator', 'resin-harga'] as const
const RATES_KEY = ['kalkulator', 'rates'] as const

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export function useKalkulasiList() {
  return useQuery({ queryKey: KALK_KEY, queryFn: () => apiFetch<KalkulasiListResponse>('/api/kalkulator') })
}

export function useKalkulasi(id: string) {
  return useQuery({ queryKey: [...KALK_KEY, id], queryFn: () => apiFetch<KalkulasiData>(`/api/kalkulator/${id}`), enabled: !!id })
}

export function useCreateKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: KalkulasiInput) => apiFetch<KalkulasiData>('/api/kalkulator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

export function useUpdateKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: KalkulasiInput }) =>
      apiFetch<KalkulasiData>(`/api/kalkulator/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: KALK_KEY }); qc.invalidateQueries({ queryKey: [...KALK_KEY, id] }) },
  })
}

export function useDeleteKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

export function useDuplicateKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, nama, batch }: { id: string; nama: string; batch?: number }) =>
      apiFetch<KalkulasiData>(`/api/kalkulator/${id}/duplicate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama, batch }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

export function useAddProdukLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kalkulasiId, input }: { kalkulasiId: string; input: KalkulasiProdukInput }) =>
      apiFetch<void>(`/api/kalkulator/${kalkulasiId}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

export function useRemoveProdukLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kalkulasiId, linkId }: { kalkulasiId: string; linkId: string }) =>
      apiFetch<void>(`/api/kalkulator/${kalkulasiId}/links/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

export function useSetPrimaryLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kalkulasiId, linkId }: { kalkulasiId: string; linkId: string }) =>
      apiFetch<void>(`/api/kalkulator/${kalkulasiId}/links/${linkId}/primary`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

export function useFilamentHarga() {
  return useQuery({ queryKey: FILAMENT_KEY, queryFn: () => apiFetch<FilamentHargaData[]>('/api/kalkulator/filament-harga') })
}

export function useUpsertFilamentHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { brand: string; material: string; hargaPerGram: number }) =>
      apiFetch<FilamentHargaData>('/api/kalkulator/filament-harga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: FILAMENT_KEY }),
  })
}

export function useDeleteFilamentHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>('/api/kalkulator/filament-harga', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: FILAMENT_KEY }),
  })
}

export function useResinHarga() {
  return useQuery({ queryKey: RESIN_KEY, queryFn: () => apiFetch<ResinHargaData[]>('/api/kalkulator/resin-harga') })
}

export function useUpsertResinHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { brand: string; grade: string; hargaPerGram: number }) =>
      apiFetch<ResinHargaData>('/api/kalkulator/resin-harga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RESIN_KEY }),
  })
}

export function useDeleteResinHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>('/api/kalkulator/resin-harga', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RESIN_KEY }),
  })
}

export function useKalkulatorRates() {
  return useQuery({ queryKey: RATES_KEY, queryFn: () => apiFetch<KalkulatorRates>('/api/kalkulator/rates') })
}

export function useUpdateRates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (updates: { key: string; value: string }[]) =>
      apiFetch<KalkulatorRates>('/api/kalkulator/rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RATES_KEY }),
  })
}
