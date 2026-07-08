"use client"

import { useQuery } from "@tanstack/react-query"
import type { AnalyticsData } from "@/lib/analytics/types"
import type { AnalyticsRange } from "@/lib/analytics/service"
import { useRefreshConfig } from "@/lib/use-refresh-config"

async function fetchAnalytics(range: AnalyticsRange): Promise<AnalyticsData> {
  const res = await fetch(`/api/analytics?range=${range}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useAnalytics(range: AnalyticsRange) {
  const { intervalMs } = useRefreshConfig()
  return useQuery({
    queryKey: ["analytics", range] as const,
    queryFn: () => fetchAnalytics(range),
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    refetchIntervalInBackground: false,
  })
}
