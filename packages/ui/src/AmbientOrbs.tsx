"use client"

import { useEffect, useRef } from "react"

// Colors: Indigo → Purple → Green → Blue → Violet
const COLORS: [number, number, number][] = [
  [99, 102, 241],
  [168, 85, 247],
  [34, 197, 94],
  [59, 130, 246],
  [139, 92, 246],
]

interface OrbConfig {
  size: number
  opacity: number
  speed: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

const ORB_CONFIGS: OrbConfig[] = [
  { size: 700, opacity: 0.13, speed: 25, xMin: -0.3, xMax: 0.6, yMin: -0.4, yMax: 0.3 },
  { size: 500, opacity: 0.10, speed: 30, xMin: -0.2, xMax: 0.5, yMin: 0.3, yMax: 1.1 },
  { size: 220, opacity: 0.12, speed: 40, xMin: 0.05, xMax: 0.6, yMin: 0.4, yMax: 1.0 },
]

function rand(a: number, b: number) { return a + Math.random() * (b - a) }
function lerpColor(c1: number[], c2: number[], t: number) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t))
}

export function AmbientOrbs() {
  const refs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ]

  useEffect(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight

    type OrbState = {
      x: number; y: number; vx: number; vy: number
      colorIdx: number; nextColorIdx: number; colorT: number
      colorSpeed: number; last: number | null
    }

    const states: OrbState[] = ORB_CONFIGS.map((cfg) => ({
      x: rand(cfg.xMin, cfg.xMax) * vw,
      y: rand(cfg.yMin, cfg.yMax) * vh,
      vx: rand(-cfg.speed, cfg.speed),
      vy: rand(-cfg.speed, cfg.speed),
      colorIdx: Math.floor(Math.random() * COLORS.length),
      nextColorIdx: Math.floor(Math.random() * COLORS.length),
      colorT: 0,
      colorSpeed: rand(0.0003, 0.0008),
      last: null,
    }))

    let rafId: number

    function tick(ts: number) {
      ORB_CONFIGS.forEach((cfg, i) => {
        const el = refs[i].current
        const s = states[i]
        if (!el) return

        if (s.last === null) { s.last = ts; return }
        const dt = ts - s.last
        s.last = ts

        s.x += s.vx * dt / 1000
        s.y += s.vy * dt / 1000

        const margin = cfg.size * 0.3
        if (s.x < -margin) s.vx = Math.abs(s.vx)
        if (s.x > vw - margin) s.vx = -Math.abs(s.vx)
        if (s.y < -margin) s.vy = Math.abs(s.vy)
        if (s.y > vh - margin) s.vy = -Math.abs(s.vy)

        if (Math.random() < 0.005) {
          s.vx = Math.max(-cfg.speed * 2, Math.min(cfg.speed * 2, s.vx + rand(-5, 5)))
          s.vy = Math.max(-cfg.speed * 2, Math.min(cfg.speed * 2, s.vy + rand(-5, 5)))
        }

        s.colorT += s.colorSpeed * dt
        if (s.colorT >= 1) {
          s.colorT = 0
          s.colorIdx = s.nextColorIdx
          s.nextColorIdx = (s.colorIdx + Math.floor(rand(1, COLORS.length))) % COLORS.length
        }

        const [r, g, b] = lerpColor(COLORS[s.colorIdx], COLORS[s.nextColorIdx], s.colorT)
        el.style.transform = `translate(${s.x}px, ${s.y}px)`
        el.style.background = `radial-gradient(circle, rgba(${r},${g},${b},${cfg.opacity}) 0%, transparent 70%)`
      })

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block" aria-hidden>
      {ORB_CONFIGS.map((cfg, i) => (
        <div
          key={i}
          ref={refs[i]}
          className="absolute rounded-full top-0 left-0"
          style={{ width: cfg.size, height: cfg.size, willChange: "transform", transition: "background 3s ease" }}
        />
      ))}
    </div>
  )
}
