import { type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUS_COLOR: Record<string, string> = {
  submitted: "border-slate-400/50 text-slate-300",
  paid: "border-sky-400/50 text-sky-300",
  generating: "border-amber-400/50 text-amber-300",
  ready: "border-emerald-400/50 text-emerald-300",
  shipped: "border-emerald-400/50 text-emerald-300",
  cancelled: "border-red-400/50 text-red-300",
}

export type LgEditorTab = "shadow" | "wall" | "3d"

export interface LgEditorShellProps {
  orderId: string
  customerName: string
  status: string
  statusOptions: readonly string[]
  onStatusChange: (status: string) => void
  saveStatus: "idle" | "saving" | "saved" | "error"
  savedAt: Date | null
  isStale: boolean
  estimate: { weight: string; height: string } | null
  preview: { latencyMs: number | null; islands: { hasFloating: boolean } | null }
  activeTab: LgEditorTab
  onTabChange: (tab: LgEditorTab) => void
  onGenerate: () => void
  generating: boolean
  feedback?: string | null
  inspector: ReactNode
  canvas: ReactNode
  rail: ReactNode
}

const STEPS: { value: LgEditorTab; number: string; label: string }[] = [
  { value: "shadow", number: "①", label: "Shadow" },
  { value: "wall", number: "②", label: "Wall & stems" },
  { value: "3d", number: "③", label: "Preview 3D" },
]

function saveStatusLabel(status: LgEditorShellProps["saveStatus"], savedAt: Date | null): string {
  if (status === "saving") return "Saving…"
  if (status === "saved") {
    const hhmm = savedAt
      ? `${String(savedAt.getHours()).padStart(2, "0")}:${String(savedAt.getMinutes()).padStart(2, "0")}`
      : null
    return hhmm ? `✓ All changes saved (${hhmm})` : "✓ All changes saved"
  }
  if (status === "error") return "Save failed"
  return "No changes yet"
}

/** mm:ss elapsed timer, ticking only while `active`. */
function useElapsed(active: boolean): string {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) {
      setSeconds(0)
      return
    }
    const start = Date.now()
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [active])
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0")
  const ss = String(seconds % 60).padStart(2, "0")
  return `${mm}:${ss}`
}

/**
 * Presentational shell for the LG editor v2 page — pure props in, no fetching.
 * Layout: top bar (breadcrumb + status + save indicator + Preview 3D),
 * 3-column grid (rail | canvas + numbered steps | inspector + validation
 * card), status strip. Generate STL lives ONLY in the validation card below
 * the inspector — see the 2026-08-12 polish addendum in
 * docs/superpowers/specs/2026-08-10-lg-editor-shell-v2-design.md.
 */
export function LgEditorShell({
  orderId,
  customerName,
  status,
  statusOptions,
  onStatusChange,
  saveStatus,
  savedAt,
  isStale,
  estimate,
  preview,
  activeTab,
  onTabChange,
  onGenerate,
  generating,
  feedback,
  inspector,
  canvas,
  rail,
}: LgEditorShellProps) {
  const elapsed = useElapsed(generating)
  const statusColor = STATUS_COLOR[status] ?? "border-muted-foreground/50 text-muted-foreground"

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/light-generator/${orderId}`} className="text-xs text-muted-foreground underline">
          ← v1
        </Link>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>Orders</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-mono font-semibold text-foreground">{orderId}</span>
        </nav>
        <span className="text-sm text-muted-foreground">{customerName}</span>
        <Select value={status} onValueChange={(v) => { if (v) onStatusChange(v) }}>
          <SelectTrigger className={`h-7 w-auto gap-1 border text-xs capitalize ${statusColor}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{saveStatusLabel(saveStatus, savedAt)}</span>
          <Button size="sm" variant="secondary" onClick={() => onTabChange("3d")}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview 3D
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {feedback}
        </div>
      )}

      {/* Main grid: rail | center (steps + canvas) | inspector + validation
          card — canvas column dominates so the Shadow tab has room to
          breathe (user feedback: "pengap"). Rail and right column are sticky
          with their own scrollbar — `top-4` matches the grid's own gap-4
          offset from the top bar above, and `100vh-120px` roughly reserves
          the top bar + status strip + page padding so the sticky column's
          max height doesn't push past the viewport. */}
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px] lg:gap-0 lg:divide-x lg:divide-border/60">
        {/* Three main sections — rail / canvas / inspector — each get the
            bordered studio-panel look from the mockup. */}
        <div className="scrollbar-slim p-3 lg:pr-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
          {rail}
        </div>
        <div className="space-y-3 p-3 lg:px-4">
          {/* Workflow steps — numbered, not plain tabs. */}
          <div className="flex gap-4 border-b pb-2">
            {STEPS.map((step) => {
              const active = activeTab === step.value
              return (
                <button
                  key={step.value}
                  type="button"
                  onClick={() => onTabChange(step.value)}
                  className={`flex items-center gap-2 text-sm ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      active ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {step.number}
                  </span>
                  {step.label}
                </button>
              )
            })}
          </div>
          <div>{canvas}</div>
        </div>
        <div className="scrollbar-slim space-y-3 p-3 lg:pl-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
          {inspector}

          {/* Validation card — the single home for Generate STL (never in
              the top bar) and the stale/ready state explanation. */}
          <div
            className={`rounded-lg border p-3 text-xs ${
              isStale
                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
            }`}
          >
            {isStale ? (
              <>
                <p className="font-medium">Changes not generated yet</p>
                <p className="mt-0.5 text-amber-200/80">
                  Config has changed since the last STL — generate again to match it.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Ready to generate</p>
                <p className="mt-0.5 text-emerald-200/80">Your STL matches the current settings.</p>
              </>
            )}
            <Button size="sm" className="mt-2 w-full" disabled={generating} onClick={onGenerate}>
              {generating ? `Generating… ${elapsed}` : "Generate STL"}
            </Button>
          </div>
        </div>
      </div>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>Latency: {preview.latencyMs != null ? `${preview.latencyMs} ms` : "—"}</span>
        <span>
          Islands: {preview.islands == null ? "—" : preview.islands.hasFloating ? "⚠ floating" : "✓"}
        </span>
        <span>Weight: {estimate?.weight ?? "—"}</span>
        <span>Height: {estimate?.height ?? "—"}</span>
      </div>
    </div>
  )
}
