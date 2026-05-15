"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, LayoutGroup } from "framer-motion"
import { useState } from "react"
import { GooeyFilter } from "@/components/ui/GooeyFilter"
import { ThemeToggle } from "@/components/ThemeToggle"

const ALL_TABS = [
  { href: "/order",    label: "Order",    icon: "📦", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/iklan",    label: "Iklan",    icon: "📊", roles: ["OWNER", "TEST_USER"] },
  { href: "/analisa",  label: "Analisa",  icon: "📈", roles: ["OWNER", "TEST_USER"] },
  { href: "/produk",   label: "Produk",   icon: "🏷️", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/invoice",  label: "Invoice",  icon: "📄", roles: ["OWNER", "ADMIN"] },
  { href: "/settings", label: "Settings", icon: "⚙️", roles: ["OWNER"] },
]

interface MobileBottomNavProps {
  role: string
  badges?: Record<string, number>
  userName?: string
}

export function MobileBottomNav({ role, badges = {}, userName = "A" }: MobileBottomNavProps) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  const visibleTabs = ALL_TABS.filter((t) => t.roles.includes(role))
  const mainTabs = visibleTabs.slice(0, 4)
  const moreTabs = visibleTabs.slice(4)

  const activeBlobIdx = mainTabs.findIndex((t) => pathname.startsWith(t.href))
  const totalSlots = mainTabs.length + 1 // +1 for More button
  const slotWidthPct = `${100 / totalSlots}%`

  return (
    <>
      {/* Bottom bar — mobile only */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-[68px]"
        style={{
          background: "rgba(10,10,32,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(99,102,241,0.18)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <GooeyFilter id="mobile-goo" />

        {/* Gooey blob layer */}
        {activeBlobIdx >= 0 && (
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{ filter: "url(#mobile-goo)" }}
            aria-hidden
          >
            <LayoutGroup id="mobile-nav">
              <motion.div
                key="mobile-blob"
                layoutId="mobile-blob"
                className="absolute top-[10px] bottom-[10px]"
                style={{
                  background: "linear-gradient(135deg, #5055e8, #818cf8)",
                  borderRadius: 20,
                  boxShadow: "0 0 16px rgba(99,102,241,0.5)",
                  left: `calc(${activeBlobIdx} * ${slotWidthPct} + 6px)`,
                  width: `calc(${slotWidthPct} - 12px)`,
                }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            </LayoutGroup>
          </div>
        )}

        {/* Tabs row */}
        <div className="relative z-10 h-full flex">
          {mainTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href)
            const badgeCount = badges[tab.href.slice(1)]
            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch={false}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] relative"
                style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.3)" }}
              >
                <span
                  className="text-[20px] leading-none"
                  style={{
                    transform: isActive ? "scale(1.15)" : "scale(1)",
                    transition: "transform 0.3s",
                  }}
                >
                  {tab.icon}
                </span>
                <span className="text-[8px] font-semibold">{tab.label}</span>
                {badgeCount != null && badgeCount > 0 && (
                  <div
                    className="absolute top-[6px] right-[8px] min-w-[14px] h-[14px] rounded-full text-white text-[7px] font-bold flex items-center justify-center px-[3px]"
                    style={{
                      background: "#ef4444",
                      boxShadow: "0 0 5px rgba(239,68,68,0.5)",
                    }}
                  >
                    {badgeCount}
                  </div>
                )}
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-[3px]"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            <span className="text-[20px] leading-none">⋯</span>
            <span className="text-[8px] font-semibold">More</span>
          </button>
        </div>
      </div>

      {/* Bottom sheet overlay */}
      {sheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60]"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-[20px] p-4 pb-8"
            style={{
              background: "rgba(14,14,44,0.96)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderBottom: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div
              className="w-[32px] h-[3px] rounded-full mx-auto mb-4"
              style={{ background: "rgba(255,255,255,0.15)" }}
            />

            {/* Extra tabs */}
            {moreTabs.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                {moreTabs.map((tab) => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                prefetch={false}
                    onClick={() => setSheetOpen(false)}
                    className="flex flex-col items-center gap-2 p-3 rounded-[12px]"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(99,102,241,0.1)",
                    }}
                  >
                    <span className="text-[24px]">{tab.icon}</span>
                    <span className="text-[10px] font-semibold text-white/60">{tab.label}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Theme + user row */}
            <div className="flex items-center justify-between px-2">
              <ThemeToggle />
              <div className="flex items-center gap-3">
                <div
                  className="w-[32px] h-[32px] rounded-full p-[2px]"
                  style={{ background: "linear-gradient(135deg, #6366f1, #818cf8, #a78bfa)" }}
                >
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
                  >
                    {userName.trim().charAt(0).toUpperCase() || "A"}
                  </div>
                </div>
                <a
                  href="/api/auth/logout"
                  className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-sm"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                  aria-label="Logout"
                >
                  ⏻
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
