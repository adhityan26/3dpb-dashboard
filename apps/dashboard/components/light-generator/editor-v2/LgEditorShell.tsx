import type { ReactNode } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "outline",
  paid: "secondary",
  generating: "secondary",
  ready: "default",
  shipped: "default",
  cancelled: "destructive",
}

export type LgEditorTab = "shadow" | "wall" | "3d"

export interface LgEditorShellProps {
  orderId: string
  customerName: string
  status: string
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

const TABS: { value: LgEditorTab; label: string }[] = [
  { value: "shadow", label: "Shadow" },
  { value: "wall", label: "Wall (θ,z)" },
  { value: "3d", label: "3D" },
]

function saveStatusLabel(status: LgEditorShellProps["saveStatus"], savedAt: Date | null): string {
  if (status === "saving") return "Saving…"
  if (status === "saved") {
    const hhmm = savedAt
      ? `${String(savedAt.getHours()).padStart(2, "0")}:${String(savedAt.getMinutes()).padStart(2, "0")}`
      : null
    return hhmm ? `Saved ${hhmm}` : "Saved"
  }
  if (status === "error") return "Save failed"
  return "Idle"
}

/**
 * Presentational shell for the LG editor v2 page — pure props in, no fetching.
 * Layout: top bar, 3-column grid (rail | canvas+tabs | inspector), status strip.
 */
export function LgEditorShell({
  orderId,
  customerName,
  status,
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
  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/light-generator/${orderId}`} className="text-xs text-muted-foreground underline">
          ← v1
        </Link>
        <h1 className="text-lg font-semibold tracking-wide font-mono">{orderId}</h1>
        <span className="text-sm text-muted-foreground">{customerName}</span>
        <Badge variant={STATUS_VARIANT[status] ?? "outline"} className="capitalize">
          {status}
        </Badge>
        <span className="text-xs text-muted-foreground">{saveStatusLabel(saveStatus, savedAt)}</span>
        <div className="ml-auto flex items-center gap-2">
          {isStale && <Badge variant="destructive">STL stale</Badge>}
          <Button size="sm" disabled={generating} onClick={onGenerate}>
            {generating ? "Generating…" : "Generate STL"}
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {feedback}
        </div>
      )}

      {/* Main grid: rail | center (tabs + canvas) | inspector */}
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
        <div>{rail}</div>
        <div className="space-y-3">
          <div className="flex gap-1 border-b">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTabChange(tab.value)}
                className={`px-3 py-1.5 text-sm ${
                  activeTab === tab.value
                    ? "border-b-2 border-primary font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div>{canvas}</div>
        </div>
        <div>{inspector}</div>
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
