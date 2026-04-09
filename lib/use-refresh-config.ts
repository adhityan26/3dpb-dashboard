"use client"

import { useCallback, useSyncExternalStore } from "react"

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000 // 3 menit
const STORAGE_KEY = "refresh_interval_ms"

export const INTERVAL_OPTIONS = [
  { label: "1 menit",  value: 1 * 60 * 1000 },
  { label: "3 menit",  value: 3 * 60 * 1000 },
  { label: "5 menit",  value: 5 * 60 * 1000 },
  { label: "10 menit", value: 10 * 60 * 1000 },
  { label: "Manual",   value: 0 },
] as const

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener("refresh-config-change", callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener("refresh-config-change", callback)
  }
}

function getSnapshot(): number {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === null) return DEFAULT_INTERVAL_MS
  const parsed = Number(saved)
  return Number.isNaN(parsed) ? DEFAULT_INTERVAL_MS : parsed
}

function getServerSnapshot(): number {
  return DEFAULT_INTERVAL_MS
}

export function useRefreshConfig() {
  const intervalMs = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  // Hydrated flag: on the server and first client render, useSyncExternalStore
  // returns the server snapshot. After hydration, the client snapshot is used.
  // We derive hydrated from whether we're in the browser and the store has
  // been read — which is always true after first effect tick. Since
  // useSyncExternalStore handles this seamlessly, expose true on client.
  const hydrated = typeof window !== "undefined"

  const updateInterval = useCallback((ms: number) => {
    localStorage.setItem(STORAGE_KEY, String(ms))
    window.dispatchEvent(new Event("refresh-config-change"))
  }, [])

  return { intervalMs, updateInterval, hydrated, options: INTERVAL_OPTIONS }
}
