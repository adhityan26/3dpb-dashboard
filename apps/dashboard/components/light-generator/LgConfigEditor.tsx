"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface LgConfigEditorProps {
  orderId: string
  customerConfig: Record<string, unknown>
  operatorConfig: Record<string, unknown> | null
  onConfigChange?: (config: Record<string, unknown>) => void
  onReset?: () => void
}

interface ParamDef {
  key: string
  label: string
  help: string
  type: "number" | "boolean"
  min?: number
  max?: number
  step?: number
  autoable?: boolean
}

const SHAPE_OPTIONS = [
  { value: "circle",   label: "Circle" },
  { value: "square",   label: "Square" },
  { value: "triangle", label: "Triangle" },
  { value: "rect",     label: "Rectangle" },
  { value: "oval",     label: "Oval" },
]

const SECTIONS: { title: string; params: ParamDef[] }[] = [
  {
    title: "Size / Geometry",
    params: [
      { key: "outer_radius",    label: "Outer radius (mm)",    help: "Radius of the casing wall",                                  type: "number", min: 10,  max: 300,  step: 0.5 },
      { key: "base_radius",     label: "Base radius (mm)",     help: "Radius of the floor plate (ignored for non-circle)",          type: "number", min: 10,  max: 300,  step: 0.5 },
      { key: "shell_height",    label: "Shell height (mm)",    help: "Total height of the stencil wall",                            type: "number", min: 5,   max: 200,  step: 0.5, autoable: true },
      { key: "shell_thickness", label: "Wall thickness (mm)",  help: "Thickness of the perforated wall",                            type: "number", min: 0.5, max: 10,   step: 0.1 },
      { key: "base_thickness",  label: "Base thickness (mm)",  help: "Thickness of the raised floor plate",                         type: "number", min: 0.5, max: 10,   step: 0.1 },
      { key: "casing_lift",     label: "Casing lift (mm)",     help: "Float casing above z=0 for external electronics chamber",     type: "number", min: 0,   max: 100,  step: 0.5 },
    ],
  },
  {
    title: "Shadow / Projection",
    params: [
      { key: "floor_half_size",  label: "Floor half-size (mm)", help: "Half-width of the shadow projection area",          type: "number", min: 50,   max: 2000, step: 5 },
      { key: "shadow_offset_x",  label: "Shadow X offset (mm)", help: "Shift shadow on floor without distortion",          type: "number", min: -500, max: 500,  step: 1 },
      { key: "shadow_offset_y",  label: "Shadow Y offset (mm)", help: "Shift shadow on floor without distortion",          type: "number", min: -500, max: 500,  step: 1 },
    ],
  },
  {
    title: "Light Position",
    params: [
      { key: "light_x",        label: "Light X (mm)",        help: "Moves the light physically — causes distortion", type: "number", min: -50, max: 50, step: 0.5 },
      { key: "light_y",        label: "Light Y (mm)",        help: "Moves the light physically — causes distortion", type: "number", min: -50, max: 50, step: 0.5 },
      { key: "light_z_offset", label: "Light Z offset (mm)", help: "Height above wall top",                          type: "number", min: 0,   max: 50, step: 0.5 },
    ],
  },
  {
    title: "Smoothness",
    params: [
      { key: "edge_smooth_sigma", label: "Smooth sigma (px)", help: "Higher = smoother silhouette edges",     type: "number", min: 0,   max: 30, step: 0.5 },
      { key: "shadow_threshold",  label: "SDF threshold",     help: "+ erodes silhouette, - dilates it",     type: "number", min: -20, max: 20, step: 0.5 },
    ],
  },
  {
    title: "Resolution",
    params: [
      { key: "n_stencil_theta", label: "n_theta (angular)", help: "Angular segments. 2048 recommended", type: "number", min: 64,  max: 8192, step: 64 },
      { key: "n_stencil_z",     label: "n_z (vertical)",    help: "Vertical layers. 64 is sweet spot",  type: "number", min: 8,   max: 1024, step: 8 },
    ],
  },
  {
    title: "LED Pillar",
    params: [
      { key: "pillar_outer_r",   label: "Pillar outer radius (mm)", help: "Outer radius of LED holder tube",  type: "number",  min: 1,   max: 30, step: 0.5 },
      { key: "pillar_inner_r",   label: "Pillar inner radius (mm)", help: "Cable channel radius",              type: "number",  min: 0.5, max: 20, step: 0.5 },
      { key: "led_socket_height",label: "LED socket height (mm)",   help: "Height of LED mount above pillar top", type: "number", min: 0, max: 50, step: 0.5 },
      { key: "skip_led_pillar",  label: "Skip LED pillar",          help: "Omit the pillar entirely",          type: "boolean" },
    ],
  },
  {
    title: "Printability",
    params: [
      { key: "support_stems",  label: "Support stems",            help: "Bridge floating islands to base",                      type: "boolean" },
      { key: "stem_width",     label: "Stem width (columns)",     help: "2 ~ 1mm at r=40mm",                                   type: "number", min: 1, max: 10, step: 1 },
      { key: "min_bridge_mm",  label: "Min bridge width (mm)",    help: "Dilate thin features for printability. 0 = off",       type: "number", min: 0, max: 10, step: 0.1 },
    ],
  },
  {
    title: "Mesh Post-processing",
    params: [
      { key: "decimate_ratio", label: "Decimation ratio", help: "0 = off. 0.7 = remove 70% of faces", type: "number", min: 0, max: 0.95, step: 0.05 },
    ],
  },
]

function parseShape(raw: unknown): { base: string; w: string; h: string } {
  const s = typeof raw === "string" ? raw : ""
  const parts = s.split(":")
  if ((parts[0] === "rect" || parts[0] === "oval") && parts.length === 3) {
    return { base: parts[0], w: parts[1], h: parts[2] }
  }
  if (parts[0] === "rect") return { base: "rect", w: "3", h: "4" }
  if (parts[0] === "oval") return { base: "oval", w: "16", h: "9" }
  return { base: s || "circle", w: "3", h: "4" }
}

export function LgConfigEditor({ orderId, customerConfig, operatorConfig, onConfigChange, onReset }: LgConfigEditorProps) {
  const merged = { ...customerConfig, ...(operatorConfig ?? {}) }
  const [values, setValues] = useState<Record<string, unknown>>(merged)

  const shapeParsed = parseShape(values.flooring_shape)
  const [shapeBase, setShapeBase] = useState(shapeParsed.base)
  const [ratioW, setRatioW] = useState(shapeParsed.w)
  const [ratioH, setRatioH] = useState(shapeParsed.h)

  const [showJson, setShowJson] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const needsRatio = shapeBase === "rect" || shapeBase === "oval"

  function notifyChange(nextValues: Record<string, unknown>, nextBase: string, nextW: string, nextH: string) {
    if (!onConfigChange) return
    const config: Record<string, unknown> = {}
    for (const section of SECTIONS) {
      for (const p of section.params) {
        const v = nextValues[p.key]
        if (v !== undefined && v !== null && v !== "") {
          config[p.key] = p.type === "number" ? Number(v) : v
        }
      }
    }
    const needsR = nextBase === "rect" || nextBase === "oval"
    config.flooring_shape = !nextBase || nextBase === "circle"
      ? "circle"
      : needsR ? `${nextBase}:${nextW}:${nextH}` : nextBase
    onConfigChange(config)
  }

  function setValue(key: string, raw: string | boolean | number) {
    const next = { ...values, [key]: raw }
    setValues(next)
    notifyChange(next, shapeBase, ratioW, ratioH)
  }

  function getNum(key: string): number {
    const v = values[key]
    return typeof v === "number" ? v : Number(v) || 0
  }

  function getBool(key: string): boolean {
    return !!values[key]
  }

  function buildCurrentConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {}
    for (const section of SECTIONS) {
      for (const p of section.params) {
        const v = values[p.key]
        if (v !== undefined && v !== null && v !== "") {
          config[p.key] = p.type === "number" ? Number(v) : v
        }
      }
    }
    const needsR = shapeBase === "rect" || shapeBase === "oval"
    config.flooring_shape = !shapeBase || shapeBase === "circle"
      ? "circle"
      : needsR ? `${shapeBase}:${ratioW}:${ratioH}` : shapeBase
    return config
  }

  async function saveConfig(): Promise<boolean> {
    const config = buildCurrentConfig()
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

  function handleSave() {
    setFeedback(null)
    startTransition(async () => {
      if (await saveConfig()) setFeedback("✅ Config override saved")
      else setFeedback("❌ Gagal menyimpan config")
    })
  }

  function handleReset() {
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/light-generator/orders/${orderId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ configJsonOperator: null }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setFeedback("❌ " + (body.error ?? res.statusText))
          return
        }
        setValues({ ...customerConfig })
        const sp = parseShape(customerConfig.flooring_shape)
        setShapeBase(sp.base)
        setRatioW(sp.w)
        setRatioH(sp.h)
        setFeedback("ℹ️ Config reset to customer defaults")
        onReset?.()
      } catch (err) {
        setFeedback("❌ " + String(err))
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generator Config</CardTitle>
        <CardDescription>
          Edit parameters before generating. Changes are saved as an operator
          override — the customer&apos;s original config is preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Shape section */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold border-b pb-2">Casing Shape</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Shape</Label>
              <Select
                value={shapeBase}
                onValueChange={(v) => {
                  if (!v) return
                  const newW = v === "rect" ? "3" : v === "oval" ? "16" : ratioW
                  const newH = v === "rect" ? "4" : v === "oval" ? "9" : ratioH
                  setShapeBase(v)
                  if (v === "rect" || v === "oval") { setRatioW(newW); setRatioH(newH) }
                  notifyChange(values, v, newW, newH)
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHAPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-[11px]">Footprint of the casing wall</p>
              {needsRatio && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">W ratio</Label>
                    <Input type="number" min={1} max={32} step={1} value={ratioW}
                      onChange={(e) => { setRatioW(e.currentTarget.value); notifyChange(values, shapeBase, e.currentTarget.value, ratioH) }}
                      className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">H ratio</Label>
                    <Input type="number" min={1} max={32} step={1} value={ratioH}
                      onChange={(e) => { setRatioH(e.currentTarget.value); notifyChange(values, shapeBase, ratioW, e.currentTarget.value) }}
                      className="h-8" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Parameter sections */}
        {SECTIONS.map((section) => (
          <div key={section.title} className="space-y-4">
            <h4 className="text-sm font-semibold border-b pb-2">{section.title}</h4>
            <div className="grid gap-5 sm:grid-cols-2">
              {section.params.map((p) => {
                const isDisabled = p.key === "stem_width" && !getBool("support_stems")
                return (
                  <div key={p.key} className={`space-y-2 ${isDisabled ? "opacity-40 pointer-events-none" : ""}`}>
                    {p.type === "boolean" ? (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label className="text-sm">{p.label}</Label>
                          <p className="text-muted-foreground text-[11px]">{p.help}</p>
                        </div>
                        <Switch checked={getBool(p.key)} onCheckedChange={(checked) => setValue(p.key, checked)} />
                      </div>
                    ) : p.autoable && (values[p.key] === "" || values[p.key] == null) ? (
                      <>
                        <div className="flex items-baseline justify-between">
                          <Label className="text-sm">{p.label}</Label>
                          <span className="text-muted-foreground text-xs">Auto</span>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <p className="text-muted-foreground text-[11px] flex-1">
                            {p.help} — derived from shadow size and radius
                          </p>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                            onClick={() => setValue(p.key, p.min ?? 5)}>
                            Override
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline justify-between">
                          <Label className="text-sm">{p.label}</Label>
                          <span className="text-muted-foreground text-xs tabular-nums">{getNum(p.key)}</span>
                        </div>
                        <Slider
                          value={[getNum(p.key)]}
                          min={p.min} max={p.max} step={p.step}
                          onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : (val as number); if (v !== undefined) setValue(p.key, v) }}
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={getNum(p.key)}
                            min={p.min} max={p.max} step={p.step}
                            onChange={(e) => setValue(p.key, e.currentTarget.value)}
                            className="h-8 w-24 text-sm"
                          />
                          <p className="text-muted-foreground text-[11px] flex-1">{p.help}</p>
                          {p.autoable && (
                            <button type="button"
                              className="text-muted-foreground text-[11px] underline hover:text-foreground"
                              onClick={() => setValue(p.key, "")}>
                              Reset to Auto
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {feedback && <p className="text-sm">{feedback}</p>}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={isPending}>
            Save config only
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isPending}>
            Reset to customer defaults
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide JSON" : "Show raw JSON"}
          </Button>
        </div>

        {showJson && (
          <pre className="bg-muted overflow-auto rounded-lg p-3 text-xs">
            {JSON.stringify(buildCurrentConfig(), null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}
