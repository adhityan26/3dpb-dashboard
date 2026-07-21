"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { ShopeeStatusCard } from "@/components/settings/ShopeeStatusCard"
import { NotificationConfigCard } from "@/components/settings/NotificationConfigCard"
import { AlertThresholdCard } from "@/components/settings/AlertThresholdCard"
import { RefreshIntervalCard } from "@/components/settings/RefreshIntervalCard"
import { UserManagementCard } from "@/components/settings/UserManagementCard"
import { NotificationRunnerCard } from "@/components/settings/NotificationRunnerCard"
import { FilamenCatalogCard } from "@/components/settings/FilamenCatalogCard"
import { StickerSizeCard } from "@/components/settings/StickerSizeCard"
import { KalkulatorSettingsCard } from "@/components/settings/KalkulatorSettingsCard"
import { KalkulatorV2SettingsCard } from "@/components/settings/kalkulator-v2/KalkulatorV2SettingsCard"
import { ShopeeFeeAnalyticsCard } from "@/components/settings/ShopeeFeeAnalyticsCard"
import { InvoiceMethodsCard } from "@/components/settings/InvoiceMethodsCard"
import { TokopediaSessionCard } from "@/components/settings/TokopediaSessionCard"
import { FilamentAliasCard } from "@/components/settings/FilamentAliasCard"
import { CydDeviceCard } from "@/components/settings/CydDeviceCard"
import { useSettings } from "@/lib/hooks/use-settings"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  )
}

const TABS = [
  { key: "shopee",     label: "🛍️ Shopee"     },
  { key: "kalkulator", label: "🧮 Kalkulator"  },
  { key: "notifikasi", label: "🔔 Notifikasi"  },
  { key: "user",       label: "👥 User"        },
  { key: "monitoring", label: "🖥️ Monitoring" },
  { key: "lainnya",    label: "⚙️ Lainnya"    },
] as const

type SettingsTab = typeof TABS[number]["key"]

interface FilamenSettings {
  lastCatalogSync: string | null
  stickerSize: string
}

function SettingsPageInner() {
  const { data, isLoading, isError, error, refetch } = useSettings()
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawTab = searchParams.get("tab") ?? "shopee"
  const activeTab: SettingsTab = (TABS.map(t => t.key) as string[]).includes(rawTab)
    ? rawTab as SettingsTab
    : "shopee"

  function setTab(tab: SettingsTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const [filamenSettings, setFilamenSettings] = useState<FilamenSettings | null>(null)

  useEffect(() => {
    fetch("/api/settings/filamen")
      .then((res) => res.ok ? res.json() as Promise<FilamenSettings> : null)
      .then((d) => { if (d) setFilamenSettings(d) })
      .catch((err) => { console.error("Failed to fetch filamen settings:", err) })
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
      <GlassPageHeader title="Settings" subtitle="Konfigurasi sistem, notifikasi, dan akun" />

      {/* Sub-tab nav */}
      <div className="flex border-b border-gray-200 dark:border-white/10 flex-wrap">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? "border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "shopee" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ShopeeStatusCard status={data.shopee} />
            <RefreshIntervalCard />
          </div>
          <ShopeeFeeAnalyticsCard />
        </div>
      )}

      {activeTab === "kalkulator" && (
        <div className="space-y-4">
          <KalkulatorSettingsCard />
          <KalkulatorV2SettingsCard />
        </div>
      )}

      {activeTab === "notifikasi" && (
        <div className="space-y-4">
          <NotificationConfigCard config={data.notification} />
          <AlertThresholdCard thresholds={data.thresholds} />
          <NotificationRunnerCard />
        </div>
      )}

      {activeTab === "user" && (
        <UserManagementCard />
      )}

      {activeTab === "monitoring" && (
        <div className="space-y-4">
          <CydDeviceCard />
        </div>
      )}

      {activeTab === "lainnya" && (
        <div className="space-y-4">
          <InvoiceMethodsCard />
          <TokopediaSessionCard />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FilamenCatalogCard lastCatalogSync={filamenSettings?.lastCatalogSync ?? null} />
            <StickerSizeCard
              initialSize={filamenSettings?.stickerSize ?? "40x30"}
              canEdit={session?.user?.role === "OWNER"}
            />
          </div>
          <FilamentAliasCard />
        </div>
      )}
    </div>
  )
}
