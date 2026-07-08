"use client"

import { ThemeToggle } from "@/components/ThemeToggle"

interface ControlIslandProps {
  userName?: string
  isDark?: boolean
}

export function ControlIsland({ userName = "A", isDark = true }: ControlIslandProps) {
  const initials = userName.trim().charAt(0).toUpperCase() || "A"

  const islandStyle = isDark ? {
    background: "rgba(16,16,52,0.88)",
    border: "1px solid rgba(99,102,241,0.22)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
  } : {
    background: "rgba(255,255,255,0.42)",
    border: "1px solid rgba(200,190,255,0.35)",
    boxShadow: "0 2px 12px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
  }

  const dividerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,241,0.12)"
  const logoutColor  = isDark ? "rgba(255,255,255,0.3)"  : "rgba(30,27,75,0.28)"

  return (
    <div
      className="flex items-center gap-1 flex-shrink-0 rounded-[28px] p-[5px]"
      style={islandStyle}
    >
      {/* Theme toggle */}
      <ThemeToggle />

      {/* Divider */}
      <div className="w-px h-[18px] mx-[2px]" style={{ background: dividerColor }} />

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
      <div className="w-px h-[18px] mx-[2px]" style={{ background: dividerColor }} />

      {/* Logout */}
      <a
        href="/api/auth/logout"
        title="Logout"
        className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-sm transition-colors"
        style={{ color: logoutColor }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(239,68,68,0.8)"
          e.currentTarget.style.background = "rgba(239,68,68,0.1)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = logoutColor
          e.currentTarget.style.background = ""
        }}
        aria-label="Logout"
      >
        ⏻
      </a>
    </div>
  )
}
