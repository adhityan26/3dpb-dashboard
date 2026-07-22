"use client"

import { SectionSidebar, type SectionSidebarItem } from "@/components/layout/SectionSidebar"
import { useCmsCounts } from "@/lib/hooks/use-cms"

type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"
  | "lg-orders" | "keycap-orders"

type Counts = ReturnType<typeof useCmsCounts>["data"]

interface NavDef {
  section: CmsSection
  icon: string
  label: string
  badge?: (counts: Counts) => number | null
  badgeVariant?: "default" | "alert"
}

const NAV_ITEMS: NavDef[] = [
  { section: "site-settings", icon: "⚙️", label: "Site Settings" },
  { section: "gallery", icon: "🖼️", label: "Galeri", badge: (c) => c?.gallery ?? null },
  { section: "testimonials", icon: "💬", label: "Testimoni", badge: (c) => c?.testimonials ?? null },
  { section: "faq", icon: "❓", label: "FAQ", badge: (c) => c?.faq ?? null },
  { section: "strava-orders", icon: "🗺️", label: "Strava Orders", badge: (c) => c?.stravaOrdersNew ?? null, badgeVariant: "alert" },
  { section: "waitlist", icon: "📧", label: "Waitlist", badge: (c) => c?.waitlist ?? null },
  { section: "generator", icon: "🎨", label: "Generator" },
  { section: "faceshell", icon: "🕷️", label: "Faceshell" },
  { section: "lg-orders", icon: "🔦", label: "LG Orders", badge: (c) => c?.lgOrdersPending ?? null, badgeVariant: "alert" },
  { section: "keycap-orders", icon: "⌨️", label: "Keycap Orders", badge: (c) => c?.keycapOrdersPending ?? null, badgeVariant: "alert" },
]

interface CMSSidebarProps {
  active: CmsSection
  onChange: (section: CmsSection) => void
}

export function CMSSidebar({ active, onChange }: CMSSidebarProps) {
  const { data: counts } = useCmsCounts()

  const items: SectionSidebarItem<CmsSection>[] = NAV_ITEMS.map((it) => ({
    key: it.section,
    icon: it.icon,
    label: it.label,
    badge: it.badge?.(counts) ?? null,
    badgeVariant: it.badgeVariant,
  }))

  return <SectionSidebar label="Konten Landing" items={items} active={active} onChange={onChange} />
}
