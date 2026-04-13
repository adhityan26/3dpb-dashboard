"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

const OPTIONS = [
  { value: "light", icon: "☀️", label: "Light" },
  { value: "system", icon: "💻", label: "Auto" },
  { value: "dark", icon: "🌙", label: "Dark" },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-24 h-7" />

  return (
    <div className="flex items-center bg-white/10 rounded-full p-0.5 gap-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          className={`px-2 py-1 rounded-full text-xs transition-colors ${
            theme === opt.value
              ? "bg-indigo-500 text-white"
              : "text-white/70 hover:text-white"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}
