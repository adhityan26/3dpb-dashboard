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
import {
  type ParamDef,
  SECTIONS,
  RECESS_PARAMS,
  SHAPE_OPTIONS,
  COVER_OPTIONS,
} from "./config-params"

interface LgConfigEditorProps {
  orderId: string
  customerConfig: Record<string, unknown>
  operatorConfig: Record<string, unknown> | null
  onConfigChange?: (config: Record<string, unknown>) => void
  onReset?: () => void
  /** Whether the order already has a floor-insert image (order.additionalImagePath). */
  hasFlooringImage?: boolean
}

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

export function LgConfigEditor({ orderId, customerConfig, operatorConfig, onConfigChange, onReset, hasFlooringImage = false }: LgConfigEditorProps) {
  const merged = { ...customerConfig, ...(operatorConfig ?? {}) }
  const [values, setValues] = useState<Record<string, unknown>>(merged)

  const shapeParsed = parseShape(values.flooring_shape)
  const [shapeBase, setShapeBase] = useState(shapeParsed.base)
  const [ratioW, setRatioW] = useState(shapeParsed.w)
  const [ratioH, setRatioH] = useState(shapeParsed.h)

  const [showJson, setShowJson] = useState(false)
  const [jsonDraft, setJsonDraft] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [flooringUploaded, setFlooringUploaded] = useState(hasFlooringImage)
  const [flooringUploadPending, setFlooringUploadPending] = useState(false)
  const [flooringUploadError, setFlooringUploadError] = useState<string | null>(null)

  const needsRatio = shapeBase === "rect" || shapeBase === "oval"
  const isCustomShape = shapeBase === "custom"

  async function handleFlooringImageUpload(file: File) {
    setFlooringUploadError(null)
    setFlooringUploadPending(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/light-generator/orders/${orderId}/additional`, {
        method: "PUT",
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setFlooringUploadError(body.error ?? res.statusText)
        return
      }
      setFlooringUploaded(true)
    } catch (err) {
      setFlooringUploadError(String(err))
    } finally {
      setFlooringUploadPending(false)
    }
  }

  const coverType = values.cover_type === "top" ? "top" : "bottom"

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
    config.cover_type = nextValues.cover_type === "top" ? "top" : "bottom"
    config.invert_mask = !!nextValues.invert_mask
    config.bottom_frame = !!nextValues.bottom_frame
    config.bottom_frame_height = Number(nextValues.bottom_frame_height) || 5
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
    config.cover_type = values.cover_type === "top" ? "top" : "bottom"
    config.invert_mask = !!values.invert_mask
    config.bottom_frame = !!values.bottom_frame
    config.bottom_frame_height = Number(values.bottom_frame_height) || 5
    const needsR = shapeBase === "rect" || shapeBase === "oval"
    config.flooring_shape = !shapeBase || shapeBase === "circle"
      ? "circle"
      : needsR ? `${shapeBase}:${ratioW}:${ratioH}` : shapeBase
    return config
  }

  function applyJsonDraft() {
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonDraft)
    } catch (err) {
      setJsonError(`JSON tidak valid: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonError("JSON harus berupa object { … }")
      return
    }
    const incoming = parsed as Record<string, unknown>
    // Merge over current values so a partial paste only overrides given keys
    const next = { ...values, ...incoming }
    setValues(next)
    const sp = parseShape(next.flooring_shape)
    setShapeBase(sp.base)
    setRatioW(sp.w)
    setRatioH(sp.h)
    notifyChange(next, sp.base, sp.w, sp.h)
    setJsonError(null)
    setFeedback("✅ JSON applied — review lalu Save untuk menyimpan")
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
              {isCustomShape && (
                <div className="space-y-2 pt-1">
                  <p className="text-muted-foreground text-[11px]">
                    Hitam = footprint casing. Order customer dengan floor insert image sudah otomatis terisi.
                  </p>
                  {flooringUploaded ? (
                    <p className="text-xs text-green-600">✓ gambar flooring tersedia</p>
                  ) : (
                    <p className="text-xs text-amber-600">Belum ada gambar flooring untuk order ini</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="h-8 text-xs"
                      disabled={flooringUploadPending}
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0]
                        if (file) void handleFlooringImageUpload(file)
                      }}
                    />
                  </div>
                  {flooringUploadPending && <p className="text-muted-foreground text-[11px]">Mengupload...</p>}
                  {flooringUploadError && <p className="text-xs text-red-500">❌ {flooringUploadError}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cover section */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold border-b pb-2">Cover</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cover type</Label>
              <Select
                value={coverType}
                onValueChange={(v) => { if (v) setValue("cover_type", v) }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COVER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-[11px]">
                Bottom: floor plate + LED pillar, open top. Top: closed cover with LED recess, open bottom.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Invert shadow</Label>
                <p className="text-muted-foreground text-[11px]">Swap solid/hole regions of the silhouette</p>
              </div>
              <Switch checked={getBool("invert_mask")} onCheckedChange={(c) => setValue("invert_mask", c)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Bottom frame</Label>
                <p className="text-muted-foreground text-[11px]">Solid band at the wall base that catches islands near the bottom — follows the footprint shape; blocks the outermost shadow zone</p>
              </div>
              <Switch checked={getBool("bottom_frame")} onCheckedChange={(c) => setValue("bottom_frame", c)} />
            </div>
            {getBool("bottom_frame") && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label className="text-sm">Bottom frame height (mm)</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">{getNum("bottom_frame_height") || 5}</span>
                </div>
                <Slider
                  value={[getNum("bottom_frame_height") || 5]}
                  min={1} max={30} step={0.5}
                  onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : (val as number); if (v !== undefined) setValue("bottom_frame_height", v) }}
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={getNum("bottom_frame_height") || 5}
                    min={1} max={30} step={0.5}
                    onChange={(e) => setValue("bottom_frame_height", e.currentTarget.value)}
                    className="h-8 w-24 text-sm"
                  />
                  <p className="text-muted-foreground text-[11px] flex-1">Height of the solid band at the wall base</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Parameter sections */}
        {SECTIONS
          .filter((section) => !(coverType === "top" && section.title === "LED Pillar"))
          .map((section) => (
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

        {coverType === "top" && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold border-b pb-2">LED Recess</h4>
            <div className="grid gap-5 sm:grid-cols-2">
              {RECESS_PARAMS.map((p) => (
                <div key={p.key} className="space-y-2">
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {feedback && <p className="text-sm">{feedback}</p>}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={isPending}>
            Save config only
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isPending}>
            Reset to customer defaults
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!showJson) setJsonDraft(JSON.stringify(buildCurrentConfig(), null, 2))
              setJsonError(null)
              setShowJson(!showJson)
            }}
          >
            {showJson ? "Hide JSON" : "Edit raw JSON"}
          </Button>
        </div>

        {showJson && (
          <div className="space-y-2">
            <textarea
              value={jsonDraft}
              onChange={(e) => { setJsonDraft(e.currentTarget.value); setJsonError(null) }}
              spellCheck={false}
              rows={Math.min(24, jsonDraft.split("\n").length + 1)}
              className="bg-muted w-full resize-y overflow-auto rounded-lg p-3 font-mono text-xs"
              aria-label="Raw config JSON"
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={applyJsonDraft}>
                Apply JSON
              </Button>
              <p className="text-muted-foreground text-[11px]">
                Paste a full or partial config — known parameter keys override the form values above.
              </p>
            </div>
            {jsonError && <p className="text-sm text-red-500">❌ {jsonError}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
