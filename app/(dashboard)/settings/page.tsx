"use client"

import { ShopeeStatusCard } from "@/components/settings/ShopeeStatusCard"
import { NotificationConfigCard } from "@/components/settings/NotificationConfigCard"
import { AlertThresholdCard } from "@/components/settings/AlertThresholdCard"
import { RefreshIntervalCard } from "@/components/settings/RefreshIntervalCard"
import { UserManagementCard } from "@/components/settings/UserManagementCard"
import { NotificationRunnerCard } from "@/components/settings/NotificationRunnerCard"
import { useSettings } from "@/lib/hooks/use-settings"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
  const { data, isLoading, isError, error, refetch } = useSettings()

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
    </div>
  )
}
