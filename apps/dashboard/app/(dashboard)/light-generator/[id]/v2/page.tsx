"use client"

import { use, useEffect, useState } from "react"
import { PageShell } from "@/components/layout/PageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLgOrder, useUpdateLgOrder, useGenerateLgStl } from "@/lib/hooks/use-light-generator"
import { useLgAutosave } from "@/lib/hooks/use-lg-autosave"
import { useLgPreview } from "@/lib/hooks/use-lg-preview"
import { hashLgConfig } from "@/lib/light-generator/config-hash"
import { computeObjectInfo } from "@/lib/light-generator/estimate"
import { LgInspector } from "@/components/light-generator/editor-v2/LgInspector"
import { LgCanvas2D } from "@/components/light-generator/editor-v2/LgCanvas2D"
import { LgEditorShell, type LgEditorTab } from "@/components/light-generator/editor-v2/LgEditorShell"
import { LgImageSlot } from "@/components/light-generator/LgImageSlot"

const STATUS_FLOW = ["submitted", "paid", "generating", "ready", "shipped", "cancelled"] as const

export default function LgOrderEditorV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading, refetch } = useLgOrder(id)
  const updateOrder = useUpdateLgOrder(id)
  const generateStl = useGenerateLgStl(id)
  const autosave = useLgAutosave(id)
  const preview = useLgPreview(id)

  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = useState<LgEditorTab>("shadow")
  const [feedback, setFeedback] = useState<string | null>(null)

  // Merge customer + operator config once the order loads, and fire the
  // first preview request so the canvas isn't empty on load.
  useEffect(() => {
    if (!order || config !== null) return
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
    await autosave.flush()
    if (autosave.status === "error") {
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

  return (
    <PageShell title={`${order.id} · editor v2`}>
      <LgEditorShell
        orderId={order.id}
        customerName={order.customerName}
        status={order.status}
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
            <LgCanvas2D pngUrl={preview.pngUrl} loading={preview.status === "loading"} />
          ) : (
            <Card>
              <CardHeader><CardTitle>{activeTab === "wall" ? "Wall (θ,z)" : "3D"}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Segera — increment berikutnya
              </CardContent>
            </Card>
          )
        }
        inspector={<LgInspector config={effectiveConfig} onChange={handleConfigChange} />}
        rail={
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p><span className="text-muted-foreground">Name:</span> {order.customerName}</p>
                <p><span className="text-muted-foreground">Contact:</span> {order.customerContact}</p>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-2">
              <LgImageSlot orderId={id} label="Silhouette" type="silhouette" hasImage={!!order.imagePath} />
              <LgImageSlot orderId={id} label="Floor Insert" type="additional" hasImage={!!order.additionalImagePath} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select value={order.status} onValueChange={(v) => { if (v) handleStatusChange(v) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FLOW.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />
    </PageShell>
  )
}
