"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface RunnerResult {
  detected: number
  sent: number
  skipped: number
  failed: number
  ranAt: string
  events: Array<{
    alertKey: string
    kind: string
    sent: boolean
    reason?: string
  }>
}

export function NotificationRunnerCard() {
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<RunnerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/notifications/poll", { method: "POST" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const result = (await res.json()) as RunnerResult
      setLastResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📡 Jalankan Cek Notifikasi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Background poller jalan otomatis tiap 5 menit jika{" "}
          <code className="text-[11px]">INTERNAL_NOTIFICATION_SECRET</code> ada
          di .env.local. Tombol ini untuk trigger manual.
        </p>
        <Button
          onClick={handleRun}
          disabled={running}
          className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
        >
          {running ? "Mengecek..." : "Jalankan Sekarang"}
        </Button>

        {error && <div className="text-xs text-red-500">❌ {error}</div>}

        {lastResult && (
          <div className="text-xs text-gray-600 space-y-1">
            <div>
              <strong>Last run:</strong>{" "}
              {new Date(lastResult.ranAt).toLocaleString("id-ID")}
            </div>
            <div>
              Detected: {lastResult.detected} · Sent: {lastResult.sent} ·
              Skipped: {lastResult.skipped} · Failed: {lastResult.failed}
            </div>
            {lastResult.events.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[#EE4D2D]">
                  Detail event ({lastResult.events.length})
                </summary>
                <ul className="mt-1 space-y-0.5 pl-4">
                  {lastResult.events.map((e, i) => (
                    <li key={i} className="font-mono text-[11px]">
                      {e.sent ? "✅" : "⏭"} {e.kind}: {e.alertKey}
                      {e.reason && (
                        <span className="text-gray-400"> ({e.reason})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
