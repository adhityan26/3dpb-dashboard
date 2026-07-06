"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TokopediaOrderSummary } from "@/lib/tokopedia/types"

interface SessionStatus { exists: boolean; sellerId?: string; updatedAt?: string; tokenExpiry?: string | null; expired?: boolean }

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function useTokopediaSession() {
  return useQuery({ queryKey: ["tokopedia", "session"], queryFn: () => apiFetch<SessionStatus>("/api/tokopedia/session"), staleTime: 30_000 })
}

export function useSaveTokopediaSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cookies: unknown[]) =>
      apiFetch("/api/tokopedia/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookies }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokopedia", "session"] }),
  })
}

export function useTestTokopediaSession() {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; error?: string }>("/api/tokopedia/session/test", { method: "POST" }),
  })
}

export function useTokopediaOrders(tab: "perlu-dikirim" | "semua") {
  return useQuery({
    queryKey: ["tokopedia", "orders", tab],
    queryFn: () => apiFetch<{ totalCount: number; orders: TokopediaOrderSummary[] }>(`/api/tokopedia/orders?tab=${tab}`),
  })
}

export function useTokopediaOrder(id: string | null) {
  return useQuery({
    queryKey: ["tokopedia", "order", id],
    queryFn: () => apiFetch<TokopediaOrderSummary>(`/api/tokopedia/orders/${id}`),
    enabled: !!id,
  })
}
