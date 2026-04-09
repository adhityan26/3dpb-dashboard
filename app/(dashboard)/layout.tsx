import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TabNav } from "@/components/layout/TabNav"
import { countBelumCetak } from "@/lib/orders/service"
import { getAdsPerformance } from "@/lib/ads/service"

async function getBadges(): Promise<Record<string, number>> {
  // Fetch in parallel but tolerate individual failures — badges are optional.
  const [orderResult, adsResult] = await Promise.allSettled([
    countBelumCetak(),
    getAdsPerformance("7d"),
  ])

  const badges: Record<string, number> = {}

  if (orderResult.status === "fulfilled") {
    badges.order = orderResult.value
  } else {
    console.warn("Failed to fetch order badge:", orderResult.reason)
  }

  if (adsResult.status === "fulfilled") {
    badges.iklan = adsResult.value.kpi.adsRugi
  } else {
    console.warn("Failed to fetch ads badge:", adsResult.reason)
  }

  return badges
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const badges = await getBadges()

  return (
    <div className="min-h-screen bg-gray-50">
      <TabNav role={session.user.role} badges={badges} />
      <main className="max-w-6xl mx-auto p-4">{children}</main>
    </div>
  )
}
