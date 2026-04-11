"use client"

import { useRef, useState } from "react"

interface Props {
  /** Current HPP value. null = not set. */
  value: number | null
  /** Called when user commits a new value. null to delete. */
  onSave: (newValue: number | null) => void
  /** If true, component is read-only (no click to edit). */
  disabled?: boolean
  /** Shown when value is null, e.g. "Set HPP" */
  placeholder?: string
  /** Optional label prefix shown before the value, e.g. "HPP:" */
  label?: string
  /** Compact mode renders smaller text (for variant rows) */
  compact?: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Click-to-edit HPP field. Shows formatted currency by default; clicking
 * switches to a number input. Saves on blur or Enter. Escape cancels.
 */
export function InlineHppEdit({
  value,
  onSave,
  disabled = false,
  placeholder = "Set HPP",
  label = "HPP",
  compact = false,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    if (disabled) return
    setDraft(value !== null ? String(value) : "")
    setEditing(true)
    // Focus after next render
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function commit() {
    if (!editing) return
    const trimmed = draft.trim()
    let newValue: number | null
    if (trimmed === "") {
      newValue = null
    } else {
      const n = Number(trimmed)
      if (Number.isNaN(n) || n < 0) {
        // Invalid: just cancel
        setEditing(false)
        return
      }
      newValue = n
    }

    // Only fire if actually changed
    if (newValue !== value) {
      onSave(newValue)
    }
    setEditing(false)
  }

  function cancel() {
    setEditing(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancel()
    }
  }

  const textSize = compact ? "text-[10px]" : "text-xs"

  if (editing) {
    return (
      <span className={`inline-flex items-center gap-1 ${textSize}`}>
        {label && <span className="text-gray-400">{label}</span>}
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          onClick={(e) => e.stopPropagation()}
          className={`w-20 px-1 py-0.5 border border-[#EE4D2D] rounded ${textSize} text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]`}
          placeholder="0"
        />
      </span>
    )
  }

  const display = value !== null ? formatCurrency(value) : placeholder
  const textClass =
    value !== null ? "text-gray-600" : "text-gray-400 italic"

  return (
    <span
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      onClick={(e) => {
        if (disabled) return
        e.stopPropagation()
        startEdit()
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          startEdit()
        }
      }}
      className={`inline-flex items-center gap-1 ${textSize} ${textClass} ${
        disabled
          ? ""
          : "cursor-pointer hover:text-[#EE4D2D] hover:underline decoration-dotted"
      }`}
      title={disabled ? undefined : "Klik untuk edit HPP"}
    >
      {label && <span className="text-gray-400">{label}</span>}
      <span>{display}</span>
    </span>
  )
}
