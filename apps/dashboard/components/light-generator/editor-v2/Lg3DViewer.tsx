"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { Canvas, useLoader } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"
import * as THREE from "three"
import { Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { casingOuterRadius, stemGizmoTransforms, zLightMm } from "./three-math"

export interface Lg3DViewerProps {
  stlUrl: string | null
  config: Record<string, unknown>
  stale?: boolean
}

/**
 * Presentational shell around the r3f Canvas: fullscreen toggle, hint
 * overlay, stale badge, and empty-state text. Kept separate from the r3f
 * bits so it's SSR/jsdom-testable without touching WebGL — r3f's Canvas
 * can't render outside a real browser context.
 */
export function Lg3DViewerShell({
  hasStl,
  stale,
  children,
}: {
  hasStl: boolean
  stale?: boolean
  children: React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "relative h-screen w-screen bg-[#111827]"
          : "relative h-[52vh] min-h-[380px] w-full overflow-hidden rounded-lg border bg-[#111827]"
      }
    >
      {!hasStl && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">
          Belum ada STL — generate dulu
        </div>
      )}

      {stale && (
        <div className="absolute left-2 top-2 z-10 rounded bg-amber-500/90 px-2 py-1 text-xs font-medium text-amber-950">
          STL stale
        </div>
      )}

      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute right-2 top-2 z-10 h-7 w-7"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Keluar fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </Button>

      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-[11px] text-slate-300">
        Left-drag: rotate · Scroll: zoom · Right-drag: pan
      </div>

      {children}
    </div>
  )
}

/** Loads and centers the STL mesh, mirroring v1's LgStlViewer centering
 * convention: translate so bbox min z = 0, x/y centered. */
function StlMesh({ stlUrl }: { stlUrl: string }) {
  const geometry = useLoader(STLLoader, stlUrl)
  const centered = geometry.clone()
  centered.computeBoundingBox()
  const bb = centered.boundingBox
  if (bb) {
    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2
    centered.translate(-cx, -cy, -bb.min.z)
  }
  centered.computeVertexNormals()

  return (
    <mesh geometry={centered}>
      <meshStandardMaterial color="#1d4ed8" roughness={0.35} metalness={0.15} />
    </mesh>
  )
}

/** Lightweight wireframe context scene, drawn from config alone (no STL
 * dependency) so it's visible even before/without a generated STL: the
 * casing wall outline at outer_radius, an LED disc at the approximated
 * light height, and violet stem gizmo boxes from user_stems. */
function ContextScene({ config }: { config: Record<string, unknown> }) {
  const radius = casingOuterRadius(config)
  const zLight = zLightMm(config)
  const stems = stemGizmoTransforms(config)

  return (
    <group>
      {/* Casing wall outline: a flat footprint ring at z=0. RingGeometry
          already lies in the local XY plane by default, which — in this
          scene's z-up (generator) world convention — IS the horizontal
          "floor" plane, so no rotation is needed. (A previous version
          rotated this 90° around X, which is only correct for a y-up
          scene; combined with the y-up default camera `up` below, it made
          the whole context scene, including the stem gizmos, render
          tilted/sideways instead of upright.) */}
      <mesh>
        <ringGeometry args={[radius - 1, radius, 64]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>

      {/* LED disc at approximated light height */}
      <mesh position={[0, 0, zLight]}>
        <circleGeometry args={[Math.min(8, radius * 0.08), 24]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Stem gizmos */}
      {stems.map((stem) => (
        <mesh key={stem.id} position={[stem.x, stem.y, stem.z]}>
          <boxGeometry args={[2, 2, Math.max(stem.height, 0.5)]} />
          <meshBasicMaterial color="#8b5cf6" transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function Scene({ stlUrl, config }: { stlUrl: string | null; config: Record<string, unknown> }) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[200, 200, 400]} intensity={1.2} color="#fff5e0" />
      <directionalLight position={[-200, 0, 100]} intensity={0.35} color="#6080ff" />
      <ContextScene config={config} />
      {stlUrl && (
        <Suspense fallback={null}>
          <StlMesh stlUrl={stlUrl} />
        </Suspense>
      )}
      <OrbitControls makeDefault enableDamping />
    </>
  )
}

/**
 * v2 editor 3D tab: react-three-fiber STL viewer with a light wireframe
 * context scene (wall, LED, stems), fullscreen toggle, and a stale badge.
 * Client-only — mount via `next/dynamic(..., { ssr: false })` from the page,
 * since r3f's Canvas depends on WebGL/DOM APIs unavailable during SSR.
 */
export default function Lg3DViewer({ stlUrl, config, stale }: Lg3DViewerProps) {
  return (
    <Lg3DViewerShell hasStl={!!stlUrl} stale={stale}>
      {/* `up: [0, 0, 1]` is required because this scene's world convention
          is z-up (matches the STL/generator space per three-math.ts's doc
          comment — the loaded STL is centered but never rotated). Three.js
          cameras default to y-up; leaving that default meant OrbitControls
          and the initial lookAt() framed "up" as world Y, so the model's
          real vertical axis (Z) rendered sideways — the stem gizmos (thin
          vertical boxes elongated along Z) looked tilted/horizontal even
          though their world-space geometry was correct. */}
      <Canvas camera={{ position: [250, -250, 200], up: [0, 0, 1], fov: 45, near: 0.1, far: 5000 }}>
        <Scene stlUrl={stlUrl} config={config} />
      </Canvas>
    </Lg3DViewerShell>
  )
}
