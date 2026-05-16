"use client"

import { useState } from "react"
import type { FlexRange, DateRangePreset } from "@/lib/dateRange"
import { PRESET_LABELS, isCustomRange, resolveRange } from "@/lib/dateRange"

interface Props {
  value: FlexRange
  onChange: (r: FlexRange) => void
}

const PRESETS: DateRangePreset[] = ["7d", "this_week", "30d", "this_month", "custom"]

export function DateRangeSelector({ value, onChange }: Props) {
  const activePreset = isCustomRange(value) ? "custom" : value as DateRangePreset

  // Custom range local state
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(
    isCustomRange(value) ? value.from : today
  )
  const [to, setTo] = useState(
    isCustomRange(value) ? value.to : today
  )
  const [showCustom, setShowCustom] = useState(isCustomRange(value))

  function selectPreset(p: DateRangePreset) {
    if (p === "custom") {
      setShowCustom(true)
    } else {
      setShowCustom(false)
      onChange(p)
    }
  }

  function applyCustom() {
    if (from && to && from <= to) {
      onChange({ from, to })
    }
  }

  const { startDate, endDate } = resolveRange(value)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => selectPreset(p)}
            className="h-8 px-3 rounded-[8px] text-xs font-medium transition-all"
            style={activePreset === p
              ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }
            }
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            max={to}
            onChange={e => setFrom(e.target.value)}
            className="glass-input h-8 rounded-[8px] px-2 text-xs"
            style={{ minWidth: 130 }}
          />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>—</span>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={e => setTo(e.target.value)}
            className="glass-input h-8 rounded-[8px] px-2 text-xs"
            style={{ minWidth: 130 }}
          />
          <button
            onClick={applyCustom}
            disabled={!from || !to || from > to}
            className="h-8 px-3 rounded-[8px] text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)", minWidth: 60 }}
          >
            Terapkan
          </button>
        </div>
      )}

      {/* Active range display */}
      <span className="text-xs ml-1" style={{ color: "rgba(255,255,255,0.3)" }}>
        {startDate.split("-").reverse().join("/")} – {endDate.split("-").reverse().join("/")}
      </span>
    </div>
  )
}
