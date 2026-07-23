'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  KalkulasiData, KalkulasiInput, KalkulasiListResponse,
  FilamentHargaData, ResinHargaData, KalkulatorRates, KalkulasiProdukInput
} from '@/lib/kalkulator/types'
import type {
  PrinterProfileData, PrinterProfileInput, MaterialProfileData, MaterialProfileInput,
  KomponenPresetData, LaborPresetData,
} from '@/lib/kalkulator/profiles-service'
import type { SettingsV2, LaborItem } from '@3pb/kalkulator-core'

const KALK_KEY = ['kalkulator'] as const
const FILAMENT_KEY = ['kalkulator', 'filament-harga'] as const
const RESIN_KEY = ['kalkulator', 'resin-harga'] as const
const RATES_KEY = ['kalkulator', 'rates'] as const
const PRINTER_PROFILES_KEY = ['kalkulator', 'printer-profiles'] as const
const MATERIAL_PROFILES_KEY = ['kalkulator', 'material-profiles'] as const
const KOMPONEN_PRESETS_KEY = ['kalkulator', 'komponen-presets'] as const
const LABOR_PRESETS_KEY = ['kalkulator', 'labor-presets'] as const
const SETTINGS_V2_KEY = ['kalkulator', 'settings-v2'] as const

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

export function useKalkulasiList(opts?: { page?: number; limit?: number; enabled?: boolean }) {
  const paged = opts?.page !== undefined
  const limit = opts?.limit ?? 10
  return useQuery({
    queryKey: paged ? [...KALK_KEY, 'page', opts!.page, limit] : KALK_KEY,
    queryFn: () => apiFetch<KalkulasiListResponse>(paged ? `/api/kalkulator?page=${opts!.page}&limit=${limit}` : '/api/kalkulator'),
    enabled: opts?.enabled ?? true,
  })
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

export function useUploadPlateThumbnail() {
  return useMutation({
    mutationFn: ({ plateId, file }: { plateId: string; file: Blob }) => {
      const form = new FormData()
      form.append('file', file, 'plate.png')
      return apiFetch<{ thumbnailKey: string }>(`/api/kalkulator/plates/${plateId}/thumbnail`, { method: 'PUT', body: form })
    },
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
    onSuccess: (_, { kalkulasiId }) => {
      qc.invalidateQueries({ queryKey: KALK_KEY })
      qc.invalidateQueries({ queryKey: [...KALK_KEY, kalkulasiId] })
    },
  })
}

export function useRemoveProdukLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kalkulasiId, linkId }: { kalkulasiId: string; linkId: string }) =>
      apiFetch<void>(`/api/kalkulator/${kalkulasiId}/links/${linkId}`, { method: 'DELETE' }),
    onSuccess: (_, { kalkulasiId }) => {
      qc.invalidateQueries({ queryKey: KALK_KEY })
      qc.invalidateQueries({ queryKey: [...KALK_KEY, kalkulasiId] })
    },
  })
}

export function useSetPrimaryLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kalkulasiId, linkId }: { kalkulasiId: string; linkId: string }) =>
      apiFetch<void>(`/api/kalkulator/${kalkulasiId}/links/${linkId}/primary`, { method: 'PUT' }),
    onSuccess: (_, { kalkulasiId }) => {
      qc.invalidateQueries({ queryKey: KALK_KEY })
      qc.invalidateQueries({ queryKey: [...KALK_KEY, kalkulasiId] })
    },
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

export function useRecomputeFilamentHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>('/api/kalkulator/filament-harga/recompute', { method: 'POST' }),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RATES_KEY })
      qc.invalidateQueries({ queryKey: SETTINGS_V2_KEY })
    },
  })
}

// ── Kalkulator v2: profiles, presets, settings ──────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function usePrinterProfiles() {
  return useQuery({ queryKey: PRINTER_PROFILES_KEY, queryFn: () => apiFetch<PrinterProfileData[]>('/api/kalkulator/printer-profiles') })
}

export function useCreatePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PrinterProfileInput) =>
      apiFetch<PrinterProfileData>('/api/kalkulator/printer-profiles', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useUpdatePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PrinterProfileInput> }) =>
      apiFetch<PrinterProfileData>(`/api/kalkulator/printer-profiles/${id}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useDeletePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/printer-profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useSetDefaultPrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/printer-profiles/${id}/default`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useSetPricingReferencePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/printer-profiles/${id}/pricing-reference`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useMaterialProfiles() {
  return useQuery({ queryKey: MATERIAL_PROFILES_KEY, queryFn: () => apiFetch<MaterialProfileData[]>('/api/kalkulator/material-profiles') })
}

export function useUpsertMaterialProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MaterialProfileInput) =>
      apiFetch<MaterialProfileData>('/api/kalkulator/material-profiles', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MATERIAL_PROFILES_KEY }),
  })
}

export function useDeleteMaterialProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/material-profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MATERIAL_PROFILES_KEY }),
  })
}

export function useKomponenPresets() {
  return useQuery({ queryKey: KOMPONEN_PRESETS_KEY, queryFn: () => apiFetch<KomponenPresetData[]>('/api/kalkulator/komponen-presets') })
}

export function useUpsertKomponenPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { nama: string; harga: number; isActive?: boolean }) =>
      apiFetch<KomponenPresetData>('/api/kalkulator/komponen-presets', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KOMPONEN_PRESETS_KEY }),
  })
}

export function useDeleteKomponenPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/komponen-presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KOMPONEN_PRESETS_KEY }),
  })
}

export function useLaborPresets() {
  return useQuery({ queryKey: LABOR_PRESETS_KEY, queryFn: () => apiFetch<LaborPresetData[]>('/api/kalkulator/labor-presets') })
}

export function useUpsertLaborPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { nama: string; items: LaborItem[] }) =>
      apiFetch<LaborPresetData>('/api/kalkulator/labor-presets', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LABOR_PRESETS_KEY }),
  })
}

export function useDeleteLaborPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/labor-presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LABOR_PRESETS_KEY }),
  })
}

export function useSettingsV2() {
  return useQuery({ queryKey: SETTINGS_V2_KEY, queryFn: () => apiFetch<SettingsV2>('/api/kalkulator/settings-v2') })
}
