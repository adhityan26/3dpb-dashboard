"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useUpdateWorkingProject, type WorkingProjectUpdatePatch } from "@/lib/hooks/use-working-projects"
import { WORKING_PROJECT_STATUSES } from "@/lib/working-projects/format"

// Shared by the Orders and GL Ring tabs so both render statuses identically.
export const STATUS_COLOR: Record<string, string> = {
  Open: "dark:bg-blue-900/40 dark:text-blue-300 bg-blue-100 text-blue-800",
  Proses: "dark:bg-amber-900/40 dark:text-amber-300 bg-amber-100 text-amber-800",
  "Waiting Customer": "dark:bg-orange-900/40 dark:text-orange-300 bg-orange-100 text-orange-800",
  "Siap Kirim": "dark:bg-purple-900/40 dark:text-purple-300 bg-purple-100 text-purple-800",
  Done: "dark:bg-green-900/40 dark:text-green-300 bg-green-100 text-green-800",
  Canceled: "dark:bg-red-900/40 dark:text-red-300 bg-red-100 text-red-800",
}

// Inline (no popup) updates for a list row. Status flips optimistically —
// the override is dropped once the mutation (which awaits the list refetch)
// settles, and reverted on failure. Any failure surfaces in `error` for the
// tab to render as a banner.
export function useInlineWorkingProjectUpdate() {
  const mutation = useUpdateWorkingProject()
  const [error, setError] = useState<string | null>(null)
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({})

  async function save(id: string, patch: WorkingProjectUpdatePatch, what: string): Promise<boolean> {
    setError(null)
    try {
      await mutation.mutateAsync({ id, patch })
      return true
    } catch (err) {
      setError(`Gagal menyimpan ${what}: ${(err as Error).message}`)
      return false
    }
  }

  async function setStatus(id: string, status: string) {
    setStatusOverride((prev) => ({ ...prev, [id]: status }))
    await save(id, { status }, "status")
    setStatusOverride((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  return { save, setStatus, statusOverride, error, clearError: () => setError(null) }
}

export function WorkingProjectStatusSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (status: string) => void
}) {
  const options: readonly string[] = WORKING_PROJECT_STATUSES.includes(value as never)
    ? WORKING_PROJECT_STATUSES
    : [value, ...WORKING_PROJECT_STATUSES]
  return (
    <select
      aria-label="Status"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer border-0 ${STATUS_COLOR[value] ?? ""}`}
    >
      {options.map((s) => (
        <option key={s} value={s} className="g-t1" style={{ background: "var(--g-modal)" }}>
          {s}
        </option>
      ))}
    </select>
  )
}

// Click-to-edit cell. Enter or blur commits (only if the value changed),
// Escape cancels. `display` is what shows while not editing.
export function InlineEditCell({
  value,
  display,
  onSave,
  label,
  type = "text",
  className = "",
}: {
  value: string
  display?: ReactNode
  onSave: (next: string) => Promise<unknown> | void
  label: string
  type?: "text" | "date" | "numeric"
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  // `settled` guards against Enter/Escape and the blur that follows them (or
  // the input unmounting) each committing the same edit twice.
  const settled = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function start() {
    settled.current = false
    setDraft(value)
    setEditing(true)
  }

  function finish(save: boolean) {
    if (settled.current) return
    settled.current = true
    setEditing(false)
    const next = draft.trim()
    if (save && next !== value.trim()) void onSave(next)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        title={`Klik untuk ganti ${label}`}
        aria-label={`Ganti ${label}`}
        className={`text-left w-full rounded-[4px] px-1 -mx-1 hover:bg-white/10 cursor-text ${className}`}
      >
        {display ?? (value || "-")}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type={type === "date" ? "date" : "text"}
      inputMode={type === "numeric" ? "numeric" : undefined}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true)
        if (e.key === "Escape") finish(false)
      }}
      className="glass-input h-8 w-full min-w-[110px] rounded-[5px] px-2 text-sm"
    />
  )
}
