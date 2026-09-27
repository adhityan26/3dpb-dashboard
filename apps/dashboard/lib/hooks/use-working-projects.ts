"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export interface WorkingProjectChecklistItem {
  id: number
  text: string
  done: boolean
  deleted: boolean
}

export interface WorkingProject {
  id: string
  discordThreadId: string | null
  discordThreadUrl?: string | null
  forumChannelId?: string | null
  source: string
  sourceOrderNo: string | null
  sourceProductId?: string | null
  orderNoLegacy: string | null
  syncState?: string
  syncError?: string | null
  customer: string
  contact: string | null
  platform: string | null
  product: string
  variant: string | null
  title?: string
  status: string
  payment: string
  orderDate?: string | null
  dueDate: string | null
  dueDateRaw: string | null
  invoiceAmount: number
  paidAmount?: number
  notes?: string | null
  shipping?: string | null
  trackingNo?: string | null
  checklist: WorkingProjectChecklistItem[]
  mentions?: string[]
  appliedTags?: string[]
  remindersSent?: number[]
  quotationId?: string | null
  createdAt?: string
  updatedAt?: string
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const WORKING_PROJECTS_KEY = ["working-projects"] as const

export function useWorkingProjects() {
  const query = useQuery({
    queryKey: WORKING_PROJECTS_KEY,
    queryFn: () => apiFetch<WorkingProject[]>("/api/working-projects"),
  })

  return { ...query, data: query.data, isLoading: query.isLoading }
}

export interface WorkingProjectUpdatePatch {
  customer?: string
  product?: string
  variant?: string
  dueDateRaw?: string
  orderDateRaw?: string
  paymentRaw?: string
  invoiceAmountRaw?: string
  shipping?: string
  trackingNo?: string
  notesAppend?: string
  notes?: string
  mentions?: string[]
  appliedTags?: string[]
  status?: string
  platform?: string
  contact?: string
  source?: string
  quotationId?: string | null
}

export function useUpdateWorkingProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WorkingProjectUpdatePatch }) =>
      apiFetch(`/api/working-projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    // Returned so mutateAsync resolves only after the list refetch — inline
    // edits rely on this to drop their optimistic value without a flicker.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKING_PROJECTS_KEY }),
  })
}

export interface SetChecklistByLabelVars {
  id: string
  label: string
  done: boolean
  by: string
}

// Shared by the GL Ring tab's checklist toggles. A successful POST
// invalidates the same WORKING_PROJECTS_KEY cache useUpdateWorkingProject
// uses, so the checklist stays in sync with server (and Discord-echoed)
// truth on refetch instead of drifting from local-only optimistic state.
export function useSetChecklistByLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, label, done, by }: SetChecklistByLabelVars) =>
      apiFetch(`/api/working-projects/${id}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "setByLabel", label, done, by }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKING_PROJECTS_KEY })
    },
  })
}

export type ChecklistOp =
  | { type: 'add'; text: string; addedBy: string }
  | { type: 'check' | 'uncheck' | 'remove'; id: number; by: string }
  | { type: 'edit'; id: number; text: string }
  | { type: 'reorder'; orderedIds: number[] }

// Generic checklist mutation for the Notes & Checklist modal (add/edit/
// remove/reorder). useSetChecklistByLabel above stays separate since the
// GL Ring tab's optimistic-override flow is keyed by label, not id.
export function useChecklistOp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, op }: { id: string; op: ChecklistOp }) =>
      apiFetch(`/api/working-projects/${id}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKING_PROJECTS_KEY })
    },
  })
}

export const GL_RING_PRODUCT_IDS_KEY = ["working-projects", "settings", "gl-ring-products"] as const

export function useGLRingProductIds() {
  const query = useQuery({
    queryKey: GL_RING_PRODUCT_IDS_KEY,
    queryFn: () => apiFetch<{ productIds: string[] }>("/api/working-projects/settings/gl-ring-products"),
  })
  return { ...query, data: query.data?.productIds, isLoading: query.isLoading }
}

export function useUpdateGLRingProductIds() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (productIds: string[]) =>
      apiFetch("/api/working-projects/settings/gl-ring-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GL_RING_PRODUCT_IDS_KEY })
    },
  })
}

// Same pattern as GL Ring's product-ID list above, generalized for the two
// other auto-routed categories (lib/working-projects/category.ts).
export type AutoRoutedCategory = "topeng" | "clicker"

function categoryProductIdsKey(category: AutoRoutedCategory) {
  return ["working-projects", "settings", "category-product-ids", category] as const
}

export function useCategoryProductIds(category: AutoRoutedCategory) {
  const query = useQuery({
    queryKey: categoryProductIdsKey(category),
    queryFn: () => apiFetch<{ productIds: string[] }>(`/api/working-projects/settings/category-product-ids/${category}`),
  })
  return { ...query, data: query.data?.productIds, isLoading: query.isLoading }
}

export function useUpdateCategoryProductIds(category: AutoRoutedCategory) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (productIds: string[]) =>
      apiFetch(`/api/working-projects/settings/category-product-ids/${category}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryProductIdsKey(category) })
    },
  })
}

export const FAST_COURIERS_KEY = ["working-projects", "settings", "fast-couriers"] as const

export function useFastCouriers() {
  const query = useQuery({
    queryKey: FAST_COURIERS_KEY,
    queryFn: () => apiFetch<{ couriers: string[] }>("/api/working-projects/settings/fast-couriers"),
  })
  return { ...query, data: query.data?.couriers, isLoading: query.isLoading }
}

export function useUpdateFastCouriers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (couriers: string[]) =>
      apiFetch("/api/working-projects/settings/fast-couriers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couriers }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAST_COURIERS_KEY })
    },
  })
}

// baseBoreMm for the Ring Resizer's real scale formula (see
// lib/ring-resizer/sizing.ts) — used by the GL Ring tab's Scale % column.
export const GL_RING_MODEL_KEY = ["working-projects", "gl-ring-model"] as const

export function useGLRingBaseBoreMm() {
  const query = useQuery({
    queryKey: GL_RING_MODEL_KEY,
    queryFn: () => apiFetch<{ baseBoreMm: number | null }>("/api/working-projects/gl-ring-model"),
  })
  return { ...query, data: query.data?.baseBoreMm ?? null, isLoading: query.isLoading }
}
