"use client"

import { useState } from "react"
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
import {
  SECTIONS,
  RECESS_PARAMS,
  COVER_OPTIONS,
  SHAPE_OPTIONS,
  type ParamDef,
} from "../config-params"
import { filterSections } from "./filter-params"

interface LgInspectorProps {
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
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

export function LgInspector({ config, onChange }: LgInspectorProps) {
  const [query, setQuery] = useState("")
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(config, null, 2))
  const [jsonError, setJsonError] = useState<string | null>(null)

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

  function setValue(key: string, value: unknown) {
    onChange({ ...config, [key]: value })
  }

  function setShape(base: string, w: string, h: string) {
    const needsR = base === "rect" || base === "oval"
    const flooring_shape = !base || base === "circle" ? "circle" : needsR ? `${base}:${w}:${h}` : base
    onChange({ ...config, flooring_shape })
  }

  function renderParam(p: ParamDef) {
    if (p.type === "boolean") {
      return (
        <div key={p.key} className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">{p.label}</Label>
            <p className="text-muted-foreground text-[11px]">{p.help}</p>
          </div>
          <Switch checked={getBool(p.key)} onCheckedChange={(checked) => setValue(p.key, checked)} />
        </div>
      )
    }
    return (
      <div key={p.key} className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label className="text-sm">{p.label}</Label>
          <span className="text-muted-foreground text-xs tabular-nums">{getNum(p.key)}</span>
        </div>
        <Slider
          value={[getNum(p.key)]}
          min={p.min}
          max={p.max}
          step={p.step}
          onValueChange={(val) => {
            const v = Array.isArray(val) ? val[0] : (val as number)
            if (v !== undefined) setValue(p.key, v)
          }}
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={getNum(p.key)}
            min={p.min}
            max={p.max}
            step={p.step}
            onChange={(e) => setValue(p.key, e.currentTarget.value)}
            className="h-8 w-24 text-sm"
          />
          <p className="text-muted-foreground text-[11px] flex-1">{p.help}</p>
        </div>
      </div>
    )
  }

  const filteredSections = filterSections(SECTIONS, query).filter(
    (section) => !(coverType === "top" && section.title === "LED Pillar"),
  )

  const allSectionValues = ["Casing Shape", "Cover", ...filteredSections.map((s) => s.title)]
  if (coverType === "top") allSectionValues.push("LED Recess")
  allSectionValues.push("Raw JSON")

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
    onChange({ ...config, ...incoming })
    setJsonError(null)
  }

  return (
    <div className="space-y-4">
      <Input
        type="search"
        placeholder="cari parameter…"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        aria-label="cari parameter"
      />

      <Accordion multiple defaultValue={allSectionValues.filter((v) => v !== "Raw JSON")}>
        <AccordionItem value="Casing Shape">
          <AccordionTrigger>Casing Shape</AccordionTrigger>
          <AccordionContent>
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
                <p className="text-muted-foreground text-[11px]">
                  Hitam = footprint casing. Order customer dengan floor insert image sudah otomatis terisi.
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="Cover">
          <AccordionTrigger>Cover</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cover type</Label>
                <Select value={coverType} onValueChange={(v) => { if (v) setValue("cover_type", v) }}>
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
                  <p className="text-muted-foreground text-[11px]">Solid band at the wall base that catches islands near the bottom</p>
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
                    min={1}
                    max={30}
                    step={0.5}
                    onValueChange={(val) => {
                      const v = Array.isArray(val) ? val[0] : (val as number)
                      if (v !== undefined) setValue("bottom_frame_height", v)
                    }}
                  />
                  <Input
                    type="number"
                    value={getNum("bottom_frame_height") || 5}
                    min={1}
                    max={30}
                    step={0.5}
                    onChange={(e) => setValue("bottom_frame_height", e.currentTarget.value)}
                    className="h-8 w-24 text-sm"
                  />
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {filteredSections.map((section) => (
          <AccordionItem key={section.title} value={section.title}>
            <AccordionTrigger>{section.title}</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-5 sm:grid-cols-2">
                {section.params.map((p) => renderParam(p))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}

        {coverType === "top" && (
          <AccordionItem value="LED Recess">
            <AccordionTrigger>LED Recess</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-5 sm:grid-cols-2">
                {RECESS_PARAMS.map((p) => renderParam(p))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="Raw JSON">
          <AccordionTrigger>Raw JSON</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <textarea
                value={jsonDraft}
                onChange={(e) => { setJsonDraft(e.currentTarget.value); setJsonError(null) }}
                spellCheck={false}
                rows={Math.min(24, jsonDraft.split("\n").length + 1)}
                className="bg-muted w-full resize-y overflow-auto rounded-lg p-3 font-mono text-xs"
                aria-label="Raw config JSON"
              />
              <Button variant="outline" size="sm" onClick={applyJsonDraft}>
                Apply
              </Button>
              {jsonError && <p className="text-sm text-red-500">❌ {jsonError}</p>}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
