"use client"

import { SectionSidebar, type SectionSidebarItem } from "@/components/layout/SectionSidebar"

export type OrderChannel = "shopee" | "light-generator" | "strava" | "tokopedia"

const ITEMS: SectionSidebarItem<OrderChannel>[] = [
  { key: "shopee", icon: "🛒", label: "Shopee" },
  { key: "tokopedia", icon: "🟢", label: "Tokopedia" },
  { key: "light-generator", icon: "💡", label: "Light Generator" },
  { key: "strava", icon: "🏃", label: "Strava" },
]

interface OrderSidebarProps {
  active: OrderChannel
  onChange: (channel: OrderChannel) => void
}

export function OrderSidebar({ active, onChange }: OrderSidebarProps) {
  return <SectionSidebar label="Channel" items={ITEMS} active={active} onChange={onChange} />
}
