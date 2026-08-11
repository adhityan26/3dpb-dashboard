"use client"

import { useEffect, useRef, useState } from "react"
import { ZoomIn, ZoomOut, Scan, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  applyOffsetDrag,
  applyImageResize,
  applyCasingResize,
  applyCasingDrag,
  applyLampDrag,
  casingScreenRadius,
  paddingPctToRadiusFraction,
  overlayGeometry,
  buildImageFilter,
  parseFlooringShape,
  resizeFromCursor,
  adjustDeltaForZoom,
  clampZoom,
} from "./canvas-math"
import { traceContour, contourToPath, type Point } from "./contour"

interface LgCanvas2DProps {
  pngUrl: string | null
  loading: boolean
  config?: Record<string, unknown>
  onConfigChange?: (next: Record<string, unknown>) => void
  /** When provided, the backdrop shows the ORIGINAL uploaded silhouette
   * (e.g. `/api/light-generator/orders/{id}/silhouette`) instead of the
   * server-rendered preview PNG — used by the Canvas Editor card so image
   * adjustment params (brightness/contrast/saturation) can be tuned against
   * the source image with live CSS-filter feedback. The Shadow preview card
   * omits this and keeps rendering `pngUrl` (the actual thresholded/masked
   * output) untouched. */
  originalImageUrl?: string | null
  /** URL of the order's uploaded custom-flooring image, used to render the
   * casing overlay when flooring_shape is "custom" instead of an SVG shape. */
  flooringImageUrl?: string | null
  /** Forces the overlay/handles off even when `onConfigChange` is provided —
   * used by the "Shadow preview" card, which shows the same image clean,
   * with no drag interactions. Default off (i.e. interactive whenever
   * `onConfigChange` is passed) — used by the "Canvas Editor" card. */
  readOnly?: boolean
  /** Dims the backdrop image (opacity-80) so the object overlays read
   * clearly on top of it — used by the "Canvas Editor" card. */
  dimBackdrop?: boolean
  /** Overrides the container height class. Defaults to a size tuned for the
   * dominant "Canvas Editor" card; pass a smaller class for the "Shadow
   * preview" card underneath it. */
  heightClass?: string
  /** True when the last preview request failed — swaps the empty state for
   * a "Coba lagi" retry affordance instead of the generic idle text, so a
   * failed initial request doesn't look identical to "nothing happened yet". */
  error?: boolean
  /** Retry handler for the error state. */
  onRetry?: () => void
}

/** Inset (px) subtracted from the measured square so corner handles never
 * get clipped by the container's overflow-hidden boundary. */
const WRAP_INSET_PX = 16

const DEFAULT_HEIGHT_CLASS = "h-[52vh] min-h-[380px]"

const HANDLE_R = 6
// Invisible enlarged hit target around each 6px handle so small handles are easy to grab.
const HANDLE_HIT = 22
const LAMP_R = 5

/**
 * Minimum pointer travel (px, Chebyshev-ish via hypot) before a press counts
 * as a DRAG. Below it the gesture is a plain click and is discarded without
 * writing anything.
 *
 * Why this exists: every applier below commits real config keys, and
 * `handlePointerUp` used to run them for any press/release pair. A bare click
 * on a corner handle therefore wrote `mask_padding_pct` + `auto_fit_mask:
 * false` (image-resize), a click on the casing handles rewrote
 * `floor_half_size`, and a click on the lamp rewrote `light_x/light_y` — all
 * with zero intent. The two body drags guarded only against EXACTLY zero
 * movement, so the 1-3px tremor every real mouse/trackpad click carries was
 * enough to write `shadow_offset_x/y` (observed live: a click with ~2px/-8px
 * of travel saved offsets 2.2/8.8 mm). Combined with autosave this looked
 * like the editor silently mutating a config nobody touched.
 */
const DRAG_THRESHOLD_PX = 3

type DragKind = "image" | "image-resize" | "casing" | "casing-resize" | "lamp" | null

interface DragState {
  kind: DragKind
  startX: number
  startY: number
  // live values shown during drag, in screen px relative to image/casing center
  liveDxPx: number
  liveDyPx: number
  // live half-size (image-resize) or radius (casing-resize) in px
  liveSizePx: number
  /** Object's on-screen size (half-size / radius, px) at the moment the drag
   * started — the S0 in the relative-resize formula `S0 * (r / r0)`. Only
   * meaningful for "image-resize"/"casing-resize" kinds. */
  startSizePx: number
  /** Cursor's distance (px) to the object's center at the moment the drag
   * started — the r0 in the relative-resize formula. Only meaningful for
   * "image-resize"/"casing-resize" kinds. */
  startCursorRadiusPx: number
  /** True once the pointer has travelled past DRAG_THRESHOLD_PX — only then
   * does the gesture commit on pointerup. Guards every object against
   * click-with-tremor writes. */
  moved: boolean
}

/**
 * Canvas Editor / Shadow preview — the PNG preview doubles as an
 * OBJECT-based direct-manipulation editor when interactive. Three objects
 * layered over the wrapper square, no mode toggle (overlays are always on
 * for the editor card, always off for the preview card via `readOnly`):
 *
 *   Object 1 — Main image (backdrop): body drag -> shadow_offset_x/y;
 *     corner handles -> mask_padding_pct (via content fraction).
 *   Object 2 — Casing shape (always the origin of generator space): body
 *     drag -> shadow_offset_x/y INVERTED (dragging the casing shifts the
 *     world the other way); corner handles -> floor_half_size.
 *   Object 3 — Lamp: small dot at casing center + light offset; drag ->
 *     light_x/light_y, following the casing group during a casing drag.
 *
 * All commits happen on pointerup via onConfigChange; drag-in-progress state
 * stays local (optimistic CSS transform / live overlay redraw) per the "no
 * internal config copies" rule.
 */
export function LgCanvas2D({
  pngUrl,
  loading,
  config,
  onConfigChange,
  originalImageUrl,
  flooringImageUrl,
  readOnly = false,
  dimBackdrop = false,
  heightClass = DEFAULT_HEIGHT_CLASS,
  error = false,
  onRetry,
}: LgCanvas2DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // The wrapper is the actual rendered image square (object-contain can
  // letterbox inside a non-square container in the wide grid layout) — all
  // pointer math and overlay rendering must use ITS rect, not the outer
  // container's, or every px<->mm mapping and object size drifts whenever
  // the container's aspect ratio isn't 1:1.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [wrapSize, setWrapSize] = useState(0)
  // Client-side view zoom (0.5-3, 1 = fit/reset). Applied as a CSS transform
  // on the wrapper square below — see adjustDeltaForZoom in canvas-math.ts
  // for why pointer deltas must be divided by this before feeding the
  // (logical, unzoomed) overlay math.
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<DragState | null>(null)
  // Traced outline of the custom-flooring image (grid/pixel coords), null
  // until extraction finishes (or on any failure — the caller falls back to
  // the plain bounding-box border below).
  const [contour, setContour] = useState<{ points: Point[]; w: number; h: number } | null>(null)
  // Guards a single gesture against applying more than once: pointerup can
  // fire after pointercancel in some browsers, or a stray move/up could race
  // a just-cleared drag state. Once a gesture has applied, it's done.
  const appliedRef = useRef(false)

  const cfg = config ?? {}
  const autoFit = !!cfg.auto_fit_mask
  const paddingPct = Number(cfg.mask_padding_pct) || 0
  const floorHalf = Number(cfg.floor_half_size) || 600
  const outerRadius = Number(cfg.outer_radius) || 100
  const offsetXMm = Number(cfg.shadow_offset_x) || 0
  const offsetYMm = Number(cfg.shadow_offset_y) || 0
  const lightXMm = Number(cfg.light_x) || 0
  const lightYMm = Number(cfg.light_y) || 0
  const shape = parseFlooringShape(cfg.flooring_shape)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const { size } = overlayGeometry(rect.width, rect.height)
      // Small inset so corner handles never get clipped by the container's
      // overflow-hidden edge.
      setWrapSize(Math.max(0, size - WRAP_INSET_PX))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Extracts a traced outline from the custom-flooring image so the casing
  // overlay can hug its actual shape (e.g. a shield silhouette) instead of a
  // plain bounding box. Runs client-side only (SSR has no Image/canvas);
  // any failure (load error, tainted canvas, etc.) just leaves `contour`
  // null and the render below falls back to the old bounding-box border.
  useEffect(() => {
    setContour(null)
    if (!flooringImageUrl) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      try {
        const MAX_SIDE = 96
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        // Decide the solid predicate: if the image carries meaningful alpha
        // variance (a real cutout with transparency), solid = opaque
        // pixels; otherwise (flat/opaque alpha, e.g. a JPEG) fall back to
        // dark-pixel = solid, matching how the flooring silhouette is
        // typically authored (dark shape on light background).
        let minA = 255
        let maxA = 0
        for (let i = 3; i < data.length; i += 4) {
          const a = data[i]
          if (a < minA) minA = a
          if (a > maxA) maxA = a
        }
        const useAlpha = maxA - minA > 32
        const grid = new Uint8Array(w * h)
        for (let p = 0; p < w * h; p++) {
          const i = p * 4
          if (useAlpha) {
            grid[p] = data[i + 3] > 127 ? 1 : 0
          } else {
            const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            grid[p] = luma < 128 ? 1 : 0
          }
        }
        const points = traceContour(grid, w, h)
        if (!cancelled && points.length >= 3) setContour({ points, w, h })
      } catch {
        // Fallback to bounding box — see comment above.
      }
    }
    img.onerror = () => {
      // Fallback to bounding box — see comment above.
    }
    img.src = flooringImageUrl
    return () => {
      cancelled = true
    }
  }, [flooringImageUrl])

  // Esc cancels an in-progress drag without writing anything.
  useEffect(() => {
    if (!drag) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        appliedRef.current = true // suppress a trailing pointerup from applying
        setDrag(null)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [drag])

  function getCenter(): { cx: number; cy: number } {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return { cx: 0, cy: 0 }
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
  }

  function startDrag(kind: Exclude<DragKind, null>, initialSizePx = 0) {
    return (e: React.PointerEvent) => {
      if (!onConfigChange || drag) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      appliedRef.current = false
      // For the resize kinds, capture r0 (cursor's distance to center right
      // now) alongside S0 (initialSizePx, the object's current on-screen
      // size) so the first pointermove can scale RELATIVE to this gesture's
      // own start instead of jumping to the cursor's absolute distance.
      const { cx, cy } = getCenter()
      const { dx: startCursorRadiusPx } = adjustDeltaForZoom(Math.hypot(e.clientX - cx, e.clientY - cy), 0, zoom)
      setDrag({
        kind,
        startX: e.clientX,
        startY: e.clientY,
        liveDxPx: 0,
        liveDyPx: 0,
        liveSizePx: initialSizePx,
        startSizePx: initialSizePx,
        startCursorRadiusPx,
        moved: false,
      })
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    // Raw client deltas are in REAL (post-zoom) screen px; convert to
    // LOGICAL px (what the overlay's viewBox and every applier expect)
    // before using them anywhere — see adjustDeltaForZoom in canvas-math.ts.
    const { dx, dy } = adjustDeltaForZoom(e.clientX - drag.startX, e.clientY - drag.startY, zoom)
    // Travel is measured from the press point for EVERY kind (including the
    // resizes, whose live value is a radius from the wrapper centre) so
    // "did the user actually drag?" has one definition.
    const moved = drag.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
    if (drag.kind === "image-resize" || drag.kind === "casing-resize") {
      const { cx, cy } = getCenter()
      const { dx: rLogical } = adjustDeltaForZoom(Math.hypot(e.clientX - cx, e.clientY - cy), 0, zoom)
      const liveSizePx = resizeFromCursor(drag.startSizePx, drag.startCursorRadiusPx, rLogical)
      setDrag({ ...drag, liveSizePx, moved })
    } else {
      setDrag({ ...drag, liveDxPx: dx, liveDyPx: dy, moved })
    }
  }

  function handlePointerUp() {
    if (!drag || !onConfigChange || appliedRef.current) {
      setDrag(null)
      return
    }
    // A press that never travelled past the threshold is a CLICK, not a
    // drag: discard it so no object commits anything. Without this, merely
    // clicking on the canvas rewrites config (and autosaves it).
    if (!drag.moved) {
      setDrag(null)
      return
    }
    appliedRef.current = true
    // Use the LOGICAL (unzoomed) wrapper size — matches drag.liveDxPx/liveSizePx,
    // which are already zoom-adjusted in handlePointerMove above. Using the real
    // (zoom-scaled) getImgPx() here would double-count the zoom factor.
    const imgPx = wrapSize
    const imgHalf = imgPx / 2
    // Exactly one applier per gesture, writing only its own config keys —
    // this switch is the single source of truth for "which object is
    // active", so a gesture can never touch more than one object's config.
    switch (drag.kind) {
      case "image":
        onConfigChange(applyOffsetDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPx))
        break
      case "image-resize": {
        const f = imgHalf > 0 ? drag.liveSizePx / imgHalf : 0
        onConfigChange(applyImageResize(cfg, f))
        break
      }
      case "casing":
        onConfigChange(applyCasingDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPx))
        break
      case "casing-resize":
        onConfigChange(applyCasingResize(cfg, drag.liveSizePx, imgPx))
        break
      case "lamp":
        onConfigChange(applyLampDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPx))
        break
    }
    setDrag(null)
  }

  function enableAutoFit() {
    onConfigChange?.({ ...cfg, auto_fit_mask: true })
  }

  // canConfig gates the (always-visible) info chips + Auto button — those
  // aren't drag overlays and stay usable regardless of readOnly. interactive
  // additionally gates the object overlays + drags, which only make sense
  // for the editor card (readOnly=false).
  const canConfig = !!onConfigChange && !readOnly
  const interactive = canConfig
  // Handles/objects only become hit targets once the wrapper has been
  // MEASURED. At wrapSize === 0 the viewBox falls back to "0 0 1 1" while the
  // SVG still stretches across the whole wrapper, so every 6x6 handle rect is
  // scaled to ~6x the canvas — on the first frame(s) the entire card is one
  // giant image-resize hit target sitting on top of everything else.
  const measured = wrapSize > 0
  const hitClass = measured ? "pointer-events-auto" : "pointer-events-none"
  // viewBox uses the wrapper's real measured px so object sizes computed
  // from real pointer coordinates (getCenter/getImgPx above) map 1:1 onto
  // the SVG — no separate "logical" unit space to drift out of sync with
  // the DOM.
  const imgPx = wrapSize
  const imgHalf = imgPx / 2

  // pxPerMm converts mm offsets (shadow offset, light position) into screen
  // px for rendering the objects at rest.
  const pxPerMm = floorHalf > 0 ? imgPx / (2 * floorHalf) : 0

  // --- Object 1: main image ---
  const restFraction = paddingPctToRadiusFraction(paddingPct)
  const restImgHalfPx = restFraction * imgHalf
  const imgResizeLiveHalfPx = drag?.kind === "image-resize" ? drag.liveSizePx : restImgHalfPx
  const imageBodyDx = drag?.kind === "image" ? drag.liveDxPx : 0
  const imageBodyDy = drag?.kind === "image" ? drag.liveDyPx : 0
  const imageOffsetPxX = offsetXMm * pxPerMm
  const imageOffsetPxY = -offsetYMm * pxPerMm
  // Live resize feedback: while an image-resize drag is in progress, scale
  // the <img> itself (transform-origin defaults to the element's own center,
  // matching the corner handles' from-center resize math) instead of only
  // moving the handles — otherwise the backdrop visibly lags behind the
  // handles until pointerup, which reads as the drag "doing nothing" until
  // release.
  const imageLiveScale = restImgHalfPx > 0 ? imgResizeLiveHalfPx / restImgHalfPx : 1
  const imageTransform = `translate(${imageOffsetPxX + imageBodyDx}px, ${imageOffsetPxY + imageBodyDy}px) scale(${imageLiveScale})`

  // --- Object 2: casing shape (always the origin — sits at wrapper center) ---
  const casingRestR = casingScreenRadius(outerRadius, floorHalf, imgPx)
  const casingLiveR = drag?.kind === "casing-resize" ? drag.liveSizePx : casingRestR
  const casingDx = drag?.kind === "casing" ? drag.liveDxPx : 0
  const casingDy = drag?.kind === "casing" ? drag.liveDyPx : 0
  const casingCx = imgHalf + casingDx
  const casingCy = imgHalf + casingDy

  // --- Object 3: lamp — casing center + light offset, follows casing drag ---
  const lampRestX = lightXMm * pxPerMm
  const lampRestY = -lightYMm * pxPerMm
  const lampLiveX = drag?.kind === "lamp" ? drag.liveDxPx : lampRestX
  const lampLiveY = drag?.kind === "lamp" ? drag.liveDyPx : lampRestY
  const lampCx = casingCx + lampLiveX
  const lampCy = casingCy + lampLiveY

  // Editor backdrop prefers the ORIGINAL uploaded silhouette (colored inputs
  // included) so brightness/contrast/saturation can be tuned visually; the
  // Shadow preview card doesn't pass originalImageUrl and keeps showing
  // pngUrl, the actual thresholded/masked render.
  const imageSrc = originalImageUrl ?? pngUrl
  // CSS filter is an approximation for instant feedback while dragging
  // sliders; the server-rendered Shadow preview PNG is the ground truth for
  // what actually gets thresholded/printed.
  const imageFilter = originalImageUrl ? buildImageFilter(cfg) : undefined

  // Casing contour color — user feedback: the overlay (especially the
  // custom-flooring image at 55% opacity) was hard to see against the dark
  // backdrop. Bumped from the previous rgba(103,232,249,...) to a solid,
  // higher-contrast cyan (#22d3ee, matching the shadow preview's casing
  // outline) at 2px, so the casing bounding box reads clearly regardless of
  // what's rendered inside it.
  const CASING_STROKE = "#22d3ee"
  const CASING_STROKE_GLOW = "rgba(34,211,238,0.35)"
  const CASING_FILL = "rgba(34,211,238,0.1)"

  function casingShapePath(): { el: React.ReactNode } {
    const r = casingLiveR
    const stroke = CASING_STROKE
    const fill = CASING_FILL
    if (shape.base === "custom" && flooringImageUrl) {
      const side = r * 2
      const x = casingCx - side / 2
      const y = casingCy - side / 2
      // When the client-side extraction (see the flooringImageUrl effect
      // above) has traced the image's actual silhouette, map that polygon's
      // bounding box onto this same [x, y, side, side] box — the identical
      // sizing rule the flooring <image> below uses (largest dimension =
      // 2*outer_radius on screen) — so the outline sits exactly on the
      // image contour and follows it live through drags/resizes. Any
      // failure/pending state (contour === null) falls back to the plain
      // bounding-box border, unchanged from before.
      let outline: React.ReactNode = (
        <>
          <rect x={x} y={y} width={side} height={side} fill="none" stroke={CASING_STROKE_GLOW} strokeWidth={5} />
          <rect x={x} y={y} width={side} height={side} rx={4} fill="none" stroke={stroke} strokeWidth={2} />
        </>
      )
      if (contour) {
        const { points, w: gridW, h: gridH } = contour
        const longSide = Math.max(gridW, gridH)
        const scale = longSide > 0 ? side / longSide : 0
        // Center the traced grid within the square box (matches
        // preserveAspectRatio="xMidYMid meet" on the <image> below).
        const offsetX = x + (side - gridW * scale) / 2
        const offsetY = y + (side - gridH * scale) / 2
        const d = contourToPath(points, scale, offsetX, offsetY)
        if (d) {
          outline = (
            <>
              <path d={d} fill="none" stroke={CASING_STROKE_GLOW} strokeWidth={5} strokeLinejoin="round" />
              <path d={d} fill={CASING_FILL} stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
            </>
          )
        }
      }
      return {
        el: (
          <>
            <image
              href={flooringImageUrl}
              x={x}
              y={y}
              width={side}
              height={side}
              opacity={0.55}
              preserveAspectRatio="xMidYMid meet"
            />
            {outline}
          </>
        ),
      }
    }
    if (shape.base === "square") {
      return { el: <rect x={casingCx - r} y={casingCy - r} width={r * 2} height={r * 2} stroke={stroke} fill={fill} strokeWidth={2} /> }
    }
    if (shape.base === "triangle") {
      const p1 = `${casingCx},${casingCy - r}`
      const p2 = `${casingCx - r},${casingCy + r}`
      const p3 = `${casingCx + r},${casingCy + r}`
      return { el: <polygon points={`${p1} ${p2} ${p3}`} stroke={stroke} fill={fill} strokeWidth={2} /> }
    }
    if (shape.base === "rect" || shape.base === "oval") {
      const ratio = shape.w / shape.h || 1
      const rx = ratio >= 1 ? r : r * ratio
      const ry = ratio >= 1 ? r / ratio : r
      if (shape.base === "oval") {
        return { el: <ellipse cx={casingCx} cy={casingCy} rx={rx} ry={ry} stroke={stroke} fill={fill} strokeWidth={2} /> }
      }
      return { el: <rect x={casingCx - rx} y={casingCy - ry} width={rx * 2} height={ry * 2} stroke={stroke} fill={fill} strokeWidth={2} /> }
    }
    return { el: <circle cx={casingCx} cy={casingCy} r={r} stroke={stroke} fill={fill} strokeWidth={2} /> }
  }

  const dragTooltip = (() => {
    if (!drag) return null
    switch (drag.kind) {
      case "image":
        return `Δx ${Math.round(drag.liveDxPx)}px / Δy ${Math.round(drag.liveDyPx)}px`
      case "image-resize":
        return `padding ~${Math.round(paddingPct)}%`
      case "casing": {
        const next = applyCasingDrag(cfg, drag.liveDxPx, drag.liveDyPx, wrapSize)
        return `offset ${next.shadow_offset_x}, ${next.shadow_offset_y} mm`
      }
      case "casing-resize": {
        const next = applyCasingResize(cfg, drag.liveSizePx, wrapSize)
        return `⌀ ${Math.round(Number(next.floor_half_size) * 2 / 10)} cm`
      }
      case "lamp": {
        const next = applyLampDrag(cfg, drag.liveDxPx, drag.liveDyPx, wrapSize)
        return `light ${next.light_x}, ${next.light_y} mm`
      }
      default:
        return null
    }
  })()

  return (
    <div className="flex w-full flex-col gap-2">
      {/* Bounded height so the preview (incl. handles at its edge) fits
          without pushing the page into scroll on a typical 1440x900
          viewport — the inner square wrapper below is sized by BOTH
          container dimensions (overlayGeometry), not width alone. */}
      <div
        ref={containerRef}
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-lg border bg-[#16181d] select-none ${heightClass}`}
      >
      {/* Canvas toolbar — zoom in/out/fit/reset, editor mode only. Zoom is a
          client-side view scale (0.5-3) on the wrapper square below; it never
          touches config, so it's purely a viewing aid. */}
      {interactive && (
        <div
          data-testid="lg-canvas-toolbar"
          className="pointer-events-auto absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-white/10 bg-black/60 p-1"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white hover:bg-white/10 hover:text-white"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => clampZoom(z - 0.25))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white hover:bg-white/10 hover:text-white"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => clampZoom(z + 0.25))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white hover:bg-white/10 hover:text-white"
            aria-label="Fit view"
            onClick={() => setZoom(1)}
          >
            <Scan className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white hover:bg-white/10 hover:text-white"
            aria-label="Reset view"
            onClick={() => setZoom(1)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      )}
      {/* Square wrapper — the actual rendered image box (object-contain can
          letterbox inside this container once it isn't square itself). The
          overlay SVG and all pointer handlers below are scoped to THIS box,
          not the outer container, so px<->mm math stays correct regardless
          of the container's aspect ratio. Zoom is applied here via CSS
          `scale()` — see adjustDeltaForZoom in canvas-math.ts for how
          pointer math compensates. */}
      <div
        ref={wrapRef}
        className="relative"
        style={
          wrapSize > 0
            ? { width: wrapSize, height: wrapSize, transform: `scale(${zoom})`, transformOrigin: "center" }
            : { width: "100%", height: "100%" }
        }
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? handlePointerUp : undefined}
        onPointerCancel={interactive ? handlePointerUp : undefined}
      >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt="Shadow preview"
          className={`object-contain ${loading || dimBackdrop ? "opacity-80" : ""}`}
          style={{
            width: restFraction * 100 + "%",
            height: restFraction * 100 + "%",
            position: "absolute",
            left: `${50 - restFraction * 50}%`,
            top: `${50 - restFraction * 50}%`,
            transform: imageTransform,
            filter: imageFilter,
            cursor: interactive ? "move" : undefined,
          }}
          draggable={false}
          onPointerDown={interactive && measured ? startDrag("image") : undefined}
        />
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>Preview gagal dimuat</span>
          {onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Coba lagi
            </Button>
          )}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Belum ada preview — ubah parameter untuk memicu
        </div>
      )}

      {loading && (
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">updating…</span>
      )}

      {interactive && imageSrc && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${imgPx || 1} ${imgPx || 1}`}
          data-testid="lg-canvas-overlay"
        >
          {/* Object 1 — main image corner handles, driven by the same box
              the <img> above renders at (imgResizeLiveHalfPx during drag). */}
          {[
            { x: -1, y: -1, cursor: "nwse-resize" },
            { x: 1, y: -1, cursor: "nesw-resize" },
            { x: -1, y: 1, cursor: "nesw-resize" },
            { x: 1, y: 1, cursor: "nwse-resize" },
          ].map((c, i) => (
            <rect
              key={`img-${i}`}
              data-testid="lg-image-handle"
              className={hitClass}
              x={imgHalf + imageOffsetPxX + imageBodyDx + c.x * imgResizeLiveHalfPx - HANDLE_R / 2}
              y={imgHalf + imageOffsetPxY + imageBodyDy + c.y * imgResizeLiveHalfPx - HANDLE_R / 2}
              width={HANDLE_R}
              height={HANDLE_R}
              fill="rgba(226,232,240,0.95)"
              stroke="black"
              strokeWidth={1}
              style={{ cursor: c.cursor, pointerEvents: "none" }}
            />
          ))}
          {[
            { x: -1, y: -1, cursor: "nwse-resize" },
            { x: 1, y: -1, cursor: "nesw-resize" },
            { x: -1, y: 1, cursor: "nesw-resize" },
            { x: 1, y: 1, cursor: "nwse-resize" },
          ].map((c, i) => (
            <rect
              key={`img-hit-${i}`}
              data-testid="lg-image-handle-hit"
              className={hitClass}
              x={imgHalf + imageOffsetPxX + imageBodyDx + c.x * imgResizeLiveHalfPx - HANDLE_HIT / 2}
              y={imgHalf + imageOffsetPxY + imageBodyDy + c.y * imgResizeLiveHalfPx - HANDLE_HIT / 2}
              width={HANDLE_HIT}
              height={HANDLE_HIT}
              fill="transparent"
              style={{ cursor: c.cursor }}
              onPointerDown={startDrag("image-resize", imgResizeLiveHalfPx)}
            />
          ))}

          {/* Object 2 — casing shape overlay + corner handles */}
          <g
            className={hitClass}
            style={{ cursor: "move" }}
            onPointerDown={startDrag("casing")}
          >
            {casingShapePath().el}
          </g>
          {[
            { x: -1, y: -1, cursor: "nwse-resize" },
            { x: 1, y: -1, cursor: "nesw-resize" },
            { x: -1, y: 1, cursor: "nesw-resize" },
            { x: 1, y: 1, cursor: "nwse-resize" },
          ].map((c, i) => (
            <rect
              key={`casing-${i}`}
              data-testid="lg-casing-handle"
              className={hitClass}
              x={casingCx + c.x * casingLiveR - HANDLE_R / 2}
              y={casingCy + c.y * casingLiveR - HANDLE_R / 2}
              width={HANDLE_R}
              height={HANDLE_R}
              fill="rgba(103,232,249,0.95)"
              stroke="white"
              strokeWidth={1}
              style={{ cursor: c.cursor, pointerEvents: "none" }}
            />
          ))}
          {[
            { x: -1, y: -1, cursor: "nwse-resize" },
            { x: 1, y: -1, cursor: "nesw-resize" },
            { x: -1, y: 1, cursor: "nesw-resize" },
            { x: 1, y: 1, cursor: "nwse-resize" },
          ].map((c, i) => (
            <rect
              key={`casing-hit-${i}`}
              data-testid="lg-casing-handle-hit"
              className={hitClass}
              x={casingCx + c.x * casingLiveR - HANDLE_HIT / 2}
              y={casingCy + c.y * casingLiveR - HANDLE_HIT / 2}
              width={HANDLE_HIT}
              height={HANDLE_HIT}
              fill="transparent"
              style={{ cursor: c.cursor }}
              onPointerDown={startDrag("casing-resize", casingLiveR)}
            />
          ))}

          {/* Object 3 — lamp: amber dot + glow ring, follows the casing group */}
          <circle
            data-testid="lg-lamp-handle"
            className={hitClass}
            cx={lampCx}
            cy={lampCy}
            r={LAMP_R + 4}
            fill="rgba(251,191,36,0.25)"
          />
          <circle
            className={hitClass}
            cx={lampCx}
            cy={lampCy}
            r={LAMP_R}
            fill="rgba(251,191,36,0.95)"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: "move" }}
            onPointerDown={startDrag("lamp")}
          />
        </svg>
      )}

      {canConfig && imageSrc && (
        <div className="pointer-events-none absolute inset-0">
          {dragTooltip && (
            <span className="absolute left-2 bottom-2 pointer-events-none rounded bg-black/70 px-2 py-0.5 text-xs text-white">
              {dragTooltip}
            </span>
          )}
          {!dragTooltip && (
            <span className="absolute left-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              floor ⌀ {Math.round(floorHalf * 2 / 10)} cm
            </span>
          )}
          <span className="pointer-events-auto absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {autoFit ? (
              <button type="button" onClick={enableAutoFit} className="underline" disabled>
                Auto
              </button>
            ) : (
              <>
                {paddingPct}%{" "}
                <button type="button" onClick={enableAutoFit} className="underline">
                  Auto
                </button>
              </>
            )}
          </span>
        </div>
      )}
      </div>
      </div>
    </div>
  )
}
