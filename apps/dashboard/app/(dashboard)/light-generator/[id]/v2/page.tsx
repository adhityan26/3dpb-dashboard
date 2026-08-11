"use client"

import { use, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Circle, Ruler, Package, Sun } from "lucide-react"
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
      <PageShell title="Light generator editor v2">
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
    <PageShell title={`${order.id} · editor v2`} wide>
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
                  switch on a single canvas). */}
              <Card>
                <CardHeader className="py-2">
                  <CardTitle className="text-sm">Editor</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
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
                </CardContent>
              </Card>
              {/* Shadow preview — clean render of the same pngUrl, no
                  overlays, no pointer handlers. */}
              <Card>
                <CardHeader className="py-2">
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
              <CardHeader className="py-2">
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
              <CardHeader className="py-2">
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
            <Card>
              <CardHeader><CardTitle className="text-sm">Project assets</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <LgImageSlot orderId={id} label="Silhouette" type="silhouette" hasImage={!!order.imagePath} />
                  <LgImageSlot orderId={id} label="Floor Insert" type="additional" hasImage={!!order.additionalImagePath} />
                </div>
              </CardContent>
            </Card>
            {/* Production summary — same numbers v1's LgGeneratePanel shows,
                fed by the shared computeObjectInfo (live, updates with every
                edit), condensed to the 4 headline stats per the polish
                addendum. Full detail (light offsets, auto shell height) is
                available via the ⓘ tooltip on each row. */}
            {estimateRaw && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Production summary</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div
                    className="flex items-center gap-2"
                    title={`Casing shape: ${estimateRaw.casingDimDesc}`}
                  >
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Footprint:</span>
                    <span className="ml-auto font-medium">{estimateRaw.casingDimDesc}</span>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    title={`Shell height ${estimateRaw.shellHeight} mm${estimateRaw.isAuto ? " (auto)" : ""} · light ${estimateRaw.lightZOffset} mm above wall (${estimateRaw.lightZAbsolute} mm from floor)`}
                  >
                    <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Print height:</span>
                    <span className="ml-auto font-medium">{estimateRaw.totalHeight} mm</span>
                  </div>
                  <div className="flex items-center gap-2" title="50% wall fill assumed — actual varies by silhouette">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Material:</span>
                    <span className="ml-auto font-medium">~{estimateRaw.filamentG} g</span>
                  </div>
                  <div className="flex items-center gap-2" title="Shadow projection floor size">
                    <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Shadow floor:</span>
                    <span className="ml-auto font-medium">{estimateRaw.shadowDesc}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        }
      />
    </PageShell>
  )
}
