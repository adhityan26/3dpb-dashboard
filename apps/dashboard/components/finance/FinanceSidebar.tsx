"use client"

import { SectionSidebar, type SectionSidebarItem } from "@/components/layout/SectionSidebar"

export type FinanceTab = "po" | "invoice" | "gopay"

const ITEMS: SectionSidebarItem<FinanceTab>[] = [
  { key: "po",      icon: "📋", label: "Purchase Order" },
  { key: "invoice", icon: "📄", label: "Invoice" },
  { key: "gopay",   icon: "💳", label: "GoPay" },
]

interface FinanceSidebarProps {
  active: FinanceTab
  onChange: (tab: FinanceTab) => void
}

export function FinanceSidebar({ active, onChange }: FinanceSidebarProps) {
  return <SectionSidebar label="Finance" items={ITEMS} active={active} onChange={onChange} />
}
