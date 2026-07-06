"use client"

export type OrderChannel = "shopee" | "light-generator" | "strava" | "tokopedia"

const NAV_ITEMS: { channel: OrderChannel; icon: string; label: string }[] = [
  { channel: "shopee", icon: "🛒", label: "Shopee" },
  { channel: "tokopedia", icon: "🟢", label: "Tokopedia" },
  { channel: "light-generator", icon: "💡", label: "Light Generator" },
  { channel: "strava", icon: "🏃", label: "Strava" },
]

interface OrderSidebarProps {
  active: OrderChannel
  onChange: (channel: OrderChannel) => void
}

export function OrderSidebar({ active, onChange }: OrderSidebarProps) {
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
        Channel
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = active === item.channel
        return (
          <button
            key={item.channel}
            onClick={() => onChange(item.channel)}
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
