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
// vanilla-jsoneditor ships its default theme as inline/adopted stylesheets
// inside index.js itself — there is no separate default-theme .css file to
// import (only an optional jse-theme-dark.css override, unused here).

// vanilla-jsoneditor's JSONEditor touches `document` at import time, so it
// must never be pulled into the SSR bundle. Loaded client-only inside a
// useEffect (next/dynamic isn't a good fit here since this isn't a React
// component — it's an imperative widget mounted into a plain div ref).
type JsonEditorInstance = {
  set: (content: { json?: unknown; text?: string }) => void
  get: () => { json?: unknown; text?: string }
  destroy: () => void
  updateProps: (props: Record<string, unknown>) => void
}

interface LgJsonEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: Record<string, unknown>
  onApply: (next: Record<string, unknown>) => void
}

/**
 * Raw JSON editing, moved out of the always-visible accordion into an
 * on-demand Dialog (2026-08-12 polish addendum item 7). Uses
 * vanilla-jsoneditor (tree + text modes) instead of a bare textarea.
 * Ports the same shouldWarnJsonApply guard the old inline textarea used —
 * Apply is blocked with a warning (then allowed on a second click) if the
 * config changed elsewhere while this dialog was open.
 */
export function LgJsonEditorDialog({ open, onOpenChange, config, onApply }: LgJsonEditorDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<JsonEditorInstance | null>(null)
  const openSnapshot = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  useEffect(() => {
    if (!open || !containerRef.current) return
    let cancelled = false
    let instance: JsonEditorInstance | null = null
    openSnapshot.current = JSON.stringify(config)
    setError(null)
    setConfirmOverwrite(false)
    import("vanilla-jsoneditor").then(({ createJSONEditor }) => {
      if (cancelled || !containerRef.current) return
      instance = createJSONEditor({
        target: containerRef.current,
        props: { content: { json: config } },
      }) as unknown as JsonEditorInstance
      editorRef.current = instance
    })
    return () => {
      cancelled = true
      instance?.destroy()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleApply() {
    const editor = editorRef.current
    if (!editor) return
    let incoming: unknown
    try {
      const content = editor.get()
      incoming = content.json !== undefined ? content.json : JSON.parse(content.text ?? "{}")
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (incoming === null || typeof incoming !== "object" || Array.isArray(incoming)) {
      setError("JSON must be an object { … }")
      return
    }
    if (!confirmOverwrite && shouldWarnJsonApply(openSnapshot.current, JSON.stringify(config))) {
      setError("Config changed since you opened this dialog — click Apply again to overwrite")
      setConfirmOverwrite(true)
      return
    }
    onApply({ ...config, ...(incoming as Record<string, unknown>) })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit raw JSON</DialogTitle>
        </DialogHeader>
        <div ref={containerRef} className="lg-jsoneditor h-[60vh] min-h-[320px] overflow-hidden rounded-md border" />
        {error && <p className="text-sm text-red-500">❌ {error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply}>
            {confirmOverwrite ? "Apply (overwrite)" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
