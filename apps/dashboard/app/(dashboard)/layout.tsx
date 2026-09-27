import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TabNav } from "@/components/layout/TabNav"
import { AmbientOrbs, MobileBottomNav } from "@3pb/ui"
import { ThemeToggle } from "@/components/ThemeToggle"
import { countBelumCetak } from "@/lib/orders/service"
import { getAdsPerformance } from "@/lib/ads/service"
import { countPerluPerhatian } from "@/lib/products/service"

// Sama dengan daftar tab di TabNav (desktop) — MobileBottomNav generik (dari @3pb/ui,
// dipakai lintas app) sehingga daftar tab & filter role jadi tanggung jawab caller.
const MOBILE_NAV_TABS = [
  { href: "/order",    label: "Order",    icon: "📦", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/iklan",    label: "Iklan",    icon: "📊", roles: ["OWNER", "TEST_USER"] },
  { href: "/analisa",  label: "Analisa",  icon: "📈", roles: ["OWNER", "TEST_USER"] },
  { href: "/produk",   label: "Produk",   icon: "🏷️", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/finance",  label: "Finance",  icon: "💰", roles: ["OWNER", "ADMIN"] },
  { href: "/landing",  label: "Landing",  icon: "🌐", roles: ["OWNER"] },
  { href: "/settings", label: "Settings", icon: "⚙️", roles: ["OWNER"] },
]

// Hard timeout so Shopee API hangs never block page render
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`badge timeout ${ms}ms`)), ms)),
  ])
}

async function getBadges(): Promise<Record<string, number>> {
  const [orderResult, adsResult, productsResult] = await Promise.allSettled([
    withTimeout(countBelumCetak(), 3000),
    withTimeout(getAdsPerformance("7d"), 3000),
    withTimeout(countPerluPerhatian(), 3000),
  ])
  const badges: Record<string, number> = {}
  if (orderResult.status === "fulfilled") badges.order = orderResult.value
  if (adsResult.status === "fulfilled") badges.iklan = adsResult.value.kpi.adsRugi
  if (productsResult.status === "fulfilled") badges.produk = productsResult.value
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
      <main className="relative z-10 w-full p-4 lg:px-8 pb-24 md:pb-4">
        {children}
      </main>

      <MobileBottomNav
        tabs={MOBILE_NAV_TABS.filter((t) => t.roles.includes(session.user.role))}
        badges={badges}
        userName={userName}
        extra={<ThemeToggle />}
      />
      {/* Build version footer bar — sticky at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/40 backdrop-blur border-t border-white/10 py-1.5 px-4 text-center md:text-right">
        <span className="text-[7px] md:text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
          {`${process.env.NEXT_PUBLIC_BUILD_DATE}.${process.env.NEXT_PUBLIC_BUILD_HASH}`}
        </span>
      </div>
    </div>
  )
}
