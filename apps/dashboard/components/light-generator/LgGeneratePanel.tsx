"use client"

import { useState, useTransition } from "react"
import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LgStlViewer } from "./LgStlViewer"
import { computeObjectInfo } from "@/lib/light-generator/estimate"

interface LgGeneratePanelProps {
  orderId: string
  config: Record<string, unknown>
  initialStlReady?: boolean
  hasSilhouette?: boolean
}

export function LgGeneratePanel({ orderId, config, initialStlReady, hasSilhouette = true }: LgGeneratePanelProps) {
  const [isPending, startTransition] = useTransition()
  const [stlGeneration, setStlGeneration] = useState(0)
  const [stlReady, setStlReady] = useState(!!initialStlReady)
  const [shadowPreviewUrl, setShadowPreviewUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const stlDownloadUrl = `/api/light-generator/orders/${orderId}/stl?v=${stlGeneration}`

  async function saveConfig(): Promise<boolean> {
    const res = await fetch(`/api/light-generator/orders/${orderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ configJsonOperator: JSON.stringify(config) }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setFeedback("❌ " + (body.error ?? res.statusText))
      return false
    }
    return true
  }

  function handleGenerateStl() {
    setFeedback("⏳ Saving config + generating STL...")
    startTransition(async () => {
      try {
        if (!(await saveConfig())) { setFeedback("❌ Gagal menyimpan config"); return }
        const res = await fetch(`/api/light-generator/orders/${orderId}/generate`, { method: "POST" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setFeedback("❌ Generate failed: " + (body.error ?? body.detail ?? res.statusText))
          return
        }
        setStlReady(true)
        setStlGeneration((n) => n + 1)
        setFeedback("✅ STL generated successfully")
      } catch (err) {
        setFeedback("❌ Generate failed: " + String(err))
      }
    })
  }

  function handleShadowPreview() {
    setFeedback("⏳ Saving config + rendering preview...")
    startTransition(async () => {
      try {
        if (!(await saveConfig())) { setFeedback("❌ Gagal menyimpan config"); return }
        const res = await fetch(`/api/light-generator/orders/${orderId}/preview`, { method: "POST" })
        if (!res.ok) { setFeedback("❌ Shadow preview failed"); return }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setShadowPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
        setFeedback("✅ Shadow preview rendered")
      } catch (err) {
        setFeedback("❌ Shadow preview failed: " + String(err))
      }
    })
  }

  const info = computeObjectInfo(config)

  return (
    <Card>
      <CardHeader><CardTitle>Generate</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
          <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px] pb-1">Object</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Casing footprint</span>
            <span className="font-mono">{info.casingDimDesc}</span>
            <span className="text-muted-foreground">Shell height</span>
            <span className="font-mono">{info.shellHeight} mm{info.isAuto && <span className="text-muted-foreground ml-1">(auto)</span>}</span>
            <span className="text-muted-foreground">Total print height</span>
            <span className="font-mono">{info.totalHeight} mm</span>
            <span className="text-muted-foreground">Light Z offset</span>
            <span className="font-mono">{info.lightZOffset} mm above wall</span>
            <span className="text-muted-foreground">Light Z from floor</span>
            <span className="font-mono">{info.lightZAbsolute} mm</span>
          </div>
          <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px] pb-1 pt-2">Shadow</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Floor size</span>
            <span className="font-mono">{info.shadowDesc}</span>
          </div>
          <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px] pb-1 pt-2">Material</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">PLA+ estimate</span>
            <span className="font-mono">~{info.filamentG} g</span>
          </div>
          <p className="text-muted-foreground text-[10px] pt-1">50% wall fill assumed — actual varies by silhouette</p>
        </div>

        {feedback && <p className="text-sm">{feedback}</p>}

        {!hasSilhouette && (
          <p className="text-sm text-amber-600">Upload silhouette dulu sebelum generate.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleGenerateStl} disabled={isPending || !hasSilhouette}>
            {isPending ? "Working..." : "Generate STL"}
          </Button>
          <Button variant="outline" onClick={handleShadowPreview} disabled={isPending || !hasSilhouette}>
            <Eye className="size-4 mr-1" />
            Shadow Preview
          </Button>
          {stlReady && (
            <a href={`/api/light-generator/orders/${orderId}/stl`} download>
              <Button variant="outline" size="sm">
                <Download className="size-4 mr-1" />
                Download STL
              </Button>
            </a>
          )}
        </div>

        {stlReady && <LgStlViewer stlUrl={stlDownloadUrl} height={300} />}

        {shadowPreviewUrl && (
          <div className="rounded-lg border bg-muted/30 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shadowPreviewUrl} alt="Shadow preview" className="w-full h-auto rounded" />
            <p className="text-muted-foreground mt-1 text-center text-xs">Cyan = casing outline</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
