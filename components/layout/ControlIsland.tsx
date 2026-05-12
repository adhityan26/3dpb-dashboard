import { ThemeToggle } from "@/components/ThemeToggle"

interface ControlIslandProps {
  userName?: string
}

export function ControlIsland({ userName = "A" }: ControlIslandProps) {
  const initials = userName.trim().charAt(0).toUpperCase() || "A"

  return (
    <div
      className="flex items-center gap-1 flex-shrink-0 rounded-[28px] p-[5px]"
      style={{
        background: "rgba(16,16,52,0.88)",
        border: "1px solid rgba(99,102,241,0.22)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
      }}
    >
      {/* Theme toggle */}
      <ThemeToggle />

      {/* Divider */}
      <div className="w-px h-[18px] mx-[2px]" style={{ background: "rgba(255,255,255,0.08)" }} />

      {/* Avatar with gradient ring */}
      <div
        className="w-[32px] h-[32px] rounded-full p-[2px] flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, #6366f1, #818cf8, #a78bfa)",
          boxShadow: "0 0 12px rgba(99,102,241,0.5)",
        }}
        title={userName}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
        >
          {initials}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-[18px] mx-[2px]" style={{ background: "rgba(255,255,255,0.08)" }} />

      {/* Logout */}
      <a
        href="/api/auth/logout"
        title="Logout"
        className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-sm transition-colors"
        style={{ color: "rgba(255,255,255,0.3)" }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.color = "rgba(239,68,68,0.8)"
          el.style.background = "rgba(239,68,68,0.1)"
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.color = "rgba(255,255,255,0.3)"
          el.style.background = ""
        }}
        aria-label="Logout"
      >
        ⏻
      </a>
    </div>
  )
}
