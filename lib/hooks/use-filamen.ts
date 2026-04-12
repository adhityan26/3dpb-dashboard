'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpoolsResponse, AmsSectionResponse, FilamentCatalogEntry, SpoolData } from '@/lib/filamen/types'
import type { CreateSpoolInput, UpdateSpoolInput } from '@/lib/filamen/spool-service'

const SPOOLS_KEY = ['filamen', 'spools'] as const
const AMS_KEY = ['filamen', 'ams'] as const
const CATALOG_KEY = ['filamen', 'catalog'] as const

// ── Spools ────────────────────────────────────────────────────────────────────

async function fetchSpools(): Promise<SpoolsResponse> {
  const res = await fetch('/api/filamen/spools')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useSpools() {
  return useQuery({ queryKey: SPOOLS_KEY, queryFn: fetchSpools })
}

async function createSpool(input: CreateSpoolInput): Promise<SpoolData> {
  const res = await fetch('/api/filamen/spools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useCreateSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSpool,
    onSuccess: () => qc.invalidateQueries({ queryKey: SPOOLS_KEY }),
  })
}

async function updateSpool({ id, ...input }: UpdateSpoolInput & { id: string }): Promise<SpoolData> {
  const res = await fetch(`/api/filamen/spools/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useUpdateSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateSpool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SPOOLS_KEY })
      qc.invalidateQueries({ queryKey: AMS_KEY })
    },
  })
}

async function deleteSpool(id: string): Promise<void> {
  const res = await fetch(`/api/filamen/spools/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export function useDeleteSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteSpool,
    onSuccess: () => qc.invalidateQueries({ queryKey: SPOOLS_KEY }),
  })
}

// ── Scan ─────────────────────────────────────────────────────────────────────

export async function scanLookup(
  type: 'barcode' | 'nfc',
  value: string
): Promise<{ found: boolean; spool?: SpoolData; rawValue?: string }> {
  const res = await fetch('/api/filamen/spools/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, value }),
  })
  if (res.status === 404) return res.json()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── AMS ───────────────────────────────────────────────────────────────────────

async function fetchAms(): Promise<AmsSectionResponse> {
  const res = await fetch('/api/filamen/ams')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useAms() {
  return useQuery({ queryKey: AMS_KEY, queryFn: fetchAms })
}

async function assignSpool({
  slotId,
  spoolId,
}: {
  slotId: string
  spoolId: string | null
}): Promise<void> {
  const res = await fetch(`/api/filamen/ams/${slotId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spoolId }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export function useAssignSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assignSpool,
    onSuccess: () => qc.invalidateQueries({ queryKey: AMS_KEY }),
  })
}

// ── Catalog ───────────────────────────────────────────────────────────────────

async function fetchCatalog(): Promise<{
  catalog: Record<string, Record<string, FilamentCatalogEntry[]>>
}> {
  const res = await fetch('/api/filamen/catalog')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useCatalog() {
  return useQuery({ queryKey: CATALOG_KEY, queryFn: fetchCatalog, staleTime: 1000 * 60 * 60 })
}

export function useSyncCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/filamen/catalog', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }),
  })
}
