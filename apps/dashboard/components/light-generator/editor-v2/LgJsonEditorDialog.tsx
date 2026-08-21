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
 * Uses vanilla-jsoneditor's STANDALONE build (tree + text modes) — the
 * package's main `index.js` entry never resolves as a dynamic-import chunk
 * under Next 16's Turbopack dev server (silent hang, no rejection), but the
 * self-contained `standalone.js` build bundles fine. A validated textarea
 * remains as runtime fallback if the editor fails to load. Same guard
 * semantics as the old inline editor: Apply is blocked with a warning (then
 * allowed on a second click) if the config changed elsewhere while this
 * dialog was open (shouldWarnJsonApply).
 */
type JsonEditorInstance = {
  get: () => { json?: unknown; text?: string }
  destroy: () => Promise<void> | void
}
export function LgJsonEditorDialog({ open, onOpenChange, config, onApply }: LgJsonEditorDialogProps) {
  const openSnapshot = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<JsonEditorInstance | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  // null = still loading the editor lib; false = loaded OK; true = fallback textarea
  const [useFallback, setUseFallback] = useState<boolean | null>(null)

  // Seed state each time the dialog opens; while open, the draft/editor is
  // the user's — external config changes don't clobber it (the snapshot
  // guard warns on Apply instead).
  useEffect(() => {
    if (!open) return
    openSnapshot.current = JSON.stringify(config)
    setDraft(JSON.stringify(config, null, 2))
    setError(null)
    setConfirmOverwrite(false)
    setUseFallback(null)

    let cancelled = false
    let instance: JsonEditorInstance | null = null
    import("vanilla-jsoneditor/standalone.js")
      .then((mod) => {
        // Dialog content mounts via a portal AFTER `open` flips — retry on
        // animation frames until the container exists (or dialog closed).
        const tryCreate = () => {
          if (cancelled) return
          if (!containerRef.current) {
            requestAnimationFrame(tryCreate)
            return
          }
          instance = mod.createJSONEditor({
            target: containerRef.current,
            props: { content: { json: config } },
          }) as unknown as JsonEditorInstance
          editorRef.current = instance
          setUseFallback(false)
        }
        tryCreate()
      })
      .catch((err) => {
        console.error("[LgJsonEditorDialog] standalone editor failed to load, using textarea:", err)
        if (!cancelled) setUseFallback(true)
      })
    return () => {
      cancelled = true
      void instance?.destroy()
      editorRef.current = null
    }
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
    // Prefer the live editor's content when mounted; fall back to the draft.
    let source = draft
    if (editorRef.current) {
      try {
        const content = editorRef.current.get()
        source = content.text ?? JSON.stringify(content.json ?? {})
      } catch (err) {
        setError(`Editor error: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
    }
    const incoming = validate(source)
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
        {/* jse-theme-dark: match the dashboard's dark UI */}
        <div
          ref={containerRef}
          className={`jse-theme-dark max-h-[60vh] overflow-hidden rounded-md border ${useFallback === false ? "" : "hidden"}`}
        />
        {useFallback !== false && (
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
        )}
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
