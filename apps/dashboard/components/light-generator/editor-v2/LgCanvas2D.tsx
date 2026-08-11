"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  applyOffsetDrag,
  applyFloorResizeDrag,
  applyPaddingDrag,
  paddingPctToRadiusFraction,
  overlayGeometry,
} from "./canvas-math"

interface LgCanvas2DProps {
  pngUrl: string | null
  loading: boolean
  config?: Record<string, unknown>
  onConfigChange?: (next: Record<string, unknown>) => void
  /** Forces edit mode on regardless of local UI state — used by SSR markup
   * tests to assert the ring/handle overlays render without simulating a
   * click. Defaults to off (clean preview) like real first render. */
  defaultEditMode?: boolean
}

/** Inset (px) subtracted from the measured square so edge handles (whose
 * center sits exactly on the ring, radius 6-7px) never get clipped by the
 * container's overflow-hidden boundary. */
const WRAP_INSET_PX = 16

type DragKind = "body" | "floor" | "padding" | null

interface DragState {
  kind: DragKind
  startX: number
  startY: number
  // live values shown during drag, in screen px relative to image center
  liveDxPx: number
  liveDyPx: number
  liveRadiusPx: number
}

/**
 * Canvas Shadow tab — the PNG preview doubles as a direct-manipulation
 * editor. Three hit targets layered over the image, no mode toggle:
 *   - body drag (anywhere not on a handle) -> shadow_offset_x/y
 *   - floor ring handle (top, at the image edge) -> floor_half_size
 *   - padding ring handles (4 cardinal points, inner ring) -> mask_padding_pct
 * All commits happen on pointerup via onConfigChange; drag-in-progress state
 * stays local (optimistic CSS transform / live ring redraw) per the "no
 * internal config copies" rule.
 */
export function LgCanvas2D({
  pngUrl,
  loading,
  config,
  onConfigChange,
  defaultEditMode = false,
}: LgCanvas2DProps) {
  // View-only toggle: rings/handles/drag are opt-in so the preview (which
  // already shows the casing outline + light position) isn't cluttered by
  // default. Never touches config — purely local UI state.
  const [editModeState, setEditModeState] = useState(defaultEditMode)
  const editMode = defaultEditMode || editModeState
  const containerRef = useRef<HTMLDivElement | null>(null)
  // The wrapper is the actual rendered image square (object-contain can
  // letterbox inside a non-square container in the wide grid layout) — all
  // pointer math and overlay rendering must use ITS rect, not the outer
  // container's, or every px<->mm mapping and ring radius drifts whenever
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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const { size } = overlayGeometry(rect.width, rect.height)
      // Small inset so edge handles (floor ring hugs the image boundary)
      // never get clipped by the container's overflow-hidden edge.
      setWrapSize(Math.max(0, size - WRAP_INSET_PX))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function getImgPx(): number {
    return wrapRef.current?.getBoundingClientRect().width ?? 0
  }

  function getCenter(): { cx: number; cy: number } {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return { cx: 0, cy: 0 }
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
  }

  function startBodyDrag(e: React.PointerEvent) {
    if (!onConfigChange || drag) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    appliedRef.current = false
    setDrag({ kind: "body", startX: e.clientX, startY: e.clientY, liveDxPx: 0, liveDyPx: 0, liveRadiusPx: 0 })
  }

  function startRingDrag(kind: "floor" | "padding") {
    return (e: React.PointerEvent) => {
      if (!onConfigChange || drag) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      const { cx, cy } = getCenter()
      const r = Math.hypot(e.clientX - cx, e.clientY - cy)
      appliedRef.current = false
      setDrag({ kind, startX: e.clientX, startY: e.clientY, liveDxPx: 0, liveDyPx: 0, liveRadiusPx: r })
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    if (drag.kind === "body") {
      setDrag({ ...drag, liveDxPx: e.clientX - drag.startX, liveDyPx: e.clientY - drag.startY })
    } else if (drag.kind === "floor" || drag.kind === "padding") {
      const { cx, cy } = getCenter()
      const r = Math.hypot(e.clientX - cx, e.clientY - cy)
      setDrag({ ...drag, liveRadiusPx: r })
    }
  }

  function handlePointerUp() {
    if (!drag || !onConfigChange || appliedRef.current) {
      setDrag(null)
      return
    }
    appliedRef.current = true
    const imgPx = getImgPx()
    // Exactly one applier per gesture, writing only its own config keys —
    // this switch is the single source of truth for "which mode is active",
    // so a gesture can never touch more than one of offset/floor/padding.
    switch (drag.kind) {
      case "body":
        if (drag.liveDxPx !== 0 || drag.liveDyPx !== 0) {
          onConfigChange(applyOffsetDrag(cfg, drag.liveDxPx, drag.liveDyPx, imgPx))
        }
        break
      case "floor":
        onConfigChange(applyFloorResizeDrag(cfg, drag.liveRadiusPx, imgPx))
        break
      case "padding":
        onConfigChange(applyPaddingDrag(cfg, drag.liveRadiusPx, imgPx))
        break
    }
    setDrag(null)
  }

  function enableAutoFit() {
    onConfigChange?.({ ...cfg, auto_fit_mask: true })
  }

  // canConfig gates the (always-visible) info chips + Auto button — those
  // aren't drag overlays and stay usable regardless of edit mode. interactive
  // additionally gates the ring/handle overlay + body drag, which only make
  // sense once edit mode is on.
  const canConfig = !!onConfigChange
  const interactive = canConfig && editMode
  // viewBox uses the wrapper's real measured px so ring radii computed from
  // real pointer coordinates (getCenter/getImgPx above) map 1:1 onto the SVG
  // — no separate "logical" unit space to drift out of sync with the DOM.
  const imgPx = wrapSize
  const imgHalf = imgPx / 2

  const liveFloorRadius = drag?.kind === "floor" ? drag.liveRadiusPx : imgHalf
  const liveFloorPx = drag && drag.kind === "floor" ? liveFloorRadius : imgHalf
  const restPaddingFraction = paddingPctToRadiusFraction(paddingPct)
  const livePaddingRadius = drag?.kind === "padding" ? drag.liveRadiusPx : restPaddingFraction * imgHalf

  const bodyTransform = drag?.kind === "body"
    ? `translate(${drag.liveDxPx}px, ${drag.liveDyPx}px)`
    : undefined

  return (
    <div className="flex w-full flex-col gap-2">
      {canConfig && (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant={editModeState ? "default" : "outline"}
            onClick={() => setEditModeState((v) => !v)}
            disabled={defaultEditMode}
          >
            Edit
          </Button>
        </div>
      )}
      {/* Bounded height so the square preview (incl. handles at its edge)
          always fits without pushing the page into scroll on a typical
          1440x900 viewport — the inner square wrapper below is sized by
          BOTH container dimensions (overlayGeometry), not width alone. */}
      <div
        ref={containerRef}
        className="relative flex h-[calc(100vh-240px)] min-h-[420px] w-full items-center justify-center overflow-hidden rounded-lg border bg-[#16181d] select-none"
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
      {pngUrl ? (
        <img
          src={pngUrl}
          alt="Shadow preview"
          className={`h-full w-full object-contain ${loading ? "opacity-60" : ""}`}
          style={{ transform: bodyTransform, cursor: interactive ? "move" : undefined }}
          draggable={false}
          onPointerDown={interactive ? startBodyDrag : undefined}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Belum ada preview — ubah parameter untuk memicu
        </div>
      )}

      {loading && (
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">updating…</span>
      )}

      {interactive && pngUrl && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${imgPx || 1} ${imgPx || 1}`}
          data-testid="lg-canvas-overlay"
        >
          {/* Floor ring — hugs the image edge, one handle at top */}
          <circle
            cx={imgHalf}
            cy={imgHalf}
            r={liveFloorPx}
            fill="none"
            stroke="rgba(99,179,237,0.8)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
          <circle
            data-testid="lg-floor-handle"
            className="pointer-events-auto"
            cx={imgHalf}
            cy={imgHalf - liveFloorPx}
            r={7}
            fill="rgba(99,179,237,0.95)"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: "ns-resize" }}
            onPointerDown={startRingDrag("floor")}
          />

          {/* Padding ring — inner circle, 4 cardinal handles, ghosted when auto */}
          <circle
            cx={imgHalf}
            cy={imgHalf}
            r={livePaddingRadius}
            fill="none"
            stroke="rgba(246,173,85,0.85)"
            strokeWidth={1.5}
            opacity={autoFit ? 0.5 : 1}
            className={autoFit ? "" : "pointer-events-auto"}
          />
          {!autoFit && (
            <>
              {[
                { x: imgHalf, y: imgHalf - livePaddingRadius },
                { x: imgHalf, y: imgHalf + livePaddingRadius },
                { x: imgHalf - livePaddingRadius, y: imgHalf },
                { x: imgHalf + livePaddingRadius, y: imgHalf },
              ].map((p, i) => (
                <circle
                  key={i}
                  data-testid="lg-padding-handle"
                  className="pointer-events-auto"
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill="rgba(246,173,85,0.95)"
                  stroke="white"
                  strokeWidth={1}
                  style={{ cursor: "nesw-resize" }}
                  onPointerDown={startRingDrag("padding")}
                />
              ))}
            </>
          )}
        </svg>
      )}

      {canConfig && pngUrl && (
        <div className="pointer-events-none absolute inset-0">
          {drag?.kind === "body" && (
            <span className="absolute left-2 bottom-2 pointer-events-none rounded bg-black/70 px-2 py-0.5 text-xs text-white">
              Δx {Math.round(drag.liveDxPx)}px / Δy {Math.round(drag.liveDyPx)}px
            </span>
          )}
          {drag?.kind !== "body" && (
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
