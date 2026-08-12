"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { shouldWarnJsonApply } from "./filter-params"

interface LgJsonEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: Record<string, unknown>
  onApply: (next: Record<string, unknown>) => void
}

/**
 * Raw JSON editing, moved out of the always-visible accordion into an
 * on-demand Dialog (2026-08-12 polish addendum item 7).
 *
 * Implementation note: this was originally built on vanilla-jsoneditor
 * (tree + text modes), but its dynamic-import chunk never resolves under
 * Next 16's Turbopack dev server (silent hang, no rejection) — so per the
 * planned fallback it uses a monospace textarea with live JSON validation
 * instead. Same guard semantics as the old inline editor: Apply is blocked
 * with a warning (then allowed on a second click) if the config changed
 * elsewhere while this dialog was open (shouldWarnJsonApply).
 */
export function LgJsonEditorDialog({ open, onOpenChange, config, onApply }: LgJsonEditorDialogProps) {
  const openSnapshot = useRef<string | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  // Seed the draft each time the dialog opens; while open, the draft is the
  // user's — external config changes don't clobber it (the snapshot guard
  // warns on Apply instead).
  useEffect(() => {
    if (!open) return
    openSnapshot.current = JSON.stringify(config)
    setDraft(JSON.stringify(config, null, 2))
    setError(null)
    setConfirmOverwrite(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function validate(text: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(text)
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("JSON must be an object { … }")
        return null
      }
      setError(null)
      return parsed as Record<string, unknown>
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  function handleApply() {
    const incoming = validate(draft)
    if (!incoming) return
    if (
      !confirmOverwrite &&
      shouldWarnJsonApply(openSnapshot.current, JSON.stringify(config))
    ) {
      setError(
        "Config changed elsewhere while this dialog was open — Apply again to overwrite, or Cancel to keep those changes.",
      )
      setConfirmOverwrite(true)
      return
    }
    onApply({ ...config, ...incoming })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border/50 pb-2">
          <DialogTitle>Edit raw JSON</DialogTitle>
        </DialogHeader>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.currentTarget.value)
            setError(null)
            setConfirmOverwrite(false)
          }}
          spellCheck={false}
          rows={22}
          aria-label="Raw config JSON"
          className="scrollbar-slim w-full resize-y rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-ring"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
