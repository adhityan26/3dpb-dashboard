"use client"

import { useEffect, useRef, useState } from "react"
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
} from "./canvas-math"

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
const LAMP_R = 5

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
  const [drag, setDrag] = useState<DragState | null>(null)
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

  function getImgPx(): number {
    return wrapRef.current?.getBoundingClientRect().width ?? 0
  }

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
      setDrag({ kind, startX: e.clientX, startY: e.clientY, liveDxPx: 0, liveDyPx: 0, liveSizePx: initialSizePx })
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (drag.kind === "image-resize" || drag.kind === "casing-resize") {
      const { cx, cy } = getCenter()
      const r = Math.hypot(e.clientX - cx, e.clientY - cy)
      setDrag({ ...drag, liveSizePx: r })
    } else {
      setDrag({ ...drag, liveDxPx: dx, liveDyPx: dy })
    }
  }

  function handlePointerUp() {
    if (!drag || !onConfigChange || appliedRef.current) {
      setDrag(null)
      return
    }
    appliedRef.current = true
    const imgPx = getImgPx()
    const imgHalf = imgPx / 2
    // Exactly one applier per gesture, writing only its own config keys —
    // this switch is the single source of truth for "which object is
    // active", so a gesture can never touch more than one object's config.
    switch (drag.kind) {
      case "image":
        if (drag.liveDxPx !== 0 || drag.liveDyPx !== 0) {
          onConfigChange(applyOffsetDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPx))
        }
        break
      case "image-resize": {
        const f = imgHalf > 0 ? drag.liveSizePx / imgHalf : 0
        onConfigChange(applyImageResize(cfg, f))
        break
      }
      case "casing":
        if (drag.liveDxPx !== 0 || drag.liveDyPx !== 0) {
          onConfigChange(applyCasingDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPx))
        }
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
  const imageTransform = `translate(${imageOffsetPxX + imageBodyDx}px, ${imageOffsetPxY + imageBodyDy}px)`

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

  function casingShapePath(): { el: React.ReactNode } {
    const r = casingLiveR
    const stroke = "rgba(103,232,249,0.9)" // cyan
    const fill = "rgba(103,232,249,0.12)"
    if (shape.base === "custom" && flooringImageUrl) {
      const side = r * 2
      return {
        el: (
          <image
            href={flooringImageUrl}
            x={casingCx - side / 2}
            y={casingCy - side / 2}
            width={side}
            height={side}
            opacity={0.55}
            preserveAspectRatio="xMidYMid meet"
          />
        ),
      }
    }
    if (shape.base === "square") {
      return { el: <rect x={casingCx - r} y={casingCy - r} width={r * 2} height={r * 2} stroke={stroke} fill={fill} strokeWidth={1.5} /> }
    }
    if (shape.base === "triangle") {
      const p1 = `${casingCx},${casingCy - r}`
      const p2 = `${casingCx - r},${casingCy + r}`
      const p3 = `${casingCx + r},${casingCy + r}`
      return { el: <polygon points={`${p1} ${p2} ${p3}`} stroke={stroke} fill={fill} strokeWidth={1.5} /> }
    }
    if (shape.base === "rect" || shape.base === "oval") {
      const ratio = shape.w / shape.h || 1
      const rx = ratio >= 1 ? r : r * ratio
      const ry = ratio >= 1 ? r / ratio : r
      if (shape.base === "oval") {
        return { el: <ellipse cx={casingCx} cy={casingCy} rx={rx} ry={ry} stroke={stroke} fill={fill} strokeWidth={1.5} /> }
      }
      return { el: <rect x={casingCx - rx} y={casingCy - ry} width={rx * 2} height={ry * 2} stroke={stroke} fill={fill} strokeWidth={1.5} /> }
    }
    return { el: <circle cx={casingCx} cy={casingCy} r={r} stroke={stroke} fill={fill} strokeWidth={1.5} /> }
  }

  const dragTooltip = (() => {
    if (!drag) return null
    switch (drag.kind) {
      case "image":
        return `Δx ${Math.round(drag.liveDxPx)}px / Δy ${Math.round(drag.liveDyPx)}px`
      case "image-resize":
        return `padding ~${Math.round(paddingPct)}%`
      case "casing": {
        const imgPxNow = getImgPx()
        const next = applyCasingDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPxNow)
        return `offset ${next.shadow_offset_x}, ${next.shadow_offset_y} mm`
      }
      case "casing-resize": {
        const imgPxNow = getImgPx()
        const next = applyCasingResize(cfg, drag.liveSizePx, imgPxNow)
        return `⌀ ${Math.round(Number(next.floor_half_size) * 2 / 10)} cm`
      }
      case "lamp": {
        const imgPxNow = getImgPx()
        const next = applyLampDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPxNow)
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
      {/* Square wrapper — the actual rendered image box (object-contain can
          letterbox inside this container once it isn't square itself). The
          overlay SVG and all pointer handlers below are scoped to THIS box,
          not the outer container, so px<->mm math stays correct regardless
          of the container's aspect ratio. */}
      <div
        ref={wrapRef}
        className="relative"
        style={wrapSize > 0 ? { width: wrapSize, height: wrapSize } : { width: "100%", height: "100%" }}
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
          onPointerDown={interactive ? startDrag("image") : undefined}
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
              className="pointer-events-auto"
              x={imgHalf + imageOffsetPxX + imageBodyDx + c.x * imgResizeLiveHalfPx - HANDLE_R / 2}
              y={imgHalf + imageOffsetPxY + imageBodyDy + c.y * imgResizeLiveHalfPx - HANDLE_R / 2}
              width={HANDLE_R}
              height={HANDLE_R}
              fill="rgba(226,232,240,0.95)"
              stroke="black"
              strokeWidth={1}
              style={{ cursor: c.cursor }}
              onPointerDown={startDrag("image-resize", imgResizeLiveHalfPx)}
            />
          ))}

          {/* Object 2 — casing shape overlay + corner handles */}
          <g
            className="pointer-events-auto"
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
              className="pointer-events-auto"
              x={casingCx + c.x * casingLiveR - HANDLE_R / 2}
              y={casingCy + c.y * casingLiveR - HANDLE_R / 2}
              width={HANDLE_R}
              height={HANDLE_R}
              fill="rgba(103,232,249,0.95)"
              stroke="white"
              strokeWidth={1}
              style={{ cursor: c.cursor }}
              onPointerDown={startDrag("casing-resize", casingLiveR)}
            />
          ))}

          {/* Object 3 — lamp: amber dot + glow ring, follows the casing group */}
          <circle
            data-testid="lg-lamp-handle"
            className="pointer-events-auto"
            cx={lampCx}
            cy={lampCy}
            r={LAMP_R + 4}
            fill="rgba(251,191,36,0.25)"
          />
          <circle
            className="pointer-events-auto"
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
