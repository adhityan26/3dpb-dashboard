"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface FilamenSettings {
  lastCatalogSync: string | null
  stickerSize: string
}

interface FilamenCatalogCardProps {
  lastCatalogSync: string | null
}

export function FilamenCatalogCard({ lastCatalogSync: initialSync }: FilamenCatalogCardProps) {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(initialSync)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch("/api/filamen/catalog", { method: "POST" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      // Refresh last sync time
      const refreshRes = await fetch("/api/settings/filamen")
      if (refreshRes.ok) {
        const data = (await refreshRes.json()) as FilamenSettings
        setLastSync(data.lastCatalogSync)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🧵 Katalog Filamen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Data brand dan warna filamen diambil dari SpoolmanDB (github.com/Donkie/SpoolmanDB).
        </p>
        {lastSync && (
          <p className="text-xs text-gray-500">
            Terakhir sync:{" "}
            <span className="font-medium text-gray-700">
              {new Date(lastSync).toLocaleString("id-ID")}
            </span>
          </p>
        )}
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
        >
          {syncing ? "Menyinkronkan..." : "Sync Katalog"}
        </Button>
        {error && <div className="text-xs text-red-500">❌ {error}</div>}
      </CardContent>
    </Card>
  )
}
