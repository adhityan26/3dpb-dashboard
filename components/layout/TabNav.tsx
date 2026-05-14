"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { ControlIsland } from "@/components/layout/ControlIsland"

interface Tab {
  href: string
  label: string
  icon: string
  roles: string[]
}

const TABS: Tab[] = [
  { href: "/order",    label: "Order",    icon: "📦", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/iklan",    label: "Iklan",    icon: "📊", roles: ["OWNER", "TEST_USER"] },
  { href: "/analisa",  label: "Analisa",  icon: "📈", roles: ["OWNER", "TEST_USER"] },
  { href: "/produk",   label: "Produk",   icon: "🏷️", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/settings", label: "Settings", icon: "⚙️", roles: ["OWNER"] },
]

interface TabNavProps {
  role: string
  badges?: Record<string, number>
  userName?: string
}

export function TabNav({ role, badges = {}, userName = "" }: TabNavProps) {
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === "dark"
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role))

  // Theme-aware styles
  const navStyle = isDark ? {
    background: "rgba(6,6,20,0.72)",
    backdropFilter: "blur(20px) saturate(1.4)",
    WebkitBackdropFilter: "blur(20px) saturate(1.4)",
    borderBottom: "1px solid rgba(99,102,241,0.12)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
  } : {
    background: "rgba(255,255,255,0.55)",
    backdropFilter: "blur(28px) saturate(2) brightness(1.02)",
    WebkitBackdropFilter: "blur(28px) saturate(2) brightness(1.02)",
    borderBottom: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 4px 24px rgba(99,102,241,0.06), inset 0 -1px 0 rgba(99,102,241,0.06)",
  }

  const islandStyle = isDark ? {
    background: "rgba(16,16,52,0.85)",
    border: "1px solid rgba(99,102,241,0.22)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
  } : {
    background: "rgba(255,255,255,0.42)",
    border: "1px solid rgba(200,190,255,0.35)",
    boxShadow: "0 4px 24px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
  }

  // Glass blob — mimics real glass: frosted, specular highlight, iridescent edge
  const blobStyle = isDark ? {
    // Dark: deep indigo glass with strong glow
    background: "linear-gradient(160deg, rgba(120,120,255,0.55) 0%, rgba(80,85,232,0.45) 50%, rgba(60,65,200,0.55) 100%)",
    backdropFilter: "blur(20px) saturate(2) brightness(1.15)",
    WebkitBackdropFilter: "blur(20px) saturate(2) brightness(1.15)",
    borderRadius: 32,
    // Specular top highlight + outer glow
    boxShadow: [
      "inset 0 1.5px 0 rgba(255,255,255,0.45)",   // top specular
      "inset 0 -1px 0 rgba(0,0,0,0.2)",            // bottom shadow
      "inset 1px 0 0 rgba(255,255,255,0.1)",        // left rim
      "0 0 28px rgba(99,102,241,0.55)",             // outer glow
      "0 0 60px rgba(99,102,241,0.2)",              // wide ambient
    ].join(", "),
    border: "1px solid rgba(180,180,255,0.3)",
  } : {
    // Light: clear frosted glass lens
    background: "linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(220,215,255,0.35) 50%, rgba(200,195,255,0.4) 100%)",
    backdropFilter: "blur(24px) saturate(2.5) brightness(1.08)",
    WebkitBackdropFilter: "blur(24px) saturate(2.5) brightness(1.08)",
    borderRadius: 32,
    boxShadow: [
      "inset 0 1.5px 0 rgba(255,255,255,0.9)",     // top specular
      "inset 0 -1px 0 rgba(0,0,0,0.06)",            // bottom shadow
      "0 4px 16px rgba(99,102,241,0.15)",            // soft drop shadow
      "0 1px 0 rgba(255,255,255,0.8)",               // base highlight
    ].join(", "),
    border: "1px solid rgba(180,170,255,0.5)",
  }

  const activeTabColor  = isDark ? "rgba(255,255,255,1)"   : "rgba(30,27,75,0.9)"
  const inactiveTabColor = isDark ? "rgba(255,255,255,0.32)" : "rgba(30,27,75,0.38)"
  const logoAccentColor = isDark ? "#a5b4fc" : "#6366f1"
  const logoDashColor   = isDark ? "rgba(255,255,255,0.6)"  : "rgba(30,27,75,0.4)"

  return (
    <nav
      className="hidden md:flex sticky top-0 z-50 items-center gap-5 px-8 py-[10px]"
      style={navStyle}
    >
      {/* Logo */}
      <div className="text-[15px] font-extrabold min-w-[160px] flex items-center gap-[6px]">
        <span>🖨️</span>
        <span>
          <span style={{ color: logoAccentColor, textShadow: isDark ? "0 0 24px rgba(165,180,252,0.35)" : "none" }}>3PB</span>
          <span className="font-medium ml-[5px]" style={{ color: logoDashColor }}>Ops</span>
        </span>
      </div>

      {/* Floating Island — centered, no blob — scale + brightness active indicator */}
      <div className="flex-1 flex justify-center">
        <div className="relative rounded-[48px] flex" style={{ ...islandStyle, padding: "8px 10px" }}>
          {visibleTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href)
            const badgeCount = badges[tab.href.slice(1)]

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative flex flex-col items-center gap-[3px] px-[8px] py-[7px] rounded-[40px]"
                style={{
                  width: 72,
                  color: isActive ? activeTabColor : inactiveTabColor,
                  transform: isActive ? "scale(1.12)" : "scale(0.88)",
                  opacity: isActive ? 1 : 0.5,
                  transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease, color 0.3s ease",
                  zIndex: isActive ? 2 : 1,
                }}
              >
                <span className="text-[18px] leading-none">{tab.icon}</span>
                <span className="text-[10px] font-semibold">{tab.label}</span>

                {badgeCount != null && badgeCount > 0 && (
                  <div
                    className="absolute top-[3px] right-[6px] min-w-[15px] h-[15px] rounded-full text-white text-[8px] font-bold flex items-center justify-center px-[3px]"
                    style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.5)" }}
                  >
                    {badgeCount}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Control island */}
      <ControlIsland userName={userName} isDark={isDark} />
    </nav>
  )
}
