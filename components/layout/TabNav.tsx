"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/ThemeToggle"

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
}

export function TabNav({ role, badges = {} }: TabNavProps) {
  const pathname = usePathname()
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role))

  return (
    <nav className="sticky top-0 z-50 bg-[#EE4D2D] dark:bg-slate-900 shadow-md">
      <div className="max-w-6xl mx-auto flex items-center overflow-x-auto">
        <div className="flex flex-1">
          {visibleTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href)
            const key = tab.href.slice(1)
            const badgeCount = badges[key]

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-white dark:border-indigo-400 text-white dark:text-indigo-400"
                    : "border-transparent text-white/70 dark:text-slate-400 hover:text-white dark:hover:text-slate-200 hover:border-white/50 dark:hover:border-slate-500"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {badgeCount != null && badgeCount > 0 && (
                  <Badge className="bg-white text-[#EE4D2D] dark:bg-indigo-500 dark:text-white text-xs px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center">
                    {badgeCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>
        <div className="px-3 py-1.5 flex-shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
