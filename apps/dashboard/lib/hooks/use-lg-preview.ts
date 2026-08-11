"use client"
import { useEffect, useMemo, useRef, useState } from "react"

type PreviewResult = { url: string; latencyMs: number; seq: number }

/**
 * Debounced, abortable preview runner. Coalesces rapid `request()` calls into
 * a single fetch after `delayMs`, aborts any in-flight fetch when a newer one
 * starts, and drops out-of-order responses via a sequence guard.
 */
export function createPreviewRunner(
  fetchPreview: (config: Record<string, unknown>, signal: AbortSignal) => Promise<Blob>,
  delayMs = 500,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let seq = 0
  let latestDelivered = 0
  const resultCbs = new Set<(r: PreviewResult) => void>()
  const errorCbs = new Set<(e: unknown) => void>()

  async function run(config: Record<string, unknown>) {
    controller?.abort()
    controller = new AbortController()
    const mySeq = ++seq
    const t0 = Date.now()
    try {
      const b = await fetchPreview(config, controller.signal)
      if (mySeq < seq || mySeq <= latestDelivered) return  // stale
      latestDelivered = mySeq
      resultCbs.forEach(cb => cb({ url: URL.createObjectURL(b), latencyMs: Date.now() - t0, seq: mySeq }))
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return
      if (mySeq === seq) errorCbs.forEach(cb => cb(e))
    }
  }

  return {
    request(config: Record<string, unknown>) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => run(config), delayMs)
    },
    onResult(cb: (r: PreviewResult) => void) { resultCbs.add(cb) },
    onError(cb: (e: unknown) => void) { errorCbs.add(cb) },
    dispose() { if (timer) clearTimeout(timer); controller?.abort() },
  }
}

export function useLgPreview(orderId: string) {
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [islands, setIslands] = useState<{ hasFloating: boolean } | null>(null)
  const lastConfig = useRef<Record<string, unknown> | null>(null)

  const runner = useMemo(() => createPreviewRunner(async (config, signal) => {
    const res = await fetch(`/api/light-generator/orders/${orderId}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
      signal,
    })
    if (!res.ok) throw new Error(`preview ${res.status}`)
    return res.blob()
  }, 500), [orderId])

  useEffect(() => {
    runner.onResult(async ({ url, latencyMs }) => {
      setPngUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
      setLatencyMs(latencyMs)
      setStatus("ready")
      // Chained island check with the same config (fire-and-forget)
      try {
        const res = await fetch(`/api/light-generator/orders/${orderId}/check-islands`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: lastConfig.current }),
        })
        if (res.ok) {
          const j = await res.json()
          setIslands({ hasFloating: !!(j.has_floating_islands ?? j.hasFloatingIslands) })
        }
      } catch { /* island check is advisory */ }
    })
    runner.onError(() => setStatus("error"))
    return () => runner.dispose()
  }, [runner, orderId])

  return {
    pngUrl, status, latencyMs, islands,
    request(config: Record<string, unknown>) {
      lastConfig.current = config
      setStatus("loading")
      runner.request(config)
    },
  }
}
