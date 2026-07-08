"use client"

export type ProdukTab = "katalog" | "produk" | "kalkulator" | "filamen"

const NAV_ITEMS: { tab: ProdukTab; icon: string; label: string }[] = [
  { tab: "katalog",    icon: "📦", label: "Katalog" },
  { tab: "produk",     icon: "🛍️", label: "Shopee" },
  { tab: "kalkulator", icon: "🧮", label: "Kalkulator" },
  { tab: "filamen",    icon: "🧵", label: "Filamen" },
]

interface ProdukSidebarProps {
  active: ProdukTab
  onChange: (tab: ProdukTab) => void
}

export function ProdukSidebar({ active, onChange }: ProdukSidebarProps) {
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
        Produk
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = active === item.tab
        return (
          <button
            key={item.tab}
            onClick={() => onChange(item.tab)}
            className="flex items-center gap-2 px-2 py-[6px] rounded-[8px] w-full text-left transition-all"
            style={{
              background: isActive ? "rgba(99,102,241,0.2)" : "transparent",
              border: isActive ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent",
              color: isActive ? "white" : "rgba(255,255,255,0.45)",
            }}
          >
            <span className="text-[13px]">{item.icon}</span>
            <span className="text-[11px] font-medium flex-1">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
