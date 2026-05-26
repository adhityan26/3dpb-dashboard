"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { LgOrder, SanityLgOrder, SanityLgOrderWithConfirmed } from "@/lib/light-generator/types"

// ── Keys ────────────────────────────────────────────────────────────────────

const LG_ORDERS_KEY = (status?: string) => ["lg-orders", status ?? "all"] as const
const LG_ORDER_KEY = (id: string) => ["lg-order", id] as const
const LG_SANITY_ORDERS_KEY = ["lg-sanity-orders"] as const

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchOrders(status?: string): Promise<{ orders: LgOrder[]; total: number }> {
  const params = new URLSearchParams({ limit: "200" })
  if (status) params.set("status", status)
  const res = await fetch(`/api/light-generator/orders?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchOrder(id: string): Promise<LgOrder> {
  const res = await fetch(`/api/light-generator/orders/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchSanityOrders(): Promise<SanityLgOrderWithConfirmed[]> {
  const res = await fetch("/api/light-generator/sanity-orders")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useLgOrders(status?: string) {
  return useQuery({
    queryKey: LG_ORDERS_KEY(status),
    queryFn: () => fetchOrders(status),
  })
}

export function useLgOrder(id: string) {
  return useQuery({
    queryKey: LG_ORDER_KEY(id),
    queryFn: () => fetchOrder(id),
  })
}

export function useSanityOrders() {
  return useQuery({
    queryKey: LG_SANITY_ORDERS_KEY,
    queryFn: fetchSanityOrders,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpdateLgOrder(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      status?: string
      statusNote?: string | null
      notesOperator?: string | null
      configJsonOperator?: string | null
    }) => {
      const res = await fetch(`/api/light-generator/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<LgOrder>
    },
    onSuccess: (updated) => {
      qc.setQueryData(LG_ORDER_KEY(id), updated)
      qc.invalidateQueries({ queryKey: ["lg-orders"] })
    },
  })
}

export function useConfirmLgOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/light-generator/orders/${orderId}/confirm`, {
        method: "POST",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LG_SANITY_ORDERS_KEY })
      qc.invalidateQueries({ queryKey: ["lg-orders"] })
    },
  })
}

export function useGenerateLgStl(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/light-generator/orders/${id}/generate`, { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<{ ok: boolean; stlSize: number }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LG_ORDER_KEY(id) })
    },
  })
}

export function useSyncSanityOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/light-generator/orders/${orderId}/sync-sanity`, {
        method: "POST",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<LgOrder>
    },
    onSuccess: (updated: LgOrder) => {
      qc.setQueryData(LG_ORDER_KEY(updated.id), updated)
      qc.invalidateQueries({ queryKey: LG_SANITY_ORDERS_KEY })
      qc.invalidateQueries({ queryKey: ["lg-orders"] })
    },
  })
}

export function useUploadLgFile(id: string, field: "silhouette" | "additional") {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/light-generator/orders/${id}/${field}`, {
        method: "PUT",
        body: form,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<LgOrder>
    },
    onSuccess: (updated) => {
      qc.setQueryData(LG_ORDER_KEY(id), updated)
    },
  })
}
