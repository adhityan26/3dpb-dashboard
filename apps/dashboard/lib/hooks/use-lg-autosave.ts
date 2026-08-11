"use client"
import { useEffect, useMemo, useState } from "react"

export type AutosaveStatus = "idle" | "saving" | "saved" | "error"

export function createAutosaver(
  save: (config: Record<string, unknown>) => Promise<void>,
  delayMs = 1000,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Record<string, unknown> | null = null
  let status: AutosaveStatus = "idle"
  const listeners = new Set<(s: AutosaveStatus) => void>()
  const setStatus = (s: AutosaveStatus) => { status = s; listeners.forEach(l => l(s)) }

  async function run() {
    if (!pending) return
    const cfg = pending
    pending = null
    setStatus("saving")
    try { await save(cfg); setStatus("saved") } catch { setStatus("error") }
  }

  return {
    push(config: Record<string, unknown>) {
      pending = config
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, delayMs)
    },
    async flush() { if (timer) clearTimeout(timer); await run() },
    dispose() { if (timer) clearTimeout(timer) },
    get status() { return status },
    onStatus(cb: (s: AutosaveStatus) => void) { listeners.add(cb) },
  }
}

export function useLgAutosave(orderId: string) {
  const [status, setStatus] = useState<AutosaveStatus>("idle")
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const autosaver = useMemo(() => createAutosaver(async (config) => {
    const res = await fetch(`/api/light-generator/orders/${orderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ configJsonOperator: JSON.stringify(config) }),
    })
    if (!res.ok) throw new Error(`save failed: ${res.status}`)
  }), [orderId])
  useEffect(() => {
    autosaver.onStatus(s => { setStatus(s); if (s === "saved") setSavedAt(new Date()) })
    return () => autosaver.dispose()
  }, [autosaver])
  return { push: autosaver.push.bind(autosaver), flush: () => autosaver.flush(), status, savedAt }
}
