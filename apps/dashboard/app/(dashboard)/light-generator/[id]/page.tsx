"use client"

import { use, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { PageShell } from "@/components/layout/PageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLgOrder, useUpdateLgOrder, useGenerateLgStl } from "@/lib/hooks/use-light-generator"
import { useLgAutosave } from "@/lib/hooks/use-lg-autosave"
import { useLgPreview } from "@/lib/hooks/use-lg-preview"
import { hashLgConfig } from "@/lib/light-generator/config-hash"
import { computeObjectInfo } from "@/lib/light-generator/estimate"
import { LgInspector } from "@/components/light-generator/editor-v2/LgInspector"
import { LgCanvas2D } from "@/components/light-generator/editor-v2/LgCanvas2D"
import { LgWallCanvas } from "@/components/light-generator/editor-v2/LgWallCanvas"
import { LgEditorShell, type LgEditorTab } from "@/components/light-generator/editor-v2/LgEditorShell"
import { LgImageSlot } from "@/components/light-generator/LgImageSlot"

// r3f's Canvas depends on WebGL/browser APIs unavailable during SSR — load
// it client-only, mirroring the pattern next/dynamic's docs recommend for
// "External libraries [that] can be loaded on demand" relying on `window`.
const Lg3DViewer = dynamic(() => import("@/components/light-generator/editor-v2/Lg3DViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[52vh] min-h-[380px] w-full items-center justify-center rounded-lg border bg-[#111827] text-sm text-slate-400">
      Memuat 3D…
    </div>
  ),
})

const STATUS_FLOW = ["submitted", "paid", "generating", "ready", "shipped", "cancelled"] as const

export default function LgOrderEditorV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading, refetch } = useLgOrder(id)
  const updateOrder = useUpdateLgOrder(id)
  const generateStl = useGenerateLgStl(id)
  const autosave = useLgAutosave(id)
  const preview = useLgPreview(id)
  // Separate preview runner for the Wall tab — same debounced pipeline, but
  // requesting preview_view: "wall" so the server returns the (theta,z)
  // unwrap PNG instead of the floor-projected shadow. Kept as its own hook
  // instance (own pngUrl/status/latency state) so switching tabs doesn't
  // clobber the Shadow tab's preview, and only fired while the Wall tab is
  // active to avoid doubling every preview request.
  const wallPreview = useLgPreview(id)

  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = useState<LgEditorTab>("shadow")
  const [feedback, setFeedback] = useState<string | null>(null)

  // Merge customer + operator config once the order loads, and fire the
  // first preview request so the canvas isn't empty on load.
  //
  // Root cause of the "initial preview never fires" bug: the previous guard
  // was `config !== null`, i.e. state read from the render closure. React
  // can invoke an effect body more than once for the same commit (dev
  // StrictMode double-invoke) while the `setConfig` from the first
  // invocation hasn't flowed through a re-render yet — both invocations see
  // the same stale `config === null` closure, so a second, redundant
  // request() call resets the runner's debounce timer. Worse, if the very
  // first preview request happened to fail, nothing distinguished "still
  // idle" from "already tried and errored" (see LgCanvas2D's error/onRetry
  // props below), so a failed initial fetch looked identical to "never
  // fired" from the user's point of view. Fixed by (a) guarding fire-once
  // with a ref instead of state — refs are stable across StrictMode's
  // double-invoke and updated synchronously, so the guard can't race a
  // pending re-render — and (b) surfacing preview.status === "error"
  // explicitly with a retry affordance instead of silently falling back to
  // the generic empty-state text.
  const firedInitialPreview = useRef(false)
  useEffect(() => {
    if (!order || firedInitialPreview.current) return
    firedInitialPreview.current = true
    const customerConfig = (() => { try { return JSON.parse(order.configJson) } catch { return {} } })()
    const operatorConfig = (() => {
      if (!order.configJsonOperator) return null
      try { return JSON.parse(order.configJsonOperator) } catch { return null }
    })()
    const merged = { ...customerConfig, ...(operatorConfig ?? {}) }
    setConfig(merged)
    preview.request(merged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  // Fire the Wall tab's own preview request whenever it's active and the
  // config changes — mirrors the Shadow tab's request-on-change, just scoped
  // to preview_view: "wall" and gated so it never fires while on another tab
  // (config edits made elsewhere shouldn't burn a second preview render).
  useEffect(() => {
    if (activeTab !== "wall" || !config) return
    wallPreview.request({ ...config, preview_view: "wall" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, config])

  if (isLoading || !order) {
    return (
      <PageShell title="Light generator editor">
        <div className="py-12 text-center text-muted-foreground">Memuat...</div>
      </PageShell>
    )
  }

  const effectiveConfig = config ?? {}

  function handleConfigChange(next: Record<string, unknown>) {
    setConfig(next)
    autosave.push(next)
    preview.request(next)
  }

  const isStale = order.generatedConfigHash != null
    ? hashLgConfig(effectiveConfig) !== order.generatedConfigHash
    : !!order.stlPath

  const estimateRaw = config ? computeObjectInfo(config) : null
  const estimate = estimateRaw
    ? { weight: `${estimateRaw.filamentG} g`, height: `${Math.round(Number(estimateRaw.totalHeight))} mm` }
    : null

  async function handleGenerate() {
    // Server hashes the SAVED config (configJsonOperator), so saved must
    // equal hashed at generate time. On a v1-era order the page can be
    // opened with zero edits — no push ever happened, so `flush()` alone has
    // nothing pending and configJsonOperator can still be stale/null,
    // producing a permanent stale badge after generate. Pushing the current
    // merged config right before flushing guarantees there is always a
    // pending save that matches exactly what the client hashes; push+flush
    // collapses to a single immediate PATCH (push sets `pending`, flush
    // cancels the debounce timer and runs immediately).
    autosave.push(effectiveConfig)
    // Read the resolved status from flush()'s return value, not React state
    // (`autosave.status`) — React state is a snapshot from the last render
    // and does not reflect the outcome of the flush that just completed.
    const saveStatus = await autosave.flush()
    if (saveStatus === "error") {
      setFeedback("Gagal menyimpan config — perbaiki dulu sebelum generate")
      return
    }
    setFeedback(null)
    await generateStl.mutateAsync()
    await refetch()
  }

  function handleStatusChange(newStatus: string) {
    updateOrder.mutate({ status: newStatus })
  }

  const previewError = preview.status === "error"
  const retryPreview = () => preview.request(effectiveConfig)

  return (
    <PageShell title={`${order.id} · editor`} wide>
      <LgEditorShell
        orderId={order.id}
        customerName={order.customerName}
        status={order.status}
        statusOptions={STATUS_FLOW}
        onStatusChange={handleStatusChange}
        saveStatus={autosave.status}
        savedAt={autosave.savedAt}
        isStale={isStale}
        estimate={estimate}
        preview={{ latencyMs: preview.latencyMs, islands: preview.islands }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onGenerate={handleGenerate}
        generating={generateStl.isPending}
        feedback={feedback}
        canvas={
          activeTab === "shadow" ? (
            <div className="space-y-3">
              {/* Canvas Editor — dominant, always-on overlays/handles, no
                  Edit toggle (user feedback: "ada 2 canvas, editor dan
                  shadow preview" — one card per role instead of a mode
                  switch on a single canvas). No Card/CardHeader chrome per
                  the mockup — the canvas already has its own rounded border,
                  and it sits directly in the (already-bordered) center
                  panel. */}
              <LgCanvas2D
                pngUrl={preview.pngUrl}
                originalImageUrl={`/api/light-generator/orders/${order.id}/silhouette`}
                flooringImageUrl={
                  order.additionalImagePath
                    ? `/api/light-generator/orders/${order.id}/additional`
                    : undefined
                }
                loading={preview.status === "loading"}
                config={effectiveConfig}
                onConfigChange={handleConfigChange}
                dimBackdrop
                heightClass="h-[52vh] min-h-[380px]"
                error={previewError}
                onRetry={retryPreview}
              />
              {/* Shadow preview — clean render of the same pngUrl, no
                  overlays, no pointer handlers. Wrapped in a Card (unlike the
                  bare editor canvas above) so it reads as its own panel with
                  a titled header. */}
              <Card>
                <CardHeader className="border-b border-border/50 py-2">
                  <CardTitle className="text-sm">Shadow preview</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <LgCanvas2D
                    pngUrl={preview.pngUrl}
                    loading={preview.status === "loading"}
                    readOnly
                    heightClass="h-[34vh] min-h-[220px]"
                    error={previewError}
                    onRetry={retryPreview}
                  />
                </CardContent>
              </Card>
            </div>
          ) : activeTab === "wall" ? (
            <Card>
              <CardHeader className="border-b border-border/50 py-2">
                <CardTitle className="text-sm">Wall (θ,z)</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <LgWallCanvas
                  pngUrl={wallPreview.pngUrl}
                  loading={wallPreview.status === "loading"}
                  config={effectiveConfig}
                  onConfigChange={handleConfigChange}
                  islands={preview.islands?.list ?? []}
                  error={wallPreview.status === "error"}
                  onRetry={() => wallPreview.request({ ...effectiveConfig, preview_view: "wall" })}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="border-b border-border/50 py-2">
                <CardTitle className="text-sm">3D</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <Lg3DViewer
                  stlUrl={order.stlPath
                    // Cache-buster: the /stl URL is constant, so key it by the
                    // generate-time config hash — a regenerate forces a fresh
                    // download instead of the browser serving the stale model.
                    ? `/api/light-generator/orders/${order.id}/stl?v=${order.generatedConfigHash ?? "0"}`
                    : null}
                  config={effectiveConfig}
                  stale={isStale}
                />
              </CardContent>
            </Card>
          )
        }
        inspector={
          <LgInspector
            config={effectiveConfig}
            onChange={handleConfigChange}
            orderId={order.id}
            hasFlooringImage={!!order.additionalImagePath}
            activeStep={activeTab}
          />
        }
        rail={
          <div className="space-y-4">
            {/* Rail already sits inside the bordered panel from
                LgEditorShell, so these read as subtle cards — faint bg +
                border, not the full elevated Card look — while keeping
                comfortable inner padding. */}
            <Card className="border-border/60 bg-card/50 shadow-none">
              <CardHeader className="border-b border-border/50 pb-3"><CardTitle className="text-sm">Project assets</CardTitle></CardHeader>
              <CardContent className="p-4">
                {/* Stacked vertically (not a 2-col grid) — the 240px rail
                    doesn't have room for two Download/Replace button pairs
                    side by side without them colliding/overflowing the card
                    padding. v1's LgImageSlot is unchanged; this is v2-rail-only. */}
                <div className="grid grid-cols-1 gap-4">
                  <LgImageSlot orderId={id} label="Silhouette" type="silhouette" hasImage={!!order.imagePath} />
                  <LgImageSlot orderId={id} label="Floor Insert" type="additional" hasImage={!!order.additionalImagePath} />
                </div>
              </CardContent>
            </Card>
            {/* Production summary — all rows the old v1 Object card showed,
                fed by the shared computeObjectInfo (live, updates with every
                edit). Plain label:value rows separated by thin dividers,
                matching the mockup instead of a headline-stat layout. */}
            {estimateRaw && (
              <Card className="border-border/60 bg-card/50 shadow-none">
                <CardHeader className="border-b border-border/50 pb-3"><CardTitle className="text-sm">Production summary</CardTitle></CardHeader>
                <CardContent className="p-4 text-xs">
                  {/* Clean two-column table: label left (muted), value right
                      (tabular-nums, right-aligned), consistent row height,
                      thin dividers between rows, full-width footnote. */}
                  <table className="w-full border-collapse">
                    <tbody className="divide-y divide-border/50">
                      <tr className="[&>td]:py-1.5">
                        <td className="text-muted-foreground">Casing footprint</td>
                        <td className="text-right font-medium tabular-nums">{estimateRaw.casingDimDesc}</td>
                      </tr>
                      <tr className="[&>td]:py-1.5">
                        <td className="text-muted-foreground">Shell height</td>
                        <td className="text-right font-medium tabular-nums">
                          {estimateRaw.shellHeight} mm{estimateRaw.isAuto ? " (auto)" : ""}
                        </td>
                      </tr>
                      <tr className="[&>td]:py-1.5">
                        <td className="text-muted-foreground">Total print height</td>
                        <td className="text-right font-medium tabular-nums">{estimateRaw.totalHeight} mm</td>
                      </tr>
                      <tr className="[&>td]:py-1.5">
                        {/* Full "above wall" detail moved to a tooltip on the
                            label so the value column stays short and doesn't
                            collide/wrap awkwardly. */}
                        <td className="text-muted-foreground">
                          <span title="Height of the light socket above the wall/shell base">Light Z offset</span>
                        </td>
                        <td className="text-right font-medium tabular-nums">{estimateRaw.lightZOffset} mm</td>
                      </tr>
                      <tr className="[&>td]:py-1.5">
                        <td className="text-muted-foreground">Light Z from floor</td>
                        <td className="text-right font-medium tabular-nums">{estimateRaw.lightZAbsolute} mm</td>
                      </tr>
                      <tr className="[&>td]:py-1.5">
                        <td className="text-muted-foreground">Shadow floor size</td>
                        <td className="text-right font-medium tabular-nums">{estimateRaw.shadowDesc}</td>
                      </tr>
                      <tr className="[&>td]:py-1.5">
                        <td className="text-muted-foreground">PLA+ estimate</td>
                        <td className="text-right font-medium tabular-nums">~{estimateRaw.filamentG} g</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="pt-1.5 text-[11px] text-muted-foreground/70">
                    50% wall fill assumed — actual varies by silhouette
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        }
      />
    </PageShell>
  )
}
