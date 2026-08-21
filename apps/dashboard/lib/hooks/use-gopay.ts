"use client"

import { useQuery } from "@tanstack/react-query"

interface GopayStatus {
  connected: boolean
  message?: string
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function useGopayStatus() {
  return useQuery({
    queryKey: ["gopay", "status"],
    queryFn: () => apiFetch<GopayStatus>("/api/gopay/status"),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}
