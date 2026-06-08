import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TabNav } from "@/components/layout/TabNav"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { AmbientOrbs } from "@/components/ui/AmbientOrbs"
import { countBelumCetak } from "@/lib/orders/service"
import { getAdsPerformance } from "@/lib/ads/service"
import { countPerluPerhatian } from "@/lib/products/service"
import { countLgPendingOrders } from "@/lib/light-generator/service"

// Hard timeout so Shopee API hangs never block page render
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`badge timeout ${ms}ms`)), ms)),
  ])
}

async function getBadges(): Promise<Record<string, number>> {
  const [orderResult, adsResult, productsResult, lgResult] = await Promise.allSettled([
    withTimeout(countBelumCetak(), 3000),
    withTimeout(getAdsPerformance("7d"), 3000),
    withTimeout(countPerluPerhatian(), 3000),
    withTimeout(countLgPendingOrders(), 3000),
  ])
  const badges: Record<string, number> = {}
  if (orderResult.status === "fulfilled") badges.order = orderResult.value
  if (adsResult.status === "fulfilled") badges.iklan = adsResult.value.kpi.adsRugi
  if (productsResult.status === "fulfilled") badges.produk = productsResult.value
  if (lgResult.status === "fulfilled" && lgResult.value > 0) badges["light-generator"] = lgResult.value
  return badges
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  console.log("[layout] session role:", session?.user?.role ?? "NULL", "error:", (session as unknown as Record<string,unknown>)?.error ?? "none")
  if (!session?.user) redirect("/login")

  const badges = await getBadges()
  const userName = session.user.name ?? ""

  return (
    <div className="relative min-h-screen bg-glass-page">
      {/* Animated ambient orbs — dark mode only */}
      <AmbientOrbs />

      {/* Desktop nav (hidden on mobile) */}
      <TabNav role={session.user.role} badges={badges} userName={userName} />

      {/* Page content — pb-24 on mobile to clear bottom nav */}
      <main className="relative z-10 max-w-6xl mx-auto p-4 pb-24 md:pb-4">
        {children}
      </main>

      <MobileBottomNav role={session.user.role} badges={badges} userName={userName} />
      {/* Build version footer — sticky at bottom (mobile above nav, desktop at page bottom) */}
      <div className="fixed bottom-0 left-0 right-0 z-20 text-center pb-14 md:pb-4 md:text-right md:pr-4">
        <span className="text-[8px] md:text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.12)" }}>
          {`© 3dprintingbandung 2026 · ${process.env.NEXT_PUBLIC_BUILD_DATE}.${process.env.NEXT_PUBLIC_BUILD_HASH}`}
        </span>
      </div>
    </div>
  )
}
