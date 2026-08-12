"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  SECTIONS,
  RECESS_PARAMS,
  COVER_OPTIONS,
  SHAPE_OPTIONS,
  type ParamDef,
} from "../config-params"
import { coerceParamValue } from "./filter-params"
import { removeStem, type UserStem } from "./wall-math"
import type { LgEditorTab } from "./LgEditorShell"
import { LgJsonEditorDialog } from "./LgJsonEditorDialog"

/** Single clean border look for accordion cards: card owns the outer
 * border, the trigger owns ONE separator (bottom only) — overrides the
 * primitive's default `rounded-lg border border-transparent` (an
 * all-sides transparent border reserved for the focus ring) which,
 * combined with a naive `border-b` addition, produced a visible double
 * border on the card's left/right edges. */
const TRIGGER_CLASS = "rounded-none border-0 border-b border-border/40"

interface LgInspectorProps {
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  /** Order id — needed to PUT the floor-insert image for custom shapes. Optional so existing callers/tests are unaffected. */
  orderId?: string
  /** Whether the order already has a floor-insert image (order.additionalImagePath). */
  hasFlooringImage?: boolean
  /** Current workflow step — narrows which v2 groups default open. Omit to
   * keep every group open (used by tests that don't care about the
   * per-step default). */
  activeStep?: LgEditorTab
}

/**
 * v2-only grouping of the shared config-params.ts ParamDefs into the 5
 * addendum groups (Casing / Shadow behavior / Dimensions / Lighting /
 * Advanced). This is presentation-only — it references SECTIONS/RECESS_PARAMS
 * by key rather than duplicating them, so v1 (LgConfigEditor, still on the
 * flat SECTIONS list) is untouched.
 */
function findParam(key: string): ParamDef | undefined {
  for (const section of SECTIONS) {
    const p = section.params.find((x) => x.key === key)
    if (p) return p
  }
  return RECESS_PARAMS.find((x) => x.key === key)
}

/** Extracts a short unit chip ("mm", "%", "px", ...) from a ParamDef's
 * parenthetical label suffix, e.g. "Outer radius (mm)" -> "mm". */
function unitFromLabel(label: string): string | undefined {
  const m = label.match(/\(([^)]+)\)\s*$/)
  if (!m) return undefined
  const raw = m[1].trim()
  // Only surface short unit-like suffixes as a chip — longer parentheticals
  // (e.g. "(angular)") aren't units and read better inline in the label.
  return raw.length <= 4 ? raw : undefined
}

const DIMENSIONS_KEYS = ["outer_radius", "base_radius", "shell_height", "shell_thickness", "base_thickness", "casing_lift"]
const LIGHTING_KEYS = ["light_x", "light_y", "light_z_offset"]
const ADVANCED_KEYS = [
  "n_stencil_theta",
  "n_stencil_z",
  "edge_smooth_sigma",
  "shadow_threshold",
  "support_stems",
  "stem_width",
  "min_bridge_mm",
  "decimate_ratio",
  "img_brightness",
  "img_contrast",
  "img_saturation",
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

const ALL_GROUPS = ["Casing", "Shadow behavior", "Dimensions", "Lighting", "Advanced", "Stems"]

/** Default-open groups per workflow step — "kontekstual per step" from the
 * 2026-08-12 polish addendum: shadow -> Casing/Shadow behavior/Dimensions,
 * wall -> Stems/Advanced, 3d -> Dimensions. */
function defaultOpenGroups(step: LgEditorTab | undefined): string[] {
  if (step === undefined) return ALL_GROUPS
  if (step === "shadow") return ["Casing", "Shadow behavior", "Dimensions"]
  if (step === "wall") return ["Stems", "Advanced"]
  if (step === "3d") return ["Dimensions"]
  return ["Casing"]
}

export function LgInspector({ config, onChange, orderId, hasFlooringImage = false, activeStep }: LgInspectorProps) {
  const [query, setQuery] = useState("")
  const [flooringUploaded, setFlooringUploaded] = useState(hasFlooringImage)
  const [flooringUploadPending, setFlooringUploadPending] = useState(false)
  const [flooringUploadError, setFlooringUploadError] = useState<string | null>(null)

  async function handleFlooringImageUpload(file: File) {
    if (!orderId) return
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
  // Raw JSON now lives in an on-demand Dialog (LgJsonEditorDialog) instead
  // of an always-visible accordion — see item 7 of the 2026-08-12 polish
  // addendum. The dialog owns its own dirty/apply-guard state internally.
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false)

  const coverType = config.cover_type === "top" ? "top" : "bottom"
  const shape = parseShape(config.flooring_shape)
  const needsRatio = shape.base === "rect" || shape.base === "oval"
  const isCustomShape = shape.base === "custom"

  function getNum(key: string): number {
    const v = config[key]
    return typeof v === "number" ? v : Number(v) || 0
  }

  function getBool(key: string): boolean {
    return !!config[key]
  }

  // Centralized field-edit handler: coerces numeric inputs (empty string ->
  // key removed so the generator default applies; non-numeric -> ignored)
  // and passes booleans/strings straight through.
  function setValue(key: string, raw: unknown, type: "number" | "boolean" | "string" = "string") {
    if (type === "string") {
      onChange({ ...config, [key]: raw })
      return
    }
    const next = coerceParamValue(config, key, raw, type)
    if (next === null) return
    onChange(next)
  }

  function setShape(base: string, w: string, h: string) {
    const needsR = base === "rect" || base === "oval"
    const flooring_shape = !base || base === "circle" ? "circle" : needsR ? `${base}:${w}:${h}` : base
    onChange({ ...config, flooring_shape })
  }

  // Row layout: [Label ⓘ] … [Slider] [Input+unit] — the value now lives
  // only in the number Input, and the ⓘ is a real (discoverable) hover/focus
  // tooltip instead of a native `title` attribute.
  function paramInfo(help: string) {
    return (
      <Tooltip>
        <TooltipTrigger
          aria-label={help}
          className="text-muted-foreground text-xs cursor-help outline-none"
        >
          ⓘ
        </TooltipTrigger>
        <TooltipContent>{help}</TooltipContent>
      </Tooltip>
    )
  }

  function renderParam(p: ParamDef) {
    const unit = unitFromLabel(p.label)
    const bareLabel = p.label.replace(/\s*\([^)]+\)\s*$/, "")
    if (p.type === "boolean") {
      return (
        <div key={p.key} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm">{bareLabel}</Label>
            {paramInfo(p.help)}
          </div>
          <Switch checked={getBool(p.key)} onCheckedChange={(checked) => setValue(p.key, checked, "boolean")} />
        </div>
      )
    }
    return (
      <div key={p.key} className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm">{bareLabel}</Label>
          {paramInfo(p.help)}
        </div>
        <div className="flex items-center gap-2">
          <Slider
            value={[getNum(p.key)]}
            min={p.min}
            max={p.max}
            step={p.step}
            className="flex-1"
            onValueChange={(val) => {
              const v = Array.isArray(val) ? val[0] : (val as number)
              if (v !== undefined) setValue(p.key, v, "number")
            }}
          />
          <Input
            type="number"
            value={getNum(p.key)}
            min={p.min}
            max={p.max}
            step={p.step}
            onChange={(e) => setValue(p.key, e.currentTarget.value, "number")}
            className="h-8 w-20 text-sm"
          />
          {unit && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{unit}</span>
          )}
        </div>
      </div>
    )
  }

  function matchesQuery(p: ParamDef): boolean {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.help.toLowerCase().includes(q)
  }

  function renderParams(params: ParamDef[]) {
    const filtered = params.filter(matchesQuery)
    if (filtered.length === 0) return null
    return <div className="grid gap-5 sm:grid-cols-2">{filtered.map((p) => renderParam(p))}</div>
  }

  // Looks up by key against the shared SECTIONS/RECESS_PARAMS — NOT safe for
  // the Casing group's recess/pillar params, since pillar_outer_r and
  // led_socket_height are shared keys between the two lists with different
  // labels (findParam always resolves the SECTIONS/pillar version first).
  // Use renderParams(recessOrPillarParams) directly there instead.
  function renderParamList(keys: string[]) {
    const params = keys.map(findParam).filter((p): p is ParamDef => !!p)
    return renderParams(params)
  }

  const userStems: UserStem[] = Array.isArray(config.user_stems) ? (config.user_stems as UserStem[]) : []

  function deleteStem(id: string) {
    onChange(removeStem(config, id))
  }

  // Controlled accordion state: initialized from the active step (or every
  // group, when no step context is given). Re-derives whenever the step
  // changes so switching workflow steps re-focuses the inspector — a
  // deliberate exception to "don't fight the user's manual toggles", matching
  // "Inspector kontekstual per step" from the polish addendum.
  const [openGroups, setOpenGroups] = useState<string[]>(() => defaultOpenGroups(activeStep))
  useEffect(() => {
    setOpenGroups(defaultOpenGroups(activeStep))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep])

  const bottomFrameOn = getBool("bottom_frame")
  const recessOrPillarParams = coverType === "top" ? RECESS_PARAMS : (SECTIONS.find((s) => s.title === "LED Pillar")?.params ?? [])

  return (
    <div className="space-y-4">
      {/* Sticky within the inspector's own scroll container (the
          overflow-y-auto column in LgEditorShell) so the search field stays
          reachable while the rest of the inspector scrolls underneath it. */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background pb-3">
        <Input
          type="search"
          placeholder="search parameter…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          aria-label="search parameter"
        />
      </div>

      {/* Each group renders as its own bordered card (mockup: parameter
          groups as cards, not one long accordion with full-width
          separators) — className on AccordionItem overrides the primitive's
          default `not-last:border-b` divider. */}
      <Accordion multiple value={openGroups} onValueChange={(v) => setOpenGroups(v as string[])} className="space-y-2">
        {/* Casing — shape + cover + recess/pillar */}
        <AccordionItem value="Casing" className="rounded-lg border bg-card/50 px-3">
          <AccordionTrigger className={TRIGGER_CLASS}>Casing</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Shape</Label>
                <Select
                  value={shape.base}
                  onValueChange={(v) => {
                    if (!v) return
                    const newW = v === "rect" ? "3" : v === "oval" ? "16" : shape.w
                    const newH = v === "rect" ? "4" : v === "oval" ? "9" : shape.h
                    setShape(v, newW, newH)
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHAPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsRatio && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">W ratio</Label>
                      <Input
                        type="number"
                        min={1}
                        max={32}
                        step={1}
                        value={shape.w}
                        onChange={(e) => setShape(shape.base, e.currentTarget.value, shape.h)}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">H ratio</Label>
                      <Input
                        type="number"
                        min={1}
                        max={32}
                        step={1}
                        value={shape.h}
                        onChange={(e) => setShape(shape.base, shape.w, e.currentTarget.value)}
                        className="h-8"
                      />
                    </div>
                  </div>
                )}
                {isCustomShape && (
                  <div className="space-y-2 pt-1">
                    <p className="text-muted-foreground text-[11px]">
                      Black = casing footprint. Orders with a floor-insert image are filled in automatically.
                    </p>
                    {flooringUploaded ? (
                      <p className="text-xs text-green-600">✓ flooring image available</p>
                    ) : (
                      <p className="text-xs text-amber-600">No flooring image for this order yet</p>
                    )}
                    {orderId && (
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
                    )}
                    {flooringUploadPending && <p className="text-muted-foreground text-[11px]">Uploading...</p>}
                    {flooringUploadError && <p className="text-xs text-red-500">❌ {flooringUploadError}</p>}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Cover type</Label>
                  <span
                    title="Bottom: floor plate + LED pillar, open top. Top: closed cover with LED recess, open bottom."
                    className="text-muted-foreground text-xs cursor-help"
                  >
                    ⓘ
                  </span>
                </div>
                <Select value={coverType} onValueChange={(v) => { if (v) setValue("cover_type", v) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COVER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {renderParams(recessOrPillarParams)}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Shadow behavior — invert, bottom frame, auto-fit, mask padding, offsets */}
        <AccordionItem value="Shadow behavior" className="rounded-lg border bg-card/50 px-3">
          <AccordionTrigger className={TRIGGER_CLASS}>Shadow behavior</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm">Invert shadow</Label>
                  <span title="Swap solid/hole regions of the silhouette" className="text-muted-foreground text-xs cursor-help">ⓘ</span>
                </div>
                <Switch checked={getBool("invert_mask")} onCheckedChange={(c) => setValue("invert_mask", c, "boolean")} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm">Bottom frame</Label>
                  <span title="Solid band at the wall base that catches islands near the bottom" className="text-muted-foreground text-xs cursor-help">ⓘ</span>
                </div>
                <Switch checked={bottomFrameOn} onCheckedChange={(c) => setValue("bottom_frame", c, "boolean")} />
              </div>
              {bottomFrameOn && (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-sm">Bottom frame height</Label>
                    <span className="text-muted-foreground text-xs tabular-nums">{getNum("bottom_frame_height") || 5}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[getNum("bottom_frame_height") || 5]}
                      min={1}
                      max={30}
                      step={0.5}
                      className="flex-1"
                      onValueChange={(val) => {
                        const v = Array.isArray(val) ? val[0] : (val as number)
                        if (v !== undefined) setValue("bottom_frame_height", v, "number")
                      }}
                    />
                    <Input
                      type="number"
                      value={getNum("bottom_frame_height") || 5}
                      min={1}
                      max={30}
                      step={0.5}
                      onChange={(e) => setValue("bottom_frame_height", e.currentTarget.value, "number")}
                      className="h-8 w-20 text-sm"
                    />
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">mm</span>
                  </div>
                </div>
              )}
              {renderParamList(["auto_fit_mask", "mask_padding_pct", "shadow_offset_x", "shadow_offset_y", "floor_half_size"])}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Dimensions — radii, heights, thickness */}
        <AccordionItem value="Dimensions" className="rounded-lg border bg-card/50 px-3">
          <AccordionTrigger className={TRIGGER_CLASS}>Dimensions</AccordionTrigger>
          <AccordionContent>{renderParamList(DIMENSIONS_KEYS)}</AccordionContent>
        </AccordionItem>

        {/* Lighting — light x/y/z */}
        <AccordionItem value="Lighting" className="rounded-lg border bg-card/50 px-3">
          <AccordionTrigger className={TRIGGER_CLASS}>Lighting</AccordionTrigger>
          <AccordionContent>{renderParamList(LIGHTING_KEYS)}</AccordionContent>
        </AccordionItem>

        {/* Advanced — resolution, smoothness, printability, mesh post, image adjustment */}
        <AccordionItem value="Advanced" className="rounded-lg border bg-card/50 px-3">
          <AccordionTrigger className={TRIGGER_CLASS}>Advanced</AccordionTrigger>
          <AccordionContent>{renderParamList(ADVANCED_KEYS)}</AccordionContent>
        </AccordionItem>

        <AccordionItem value="Stems" className="rounded-lg border bg-card/50 px-3">
          <AccordionTrigger className={TRIGGER_CLASS}>Stems</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              {userStems.length === 0 ? (
                <p className="text-muted-foreground text-[11px]">
                  No manual stems yet — add them from the Wall &amp; stems step.
                </p>
              ) : (
                userStems.map((stem) => (
                  <div key={stem.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono">
                      θ {stem.theta_deg}° · z {stem.z_mm}mm
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      aria-label={`Hapus stem ${stem.id}`}
                      onClick={() => deleteStem(stem.id)}
                    >
                      🗑
                    </Button>
                  </div>
                ))
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      {/* Raw JSON moved out of the accordion into an on-demand Dialog —
          item 7 of the 2026-08-12 polish addendum. */}
      <Button variant="outline" size="sm" className="w-full" onClick={() => setJsonDialogOpen(true)}>
        Edit raw JSON
      </Button>
      <LgJsonEditorDialog
        open={jsonDialogOpen}
        onOpenChange={setJsonDialogOpen}
        config={config}
        onApply={onChange}
      />
    </div>
  )
}
