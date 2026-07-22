"use client"

/**
 * Sidebar seksi bersama (Order / Produk / CMS). Bahasa desain = Glass:
 * container glass-card (rounded-2xl, blur, translucent) yang FLOATING + sticky,
 * bukan strip datar full-height — supaya senada dengan KPI card, order row, dan
 * floating-island nav. Theme-aware via token glass `g-t*`; JANGAN hardcode warna
 * dark. Item aktif = indigo blob (meniru active-blob island). Wrapper per-seksi
 * cukup menyuplai `label` + `items`; jangan menyalin markup ini lagi.
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
    <aside className="w-[196px] flex-shrink-0 flex flex-col">
      <div
        className="
          flex-1 min-h-[calc(100vh-88px)] flex flex-col gap-1 p-2.5 rounded-2xl
          bg-white/[0.38] dark:bg-white/[0.05]
          backdrop-blur-[20px] dark:backdrop-blur-[12px] saturate-[180%]
          border border-[rgba(200,190,255,0.35)] dark:border-indigo-500/10
          shadow-[0_4px_20px_rgba(99,102,241,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]
          dark:shadow-[0_4px_20px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.05)]
        "
      >
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] px-2 pt-1 pb-1.5 g-t3">
          {label}
        </div>

        {items.map((item) => {
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`flex items-center gap-2.5 px-2 py-[7px] rounded-xl w-full text-left transition-all ${
                isActive
                  ? "text-white shadow-[0_2px_12px_rgba(99,102,241,0.4)]"
                  : "g-t2 hover:bg-indigo-500/[0.07] dark:hover:bg-white/[0.05]"
              }`}
              style={
                isActive
                  ? { background: "linear-gradient(135deg, #5055e8, #818cf8)" }
                  : undefined
              }
            >
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-lg text-[14px] leading-none shrink-0 ${
                  isActive ? "bg-white/20" : "bg-black/[0.04] dark:bg-white/[0.06]"
                }`}
              >
                {item.icon}
              </span>
              <span className="text-[12px] font-medium flex-1 truncate">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    isActive
                      ? "bg-white/25 text-white"
                      : item.badgeVariant === "alert"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                        : "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
