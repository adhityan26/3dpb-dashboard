"use client"

import { useCmsCounts } from "@/lib/hooks/use-cms"

type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"

interface NavItem {
  section: CmsSection
  icon: string
  label: string
  badge?: (counts: ReturnType<typeof useCmsCounts>["data"]) => number | null
  badgeVariant?: "default" | "alert"
}

const NAV_ITEMS: NavItem[] = [
  { section: "site-settings", icon: "⚙️", label: "Site Settings" },
  {
    section: "gallery", icon: "🖼️", label: "Galeri",
    badge: (c) => c?.gallery ?? null,
  },
  {
    section: "testimonials", icon: "💬", label: "Testimoni",
    badge: (c) => c?.testimonials ?? null,
  },
  {
    section: "faq", icon: "❓", label: "FAQ",
    badge: (c) => c?.faq ?? null,
  },
  {
    section: "strava-orders", icon: "🗺️", label: "Strava Orders",
    badge: (c) => c?.stravaOrdersNew ?? null,
    badgeVariant: "alert",
  },
  {
    section: "waitlist", icon: "📧", label: "Waitlist",
    badge: (c) => c?.waitlist ?? null,
  },
  { section: "generator", icon: "🎨", label: "Generator" },
  { section: "faceshell", icon: "🕷️", label: "Faceshell" },
]

interface CMSSidebarProps {
  active: CmsSection
  onChange: (section: CmsSection) => void
}

export function CMSSidebar({ active, onChange }: CMSSidebarProps) {
  const { data: counts } = useCmsCounts()

  return (
    <div
      className="w-[180px] flex-shrink-0 flex flex-col gap-[2px] p-2"
      style={{
        background: "rgba(10,10,30,0.6)",
        borderRight: "1px solid rgba(99,102,241,0.12)",
        minHeight: "calc(100vh - 60px)",
      }}
    >
      <div
        className="text-[9px] font-semibold uppercase tracking-widest px-2 py-2 mb-1"
        style={{ color: "rgba(255,255,255,0.2)" }}
      >
        Konten Landing
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = active === item.section
        const badgeCount = item.badge?.(counts)
        return (
          <button
            key={item.section}
            onClick={() => onChange(item.section)}
            className="flex items-center gap-2 px-2 py-[6px] rounded-[8px] w-full text-left transition-all"
            style={{
              background: isActive ? "rgba(99,102,241,0.2)" : "transparent",
              border: isActive ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent",
              color: isActive ? "white" : "rgba(255,255,255,0.45)",
            }}
          >
            <span className="text-[13px]">{item.icon}</span>
            <span className="text-[11px] font-medium flex-1">{item.label}</span>
            {badgeCount != null && badgeCount > 0 && (
              <span
                className="text-[9px] font-bold px-[5px] py-[1px] rounded-full"
                style={{
                  background: item.badgeVariant === "alert"
                    ? "rgba(245,158,11,0.25)"
                    : "rgba(99,102,241,0.3)",
                  color: item.badgeVariant === "alert"
                    ? "#f59e0b"
                    : "rgba(165,180,252,0.9)",
                }}
              >
                {badgeCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
