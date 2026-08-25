"use client"

import { useRef, useEffect, useState, useMemo } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls, Bounds, GizmoHelper, GizmoViewcube, useBounds } from "@react-three/drei"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import type { ReactNode } from "react"
import { BuildPlate } from "./BuildPlate"

// Ported from the stl-cutter project's shared Viewport (same author/stack):
// z-up damped orbit, gizmo viewcube with snap + 90° roll, focus-to-fit (F),
// ortho/persp toggle (O), smooth orbit-pivot tween on object selection.

const HAS_WEBGL =
  typeof window !== "undefined" &&
  typeof (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext !== "undefined"

// Rendered inside Bounds context — wires the bounds.refresh().fit() call
// to a ref so the overlay button and F-key shortcut can trigger it from outside.
function FocusHelper({ focusRef }: { focusRef: React.MutableRefObject<(() => void) | undefined> }) {
  const bounds = useBounds()
  useEffect(() => {
    focusRef.current = () => bounds.refresh().fit()
  }, [bounds, focusRef])
  return null
}

type TweenState = {
  from: THREE.Vector3
  to: THREE.Vector3
  // Optional orbit-target tween — used when selecting an object.
  // Camera position stays fixed; only the orbit pivot moves.
  targetFrom?: THREE.Vector3
  targetTo?: THREE.Vector3
  progress: number
}

// ── Inner Canvas component ───────────────────────────────────────────────────
// Handles:
//   1. Ortho/Persp switch — creates a new camera preserving current position
//   2. Roll tween — smooth 90° rotation when re-clicking a snapped face
//   3. Orbit-target tween — smooth pivot change when an object is selected
//   4. Snap detection — fires onSnapChange so the HTML overlay enables/disables
function CameraController({
  isOrtho,
  orbitTarget: orbitTargetProp,
  orbitPivot,
  cameraRef,
  tweenRef,
  snapAxisRef,
  onSnapChange,
}: {
  isOrtho: boolean
  orbitTarget?: [number, number, number]
  orbitPivot: [number, number, number]
  cameraRef: React.MutableRefObject<THREE.Camera | null>
  tweenRef: React.MutableRefObject<TweenState | null>
  snapAxisRef: React.MutableRefObject<[number, number, number] | null>
  onSnapChange: (snapped: boolean) => void
}) {
  const { camera, set, size } = useThree()
  const controls = useThree((s) => s.controls as OrbitControlsImpl | undefined)
  const prevIsOrtho = useRef<boolean | null>(null)
  const wasSnapped = useRef(false)
  const prevOrbitTarget = useRef<[number, number, number] | undefined>(undefined)

  const defaultPivot = useMemo(
    () => new THREE.Vector3(...orbitPivot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orbitPivot[0], orbitPivot[1], orbitPivot[2]],
  )

  // Keep cameraRef fresh so the outer roll handler can read it.
  useEffect(() => {
    cameraRef.current = camera
  }, [camera, cameraRef])

  // ── Orbit-target change: tween pivot to selected object centre ────────────
  useEffect(() => {
    if (!controls) return
    const same =
      orbitTargetProp === prevOrbitTarget.current ||
      (orbitTargetProp &&
        prevOrbitTarget.current &&
        Math.abs(orbitTargetProp[0] - prevOrbitTarget.current[0]) < 0.001 &&
        Math.abs(orbitTargetProp[1] - prevOrbitTarget.current[1]) < 0.001 &&
        Math.abs(orbitTargetProp[2] - prevOrbitTarget.current[2]) < 0.001)
    if (same) return
    prevOrbitTarget.current = orbitTargetProp

    const targetTo = orbitTargetProp ? new THREE.Vector3(...orbitTargetProp) : defaultPivot.clone()

    tweenRef.current = {
      from: camera.position.clone(),
      to: camera.position.clone(), // camera doesn't move
      targetFrom: controls.target.clone(),
      targetTo,
      progress: 0,
    }
  }, [orbitTargetProp]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ortho / Persp switch ──────────────────────────────────────────────────
  useEffect(() => {
    if (prevIsOrtho.current === null) {
      prevIsOrtho.current = isOrtho
      return
    }
    if (prevIsOrtho.current === isOrtho) return
    prevIsOrtho.current = isOrtho

    const pos = camera.position.clone()
    const up = camera.up.clone()
    const pivot = controls?.target.clone() ?? defaultPivot.clone()
    const dist = pos.distanceTo(pivot)

    let newCam: THREE.Camera
    if (isOrtho) {
      const halfH = dist * Math.tan((40 * Math.PI) / 180 / 2)
      const halfW = halfH * (size.width / size.height)
      const oc = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 100_000)
      oc.position.copy(pos)
      oc.up.copy(up)
      oc.lookAt(pivot)
      oc.updateProjectionMatrix()
      newCam = oc
    } else {
      const pc = new THREE.PerspectiveCamera(40, size.width / size.height, 0.1, 10_000)
      pc.position.copy(pos)
      pc.up.copy(up)
      pc.lookAt(pivot)
      pc.updateProjectionMatrix()
      newCam = pc
    }
    set({ camera: newCam as unknown as THREE.PerspectiveCamera })
  }, [isOrtho, size.width, size.height]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    // ── Drive tween (roll OR orbit-target) ─────────────────────────────────
    if (tweenRef.current) {
      const tw = tweenRef.current
      tw.progress = Math.min(1, tw.progress + delta * 5) // ~200 ms
      const ease = 1 - Math.pow(1 - tw.progress, 3) // ease-out cubic

      // Camera position (roll animation — target* fields absent for roll tweens)
      if (!tw.targetFrom) {
        camera.position.lerpVectors(tw.from, tw.to, ease)
        camera.up.set(0, 0, 1)
        camera.lookAt(controls?.target ?? defaultPivot)
      }

      // Orbit target (selection focus — camera position stays fixed)
      if (tw.targetFrom && tw.targetTo && controls) {
        controls.target.lerpVectors(tw.targetFrom, tw.targetTo, ease)
        controls.update()
      }

      if (tw.progress >= 1) tweenRef.current = null
      if (!tw.targetFrom) return // skip snap detection during roll tween
    }

    // ── Axis-aligned snap detection ─────────────────────────────────────────
    const pivot = controls?.target ?? defaultPivot
    const rel = camera.position.clone().sub(pivot)
    const dist = rel.length()
    if (dist < 0.001) {
      if (wasSnapped.current) {
        wasSnapped.current = false
        snapAxisRef.current = null
        onSnapChange(false)
      }
      return
    }
    const ax = rel.x / dist,
      ay = rel.y / dist,
      az = rel.z / dist
    const isAxisAligned = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(az)) > 0.9995

    if (isAxisAligned !== wasSnapped.current) {
      wasSnapped.current = isAxisAligned
      snapAxisRef.current = isAxisAligned ? [ax, ay, az] : null
      onSnapChange(isAxisAligned)
    } else if (isAxisAligned) {
      snapAxisRef.current = [ax, ay, az]
    }
  })

  return null
}

// ── Public component ─────────────────────────────────────────────────────────
export function Viewport({
  children,
  fit = false,
  sceneKey,
  orbitTarget,
  cameraPos = [60, -60, 40],
  orbitPivot = [0, 0, 0],
  gridSize = 80,
  gridCell = 5,
  gridSection = 25,
  extraButtons,
}: {
  children?: ReactNode
  fit?: boolean
  sceneKey?: string | number
  /** World-space point to orbit around. When undefined, uses orbitPivot. */
  orbitTarget?: [number, number, number]
  /** Initial camera position. */
  cameraPos?: [number, number, number]
  /** OrbitControls initial target / pivot. */
  orbitPivot?: [number, number, number]
  gridSize?: number
  gridCell?: number
  gridSection?: number
  /** Extra HTML overlay buttons rendered next to Focus/Ortho. */
  extraButtons?: ReactNode
}) {
  const focusRef = useRef<(() => void) | undefined>(undefined)
  const cameraRef = useRef<THREE.Camera | null>(null)
  const tweenRef = useRef<TweenState | null>(null)
  const snapAxisRef = useRef<[number, number, number] | null>(null)
  const [isOrtho, setIsOrtho] = useState(false)
  const [isSnapped, setIsSnapped] = useState(false)

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "f" || e.key === "F") focusRef.current?.()
      if (e.key === "o" || e.key === "O") setIsOrtho((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ── Gizmo-area click: roll 90° when already snapped ──────────────────────
  function handleGizmoAreaClick() {
    if (tweenRef.current) return
    const snap = snapAxisRef.current
    const cam = cameraRef.current
    if (!snap || !cam) return
    if (Math.abs(snap[2]) > 0.9) return // Top/Bottom — no-op

    // Roll around the current orbit pivot, not a fixed bed centre.
    const t = new THREE.Vector3(...(orbitTarget ?? orbitPivot))
    const rel = cam.position.clone().sub(t)
    tweenRef.current = {
      from: cam.position.clone(),
      to: t.clone().add(new THREE.Vector3(-rel.y, rel.x, rel.z)),
      progress: 0,
    }
  }

  if (!HAS_WEBGL) {
    return <div data-testid="viewport-placeholder" className="h-full w-full" />
  }

  const body = fit ? (
    <Bounds key={sceneKey} fit clip margin={1.3}>
      <FocusHelper focusRef={focusRef} />
      {children}
    </Bounds>
  ) : (
    children
  )

  return (
    <div className="relative h-full w-full">
      {/* ── Bottom-left overlay buttons ─────────────────────────────────── */}
      <div className="absolute bottom-2 left-2 z-10 flex gap-1">
        {fit && (
          <button
            type="button"
            onClick={() => focusRef.current?.()}
            title="Focus ke objek (F)"
            className="select-none rounded bg-black/40 px-2 py-1 text-xs text-white/60 hover:bg-black/60 hover:text-white"
          >
            ⊡ Focus
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOrtho((v) => !v)}
          title="Toggle orthographic (O)"
          className={`select-none rounded px-2 py-1 text-xs transition-colors ${
            isOrtho
              ? "bg-indigo-600/70 text-white hover:bg-indigo-500/80"
              : "bg-black/40 text-white/60 hover:bg-black/60 hover:text-white"
          }`}
        >
          {isOrtho ? "⬡ Ortho" : "○ Persp"}
        </button>
        {extraButtons}
      </div>

      {/* ── Gizmo-area click interceptor ────────────────────────────────── */}
      <div
        className="absolute bottom-0 right-0 z-10"
        style={{ width: 80, height: 80, pointerEvents: isSnapped ? "auto" : "none" }}
        title={isSnapped ? "Klik untuk putar 90°" : undefined}
        onClick={handleGizmoAreaClick}
      />

      <Canvas
        className="h-full w-full"
        camera={{ position: cameraPos, fov: 40, up: [0, 0, 1], near: 0.1, far: 10_000 }}
      >
        {/* Ambient: very low so directional lights create visible shadow contrast */}
        <ambientLight intensity={0.15} />
        {/* Key light: upper-right-front — main shading, strong */}
        <directionalLight position={[5, -3, 8]} intensity={2.0} />
        {/* Fill light: lower-left-back — softer counter-light, reveals back details */}
        <directionalLight position={[-4, 4, -5]} intensity={0.6} />

        <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={orbitPivot} />

        <CameraController
          isOrtho={isOrtho}
          orbitTarget={orbitTarget}
          orbitPivot={orbitPivot}
          cameraRef={cameraRef}
          tweenRef={tweenRef}
          snapAxisRef={snapAxisRef}
          onSnapChange={setIsSnapped}
        />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewcube faces={["Right", "Left", "Front", "Back", "Top", "Bottom"]} />
        </GizmoHelper>

        <axesHelper args={[30]} />
        <BuildPlate size={gridSize} cellSize={gridCell} sectionSize={gridSection} />

        {body}
      </Canvas>
    </div>
  )
}
