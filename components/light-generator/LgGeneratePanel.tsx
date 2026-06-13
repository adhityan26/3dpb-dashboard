"use client"

import { useState, useTransition } from "react"
import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LgStlViewer } from "./LgStlViewer"

interface LgGeneratePanelProps {
  orderId: string
  config: Record<string, unknown>
  initialStlReady?: boolean
  hasSilhouette?: boolean
}

const PLA_PLUS_DENSITY = 1.24
const STENCIL_SOLID_FRACTION = 0.5

function shapeFactors(flooring: string): { area: number; perim: number } {
  const parts = flooring.split(":")
  const shape = parts[0]
  if ((shape === "rect" || shape === "square") && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const norm = Math.sqrt(rw * rw + rh * rh)
      return { area: 4 * rw * rh / (Math.PI * norm * norm), perim: 2 * (rw + rh) / (Math.PI * norm) }
    }
  }
  if (shape === "square") return { area: 2 / Math.PI, perim: 4 * Math.SQRT2 / (2 * Math.PI) }
  if (shape === "oval" && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const mx = Math.max(rw, rh)
      return { area: (rw * rh) / (mx * mx), perim: 1.0 }
    }
  }
  return { area: 1, perim: 1 }
}

function computeObjectInfo(config: Record<string, unknown>) {
  const outerRadius    = Number(config.outer_radius)     || 0
  const lightZOffset   = Number(config.light_z_offset)   || 0
  const floorHalfSize  = Number(config.floor_half_size)  || 0
  const casingLift     = Number(config.casing_lift)      || 0
  const baseThickness  = Number(config.base_thickness)   || 0
  const shellThickness = Number(config.shell_thickness)  || 3
  const baseRadius     = Number(config.base_radius)      || outerRadius
  const pillarOuterR   = Number(config.pillar_outer_r)   || 5
  const pillarInnerR   = Number(config.pillar_inner_r)   || 3
  const ledSocketH     = Number(config.led_socket_height)|| 0
  const skipPillar     = !!config.skip_led_pillar

  const shellHeightRaw = config.shell_height
  const shellHeightAuto = outerRadius > 0 ? lightZOffset * (floorHalfSize / outerRadius - 1) : 0
  const isAuto = shellHeightRaw == null || shellHeightRaw === "" || Number(shellHeightRaw) === 0
  const shellHeight = isAuto ? shellHeightAuto : Number(shellHeightRaw)
  const totalHeight = casingLift + baseThickness + shellHeight

  const flooring = String(config.flooring_shape ?? "circle").toLowerCase().trim()
  const parts = flooring.split(":")
  const shape = parts[0]
  let shadowDesc = ""
  if (!flooring || flooring === "circle") {
    shadowDesc = `⌀ ${((floorHalfSize * 2) / 10).toFixed(0)} cm`
  } else if ((shape === "rect" || shape === "oval") && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      if (shape === "rect") {
        const norm = Math.sqrt(rw * rw + rh * rh)
        shadowDesc = `${((floorHalfSize * 2 * rw) / norm / 10).toFixed(0)} × ${((floorHalfSize * 2 * rh) / norm / 10).toFixed(0)} cm`
      } else {
        const mx = Math.max(rw, rh)
        shadowDesc = `${((floorHalfSize * 2 * rw) / mx / 10).toFixed(0)} × ${((floorHalfSize * 2 * rh) / mx / 10).toFixed(0)} cm`
      }
    }
  } else if (shape === "square") {
    const side = ((floorHalfSize * 2) / Math.SQRT2 / 10).toFixed(0)
    shadowDesc = `${side} × ${side} cm`
  } else {
    shadowDesc = `max ⌀ ${((floorHalfSize * 2) / 10).toFixed(0)} cm`
  }

  let casingDimDesc = ""
  if (!flooring || flooring === "circle") {
    casingDimDesc = `⌀ ${(outerRadius * 2).toFixed(0)} mm`
  } else if ((shape === "rect" || shape === "square") && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const norm = Math.sqrt(rw * rw + rh * rh)
      casingDimDesc = `${((outerRadius * 2 * rw) / norm).toFixed(0)} × ${((outerRadius * 2 * rh) / norm).toFixed(0)} mm`
    }
  } else if (shape === "oval" && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const mx = Math.max(rw, rh)
      casingDimDesc = `${((outerRadius * 2 * rw) / mx).toFixed(0)} × ${((outerRadius * 2 * rh) / mx).toFixed(0)} mm`
    }
  } else {
    casingDimDesc = `⌀ ${(outerRadius * 2).toFixed(0)} mm`
  }

  const sf = shapeFactors(flooring)
  const baseVolMm3  = Math.PI * baseRadius * baseRadius * baseThickness * sf.area
  const wallPerimMm = 2 * Math.PI * outerRadius * sf.perim
  const wallVolMm3  = wallPerimMm * shellThickness * shellHeight * STENCIL_SOLID_FRACTION
  const pillarVolMm3 = skipPillar ? 0 : Math.PI * (pillarOuterR ** 2 - pillarInnerR ** 2) * (shellHeight + ledSocketH)
  const filamentG   = Math.round((baseVolMm3 + wallVolMm3 + pillarVolMm3) / 1000 * PLA_PLUS_DENSITY)

  return {
    casingDimDesc,
    shellHeight: shellHeight.toFixed(1),
    isAuto,
    totalHeight: totalHeight.toFixed(1),
    lightZAbsolute: (casingLift + baseThickness + shellHeight + lightZOffset).toFixed(1),
    lightZOffset: lightZOffset.toFixed(1),
    shadowDesc,
    filamentG,
  }
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
