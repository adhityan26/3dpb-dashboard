"use client"

import { useState, useEffect } from "react"
import { ShopeeStatusCard } from "@/components/settings/ShopeeStatusCard"
import { NotificationConfigCard } from "@/components/settings/NotificationConfigCard"
import { AlertThresholdCard } from "@/components/settings/AlertThresholdCard"
import { RefreshIntervalCard } from "@/components/settings/RefreshIntervalCard"
import { UserManagementCard } from "@/components/settings/UserManagementCard"
import { NotificationRunnerCard } from "@/components/settings/NotificationRunnerCard"
import { FilamenCatalogCard } from "@/components/settings/FilamenCatalogCard"
import { StickerSizeCard } from "@/components/settings/StickerSizeCard"
import { useSettings } from "@/lib/hooks/use-settings"
import { Button } from "@/components/ui/button"

interface FilamenSettings {
  lastCatalogSync: string | null
  stickerSize: string
}

export default function SettingsPage() {
  const { data, isLoading, isError, error, refetch } = useSettings()
  const [filamenSettings, setFilamenSettings] = useState<FilamenSettings | null>(null)

  useEffect(() => {
    fetch("/api/settings/filamen")
      .then((res) => res.ok ? res.json() as Promise<FilamenSettings> : null)
      .then((data) => { if (data) setFilamenSettings(data) })
      .catch(() => {})
  }, [])

  if (isLoading && !data) {
    return (
      <div className="py-12 text-center text-gray-400">Memuat settings...</div>
    )
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return (
      <div className="py-12 text-center space-y-3">
        <div className="text-red-500">{msg}</div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ShopeeStatusCard status={data.shopee} />
        <RefreshIntervalCard />
      </div>

      <NotificationConfigCard config={data.notification} />

      <AlertThresholdCard thresholds={data.thresholds} />

      <NotificationRunnerCard />

      <UserManagementCard />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FilamenCatalogCard lastCatalogSync={filamenSettings?.lastCatalogSync ?? null} />
        <StickerSizeCard initialSize={filamenSettings?.stickerSize ?? "40x30"} />
      </div>
    </div>
  )
}
