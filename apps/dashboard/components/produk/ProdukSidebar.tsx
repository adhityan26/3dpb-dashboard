"use client"

import { SectionSidebar, type SectionSidebarItem } from "@/components/layout/SectionSidebar"

export type ProdukTab = "katalog" | "produk" | "kalkulator" | "filamen"

const ITEMS: SectionSidebarItem<ProdukTab>[] = [
  { key: "katalog",    icon: "📦", label: "Katalog" },
  { key: "produk",     icon: "🛍️", label: "Shopee" },
  { key: "kalkulator", icon: "🧮", label: "Kalkulator" },
  { key: "filamen",    icon: "🧵", label: "Filamen" },
]

interface ProdukSidebarProps {
  active: ProdukTab
  onChange: (tab: ProdukTab) => void
}

export function ProdukSidebar({ active, onChange }: ProdukSidebarProps) {
  return <SectionSidebar label="Produk" items={ITEMS} active={active} onChange={onChange} />
}
