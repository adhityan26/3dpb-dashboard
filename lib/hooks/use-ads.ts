"use client"

import { useQuery } from "@tanstack/react-query"
import type { AdsListResult } from "@/lib/ads/types"
import type { AdsRange } from "@/lib/ads/service"
import { useRefreshConfig } from "@/lib/use-refresh-config"

async function fetchAds(range: AdsRange): Promise<AdsListResult> {
  const res = await fetch(`/api/ads?range=${range}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useAds(range: AdsRange) {
  const { intervalMs } = useRefreshConfig()
  return useQuery({
    queryKey: ["ads", range] as const,
    queryFn: () => fetchAds(range),
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    refetchIntervalInBackground: false,
  })
}
