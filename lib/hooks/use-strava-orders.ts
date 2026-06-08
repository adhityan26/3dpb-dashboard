"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

// ── Keys ────────────────────────────────────────────────────────────────────

const STRAVA_ORDERS_KEY = (status?: string) => ["strava-orders", status ?? "all"] as const
const STRAVA_ORDER_KEY = (id: string) => ["strava-order", id] as const

// ── Types ───────────────────────────────────────────────────────────────────

export interface StravaOrder {
  id: string
  [key: string]: unknown
}

export interface StravaOrderDetail extends StravaOrder {
  [key: string]: unknown
}

// ── Fetchers ────────────────────────────────────────────────────────────────

async function fetchStravaOrders(status?: string): Promise<{ orders: StravaOrder[] }> {
  const params = new URLSearchParams({ limit: "200" })
  if (status) params.set("status", status)
  const res = await fetch(`/api/strava/orders?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchStravaOrderDetail(orderId: string): Promise<StravaOrderDetail> {
  const res = await fetch(`/api/strava/orders/${orderId}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useStravaOrders(status?: string) {
  return useQuery({
    queryKey: STRAVA_ORDERS_KEY(status),
    queryFn: () => fetchStravaOrders(status),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useStravaOrderDetail(orderId: string) {
  return useQuery({
    queryKey: STRAVA_ORDER_KEY(orderId),
    queryFn: () => fetchStravaOrderDetail(orderId),
  })
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useUpdateStravaOrder(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/strava/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<StravaOrderDetail>
    },
    onSuccess: (updated) => {
      qc.setQueryData(STRAVA_ORDER_KEY(orderId), updated)
      qc.invalidateQueries({ queryKey: ["strava-orders"] })
    },
  })
}

export function useUploadStravaPhotos(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData()
      files.forEach((file) => form.append("files", file))
      const res = await fetch(`/api/strava/orders/${orderId}/photos`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<StravaOrderDetail>
    },
    onSuccess: (updated) => {
      qc.setQueryData(STRAVA_ORDER_KEY(orderId), updated)
      qc.invalidateQueries({ queryKey: ["strava-orders"] })
    },
  })
}

export function useConfirmStravaOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/strava/orders/${orderId}/confirm`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<StravaOrderDetail>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strava-orders"] })
    },
  })
}
