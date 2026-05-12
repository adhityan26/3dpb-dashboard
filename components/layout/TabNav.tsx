"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, LayoutGroup } from "framer-motion"
import { GooeyFilter } from "@/components/ui/GooeyFilter"
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
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role))

  return (
    <nav
      className="hidden md:flex sticky top-0 z-50 items-center gap-5 px-8 py-[10px]"
      style={{
        background: "rgba(6,6,20,0.72)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid rgba(99,102,241,0.12)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
      }}
    >
      {/* Logo */}
      <div className="text-[15px] font-extrabold min-w-[160px] text-white flex items-center gap-[6px]">
        <span>🛍️</span>
        <span>
          <span style={{ color: "#a5b4fc", textShadow: "0 0 24px rgba(165,180,252,0.35)" }}>Shopee</span>
          <span className="font-medium text-white/60 ml-[5px]">Dashboard</span>
        </span>
      </div>

      {/* Floating Island — centered */}
      <div className="flex-1 flex justify-center">
        {/* Invisible gooey filter definition */}
        <GooeyFilter id="nav-goo" />

        {/* Island shell — border + shadow outside gooey layer */}
        <div
          className="relative rounded-[48px]"
          style={{
            background: "rgba(16,16,52,0.85)",
            border: "1px solid rgba(99,102,241,0.22)",
            padding: "8px 10px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Gooey layer — clips and blurs the blob. Must be overflow:hidden */}
          <div
            className="absolute inset-0 rounded-[48px] overflow-hidden pointer-events-none"
            style={{ filter: "url(#nav-goo)" }}
            aria-hidden
          >
            <LayoutGroup id="nav-island">
              {visibleTabs.map((tab, idx) => {
                const isActive = pathname.startsWith(tab.href)
                if (!isActive) return null
                return (
                  <motion.div
                    key="blob"
                    layoutId="nav-blob"
                    className="absolute top-[8px] bottom-[8px]"
                    style={{
                      background: "linear-gradient(135deg, #5055e8, #818cf8)",
                      borderRadius: 32,
                      boxShadow: "0 0 24px rgba(99,102,241,0.6), 0 0 50px rgba(99,102,241,0.2)",
                      left: `${idx * 72 + 10}px`,
                      width: 72,
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )
              })}
            </LayoutGroup>
          </div>

          {/* Tab labels — rendered above gooey layer */}
          <div className="relative z-10 flex">
            {visibleTabs.map((tab) => {
              const isActive = pathname.startsWith(tab.href)
              const badgeCount = badges[tab.href.slice(1)]

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="relative flex flex-col items-center gap-[3px] px-[8px] py-[7px] rounded-[40px] transition-colors"
                  style={{
                    width: 72,
                    color: isActive ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.32)",
                  }}
                >
                  <span
                    className="text-[18px] leading-none transition-transform duration-300"
                    style={{ transform: isActive ? "scale(1.15)" : "scale(1)" }}
                  >
                    {tab.icon}
                  </span>
                  <span className="text-[10px] font-semibold">{tab.label}</span>

                  {badgeCount != null && badgeCount > 0 && (
                    <div
                      className="absolute top-[3px] right-[6px] min-w-[15px] h-[15px] rounded-full text-white text-[8px] font-bold flex items-center justify-center px-[3px]"
                      style={{
                        background: "#ef4444",
                        boxShadow: "0 0 6px rgba(239,68,68,0.5)",
                        border: "1px solid rgba(8,8,24,0.5)",
                      }}
                    >
                      {badgeCount}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Control island — right side */}
      <ControlIsland userName={userName} />
    </nav>
  )
}
