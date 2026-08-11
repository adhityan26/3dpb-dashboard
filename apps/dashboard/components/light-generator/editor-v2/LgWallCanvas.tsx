"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  wallPxToThetaZ,
  thetaZToWallPx,
  stemAngularWidthDeg,
  upsertStem,
  removeStem,
  wallZRange,
  anchorAllIslands,
  type UserStem,
  type Island,
} from "./wall-math"

interface LgWallCanvasProps {
  pngUrl: string | null
  loading: boolean
  config: Record<string, unknown>
  onConfigChange: (next: Record<string, unknown>) => void
  /** Island centroids from the /check-islands chain (theta_deg, z_mm), drawn
   * as red dots so the operator can see what "Anchor all islands" will
   * target before clicking it. */
  islands?: Island[]
  error?: boolean
  onRetry?: () => void
}

/** Minimum pointer travel (px) before a press on the canvas counts as a
 * DRAG rather than a click — same threshold/rationale as LgCanvas2D: a bare
 * click must never write a stem. */
const DRAG_THRESHOLD_PX = 3

const PIN_HEAD_R = 6
const PIN_HIT_R = 22

type DragKind = "add" | "move" | null

interface DragState {
  kind: DragKind
  stemId: string | null
  startX: number
  startY: number
  liveXPx: number
  liveYPx: number
  moved: boolean
}

/**
 * Wall (θ,z) tab canvas — the server-rendered wall-unwrap PNG (full
 * circumference across the width, z_max at the top row) doubles as a
 * direct-manipulation stem editor:
 *
 *   - Click empty area   -> ADD a stem at that (theta, z)
 *   - Drag an existing pin -> MOVE it (commit on release)
 *   - Click a pin to select, then Delete/Backspace or the ✕ badge -> REMOVE
 *
 * All commits go through onConfigChange (single source of truth), same
 * pattern as LgCanvas2D.
 */
export function LgWallCanvas({
  pngUrl,
  loading,
  config,
  onConfigChange,
  islands = [],
  error = false,
  onRetry,
}: LgWallCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const appliedRef = useRef(false)

  const userStems: UserStem[] = Array.isArray(config.user_stems)
    ? (config.user_stems as UserStem[])
    : []
  const { zMinMm, zMaxMm } = wallZRange(config)
  const stemWidth = Number(config.stem_width) || 2
  const nStencilTheta = Number(config.n_stencil_theta) || 512
  const angularWidthDeg = stemAngularWidthDeg(stemWidth, nStencilTheta)
  const coverType = config.cover_type === "top" ? "top" : "bottom"

  function measure(el: HTMLDivElement) {
    const rect = el.getBoundingClientRect()
    // Only update state when the size actually changed — a fresh object every
    // render from the ref callback would trigger an infinite re-render loop
    // ("maximum update depth exceeded").
    setWrapSize((prev) =>
      prev && prev.w === rect.width && prev.h === rect.height
        ? prev
        : { w: rect.width, h: rect.height },
    )
  }

  function getRect(): DOMRect | null {
    return wrapRef.current?.getBoundingClientRect() ?? null
  }

  function toLocalPx(clientX: number, clientY: number): { xPx: number; yPx: number } {
    const rect = getRect()
    if (!rect) return { xPx: 0, yPx: 0 }
    return { xPx: clientX - rect.left, yPx: clientY - rect.top }
  }

  function startAdd(e: React.PointerEvent) {
    if (!wrapRef.current) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    appliedRef.current = false
    const { xPx, yPx } = toLocalPx(e.clientX, e.clientY)
    setDrag({ kind: "add", stemId: null, startX: e.clientX, startY: e.clientY, liveXPx: xPx, liveYPx: yPx, moved: false })
  }

  function startMove(stem: UserStem) {
    return (e: React.PointerEvent) => {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      appliedRef.current = false
      setSelectedId(stem.id)
      const { xPx, yPx } = thetaZToWallPx(stem.theta_deg, stem.z_mm, wrapSize.w, wrapSize.h, zMinMm, zMaxMm)
      setDrag({ kind: "move", stemId: stem.id, startX: e.clientX, startY: e.clientY, liveXPx: xPx, liveYPx: yPx, moved: false })
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const moved = drag.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
    const { xPx, yPx } = toLocalPx(e.clientX, e.clientY)
    setDrag({ ...drag, liveXPx: xPx, liveYPx: yPx, moved })
  }

  function handlePointerUp() {
    if (!drag || appliedRef.current) {
      setDrag(null)
      return
    }
    appliedRef.current = true
    if (drag.kind === "add") {
      // A click (no movement) still adds a stem at the click point — unlike
      // LgCanvas2D's body drags, "click to add" IS the primary add gesture
      // here, so the threshold only distinguishes add-at-click-point vs
      // add-at-drag-end (both are valid; we always use the final position).
      const { thetaDeg, zMm } = wallPxToThetaZ(drag.liveXPx, drag.liveYPx, wrapSize.w, wrapSize.h, zMinMm, zMaxMm)
      const id = `stem-${Date.now()}-${Math.round(Math.random() * 1000)}`
      onConfigChange(upsertStem(config, { id, theta_deg: thetaDeg, z_mm: zMm }))
      setSelectedId(id)
    } else if (drag.kind === "move" && drag.stemId) {
      if (!drag.moved) {
        // Plain click on an existing pin: just selects it (already done in
        // startMove), no config write.
        setDrag(null)
        return
      }
      const { thetaDeg, zMm } = wallPxToThetaZ(drag.liveXPx, drag.liveYPx, wrapSize.w, wrapSize.h, zMinMm, zMaxMm)
      onConfigChange(upsertStem(config, { id: drag.stemId, theta_deg: thetaDeg, z_mm: zMm }))
    }
    setDrag(null)
  }

  function deleteStem(id: string) {
    onConfigChange(removeStem(config, id))
    if (selectedId === id) setSelectedId(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      e.preventDefault()
      deleteStem(selectedId)
    }
  }

  function handleAnchorAll() {
    onConfigChange(anchorAllIslands(config, islands, stemWidth, nStencilTheta))
  }

  const measured = wrapSize.w > 0 && wrapSize.h > 0

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-2 py-0.5 text-xs">{userStems.length} stems</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={islands.length === 0}
          onClick={handleAnchorAll}
        >
          Anchor all islands
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Klik untuk pasang stem · drag untuk geser · Del untuk hapus
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-lg border bg-[#16181d] select-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {pngUrl ? (
          <div
            ref={(el) => {
              wrapRef.current = el
              if (el) measure(el)
            }}
            className="relative w-full"
            onPointerDown={startAdd}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              src={pngUrl}
              alt="Wall unwrap preview"
              className={`block w-full ${loading ? "opacity-80" : ""}`}
              draggable={false}
              onLoad={(e) => measure(e.currentTarget.parentElement as HTMLDivElement)}
            />

            {measured && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 ${wrapSize.w} ${wrapSize.h}`}
                data-testid="lg-wall-overlay"
              >
                {/* Island centroids — red dots, drawn under the stem pins. */}
                {islands.map((island, i) => {
                  const { xPx, yPx } = thetaZToWallPx(island.theta_deg, island.z_mm, wrapSize.w, wrapSize.h, zMinMm, zMaxMm)
                  return (
                    <circle
                      key={`island-${i}`}
                      data-testid="lg-wall-island-dot"
                      cx={xPx}
                      cy={yPx}
                      r={4}
                      fill="#f87171"
                      stroke="white"
                      strokeWidth={1}
                    />
                  )
                })}

                {/* User stems — solid violet band spanning the stem's real
                    angular width, anchored from the wall edge nearest the
                    stem base (top cover -> anchored from the top edge down
                    to z; bottom cover -> anchored from the bottom edge up
                    to z), + a head dot at (theta, z). */}
                {userStems.map((stem) => {
                  const isDraggingThis = drag?.kind === "move" && drag.stemId === stem.id
                  const headX = isDraggingThis ? drag.liveXPx : thetaZToWallPx(stem.theta_deg, stem.z_mm, wrapSize.w, wrapSize.h, zMinMm, zMaxMm).xPx
                  const headY = isDraggingThis ? drag.liveYPx : thetaZToWallPx(stem.theta_deg, stem.z_mm, wrapSize.w, wrapSize.h, zMinMm, zMaxMm).yPx
                  const halfWidthPx = wrapSize.w > 0 ? (angularWidthDeg / 360) * wrapSize.w / 2 : 0
                  const topYPx = thetaZToWallPx(0, zMaxMm, wrapSize.w, wrapSize.h, zMinMm, zMaxMm).yPx
                  const bottomYPx = thetaZToWallPx(0, zMinMm, wrapSize.w, wrapSize.h, zMinMm, zMaxMm).yPx
                  const bandTop = coverType === "top" ? topYPx : Math.min(headY, bottomYPx)
                  const bandBottom = coverType === "top" ? Math.max(headY, topYPx) : bottomYPx
                  const isSelected = selectedId === stem.id
                  return (
                    <g key={stem.id}>
                      <rect
                        data-testid="lg-wall-stem-band"
                        x={headX - halfWidthPx}
                        y={Math.min(bandTop, bandBottom)}
                        width={Math.max(1, halfWidthPx * 2)}
                        height={Math.max(1, Math.abs(bandBottom - bandTop))}
                        fill="#a78bfa"
                        opacity={0.6}
                      />
                      <circle
                        data-testid="lg-wall-stem-hit"
                        className="pointer-events-auto"
                        cx={headX}
                        cy={headY}
                        r={PIN_HIT_R / 2}
                        fill="transparent"
                        style={{ cursor: "move" }}
                        onPointerDown={startMove(stem)}
                      />
                      <circle
                        data-testid="lg-wall-stem-head"
                        cx={headX}
                        cy={headY}
                        r={PIN_HEAD_R}
                        fill={isSelected ? "#f5d0fe" : "#a78bfa"}
                        stroke={isSelected ? "#7c3aed" : "white"}
                        strokeWidth={isSelected ? 2 : 1}
                      />
                      {isSelected && (
                        <g
                          className="pointer-events-auto"
                          style={{ cursor: "pointer" }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            deleteStem(stem.id)
                          }}
                        >
                          <circle cx={headX + 12} cy={headY - 12} r={7} fill="#ef4444" stroke="white" strokeWidth={1} />
                          <text x={headX + 12} y={headY - 8} fontSize={10} textAnchor="middle" fill="white">
                            ✕
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </svg>
            )}

            {loading && (
              <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">updating…</span>
            )}
          </div>
        ) : error ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>Preview gagal dimuat</span>
            {onRetry && (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                Coba lagi
              </Button>
            )}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Belum ada preview — ubah parameter untuk memicu
          </div>
        )}
      </div>
    </div>
  )
}
