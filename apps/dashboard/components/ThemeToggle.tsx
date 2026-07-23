"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

type ThemeState = "light" | "system" | "dark"

const POSITIONS: Record<ThemeState, number> = { light: 4, system: 28, dark: 52 }
const STATES: ThemeState[] = ["light", "system", "dark"]

function SunIcon() {
  return (
    <div className="relative w-[12px] h-[12px]">
      {/* Sun body */}
      <div
        className="w-full h-full rounded-full"
        style={{ background: "radial-gradient(circle at 38% 36%, #ffe570, #fbbf24, #e07b00)" }}
      />
      {/* Rays */}
      <div
        className="absolute inset-[-4px] rounded-full"
        style={{
          background: [
            "radial-gradient(circle at 50% 0%,   #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 50% 100%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 0%   50%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 100% 50%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 15%  15%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 85%  15%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 15%  85%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 85%  85%, #fbbf24 1px, transparent 1.5px)",
          ].join(", "),
        }}
      />
    </div>
  )
}

function LaptopIcon() {
  return (
    <div className="relative w-[16px] h-[12px]">
      <div
        className="absolute top-0 left-0 right-0 h-[8px] rounded-[5px]"
        style={{ border: "1px solid rgba(165,180,252,0.8)", background: "rgba(99,102,241,0.25)" }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-[5px] bg-[#a5b4fc]" />
    </div>
  )
}

function MoonIcon() {
  return (
    <div
      className="relative w-[13px] h-[13px] rounded-full overflow-hidden"
      style={{
        background: "radial-gradient(circle at 38% 35%, #e4e4e7, #a1a1aa, #71717a)",
        boxShadow: "inset -2px -1px 4px rgba(0,0,0,0.12)",
      }}
    >
      <div className="absolute w-[4px] h-[4px] rounded-full bg-black/10 top-[3px] left-[3px]" />
      <div className="absolute w-[3px] h-[3px] rounded-full bg-black/[0.08] top-[7px] left-[7px]" />
    </div>
  )
}

const BALL_STYLES: Record<ThemeState, React.CSSProperties> = {
  light: {
    background: "radial-gradient(circle at 35% 35%, #fffbeb, #fde68a, #f59e0b)",
    boxShadow: "0 0 10px rgba(251,191,36,0.4), 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)",
  },
  system: {
    background: "radial-gradient(circle at 35% 35%, #e0e7ff, #a5b4fc, #6366f1)",
    boxShadow: "0 0 8px rgba(99,102,241,0.4), 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)",
  },
  dark: {
    background: "radial-gradient(circle at 35% 35%, #f1f5f9, #cbd5e1, #94a3b8)",
    boxShadow: "inset -2px -1px 4px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.25)",
  },
}

const BG_STYLES: Record<ThemeState, React.CSSProperties> = {
  light: { background: "linear-gradient(160deg, #38bdf8, #7dd3fc, #bae6fd)" },
  system: { background: "linear-gradient(160deg, #0f172a, #1e1b4b, #0f172a)" },
  dark: { background: "linear-gradient(160deg, #020617, #0f0f2e, #020617)" },
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState<ThemeState>("system")

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  // Sync local `active` state from the theme store (adjust state during render, per React docs)
  const [prevTheme, setPrevTheme] = useState(theme)
  if (theme !== prevTheme) {
    setPrevTheme(theme)
    if (theme === "light" || theme === "dark" || theme === "system") {
      setActive(theme as ThemeState)
    }
  }

  if (!mounted) return <div className="w-[80px] h-[32px] rounded-full bg-white/5" />

  function cycle(e: React.MouseEvent<HTMLButtonElement>) {
    const idx = STATES.indexOf(active)
    const next = STATES[(idx + 1) % STATES.length]

    // View Transitions API — circular reveal from toggle button position
    if (!document.startViewTransition) {
      setActive(next)
      setTheme(next)
      return
    }

    // Get click position for the reveal origin
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(rect.left + rect.width / 2)
    const y = Math.round(rect.top + rect.height / 2)
    const maxR = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    const transition = document.startViewTransition(() => {
      setActive(next)
      setTheme(next)
    })

    transition.ready.then(() => {
      // Circular reveal expands from toggle button — new page slides in like glass
      document.documentElement.animate(
        [
          {
            clipPath: `circle(0px at ${x}px ${y}px)`,
            filter: "blur(12px) brightness(1.15)",
            opacity: "0",
          },
          {
            clipPath: `circle(${maxR * 0.3}px at ${x}px ${y}px)`,
            filter: "blur(4px) brightness(1.05)",
            opacity: "0.8",
            offset: 0.3,
          },
          {
            clipPath: `circle(${maxR}px at ${x}px ${y}px)`,
            filter: "blur(0px) brightness(1)",
            opacity: "1",
          },
        ],
        {
          duration: 500,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    })
  }

  return (
    <button
      onClick={cycle}
      title={`Theme: ${active}`}
      aria-label="Toggle theme"
      className="relative w-[80px] h-[32px] rounded-full overflow-hidden flex-shrink-0 cursor-pointer"
      style={{ border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)" }}
    >
      {/* Background */}
      <div className="absolute inset-0 transition-all duration-500" style={BG_STYLES[active]} />

      {/* Stars (system/dark) */}
      {(active === "system" || active === "dark") && (
        <div className="absolute inset-0" aria-hidden>
          {[
            { top: "28%", left: "60%", size: 2 },
            { top: "55%", left: "75%", size: 1.5 },
            { top: "22%", left: "84%", size: 2 },
            { top: "65%", left: "88%", size: 1 },
          ].map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{ width: s.size, height: s.size, top: s.top, left: s.left, background: "rgba(255,255,255,0.7)" }}
            />
          ))}
        </div>
      )}

      {/* Cloud (light) */}
      {active === "light" && (
        <div className="absolute" style={{ right: 6, top: 7 }} aria-hidden>
          <div className="relative w-[34px] h-[18px]">
            <div className="absolute w-[22px] h-[15px] rounded-full bg-white/60 top-[2px] left-0" />
            <div className="absolute w-[16px] h-[12px] rounded-full bg-white/60 top-[4px] left-[14px]" />
            <div className="absolute w-[34px] h-[8px] rounded-full bg-white/60 bottom-0" />
          </div>
        </div>
      )}

      {/* Sliding ball */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-[24px] h-[24px] rounded-full flex items-center justify-center z-10"
        style={{
          left: POSITIONS[active],
          transition: "left 0.4s cubic-bezier(0.34, 1.4, 0.64, 1)",
          ...BALL_STYLES[active],
        }}
      >
        {active === "light"  && <SunIcon />}
        {active === "system" && <LaptopIcon />}
        {active === "dark"   && <MoonIcon />}
      </div>
    </button>
  )
}
