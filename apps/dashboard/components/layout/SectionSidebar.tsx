"use client"

/**
 * Sidebar seksi bersama (Order / Produk / CMS). Theme-aware: terang di light,
 * gelap di dark — pakai token glass `g-t*` + tint indigo, JANGAN hardcode warna
 * dark. Wrapper per-seksi cukup menyuplai `label` + `items`; jangan menyalin
 * markup ini lagi (dulu 3 sidebar copy-paste → fix light-mode tak menyebar).
 */
export interface SectionSidebarItem<T extends string> {
  key: T
  icon: string
  label: string
  badge?: number | null
  badgeVariant?: "default" | "alert"
}

interface SectionSidebarProps<T extends string> {
  /** Judul kecil di atas daftar (mis. "Channel", "Produk"). */
  label: string
  items: SectionSidebarItem<T>[]
  active: T
  onChange: (key: T) => void
}

export function SectionSidebar<T extends string>({
  label,
  items,
  active,
  onChange,
}: SectionSidebarProps<T>) {
  return (
    <div
      className="w-[180px] flex-shrink-0 flex flex-col gap-[2px] p-2 bg-indigo-500/[0.04] dark:bg-[rgba(10,10,30,0.6)] border-r border-indigo-500/10 dark:border-indigo-500/[0.12]"
      style={{ minHeight: "calc(100vh - 60px)" }}
    >
      <div className="text-[9px] font-semibold uppercase tracking-widest px-2 py-2 mb-1 g-t3">
        {label}
      </div>

      {items.map((item) => {
        const isActive = active === item.key
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex items-center gap-2 px-2 py-[6px] rounded-[8px] w-full text-left transition-all border ${
              isActive
                ? "bg-indigo-500/15 dark:bg-indigo-500/20 border-indigo-500/30 g-t1"
                : "border-transparent g-t2 hover:bg-indigo-500/[0.06]"
            }`}
          >
            <span className="text-[13px]">{item.icon}</span>
            <span className="text-[11px] font-medium flex-1">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span
                className={`text-[9px] font-bold px-[5px] py-[1px] rounded-full ${
                  item.badgeVariant === "alert"
                    ? "bg-amber-500/25 text-amber-700 dark:text-amber-400"
                    : "bg-indigo-500/25 text-indigo-700 dark:text-indigo-300"
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
