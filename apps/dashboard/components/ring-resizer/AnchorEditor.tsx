"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"
import type { ThreeEvent } from "@react-three/fiber"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import type { RingAnchorRow } from "@/lib/hooks/use-ring-models"
import { defaultUp, rotateUp, type V3 } from "./anchor-math"
import { Viewport } from "./viewer/Viewport"

interface DraftAnchor {
  pos: V3
  normal: V3
  up: V3
  rotationDeg: number
  textHeightMm: number
  depthMm: number
}

function rowToDraft(a: RingAnchorRow): DraftAnchor {
  return {
    pos: [a.posX, a.posY, a.posZ],
    normal: [a.normX, a.normY, a.normZ],
    up: [a.upX, a.upY, a.upZ],
    rotationDeg: 0,
    textHeightMm: a.textHeightMm,
    depthMm: a.depthMm,
  }
}

function effectiveUp(a: DraftAnchor): V3 {
  return a.rotationDeg === 0 ? a.up : rotateUp(a.normal, a.up, a.rotationDeg)
}

interface ModelFrame {
  center: V3
  radius: number
}

/** Marker: sphere + text plate + up arrow, hover-highlighted, click-to-select. */
function AnchorMarker({
  a,
  selected,
  previewText,
  onSelect,
}: {
  a: DraftAnchor
  selected: boolean
  previewText: string
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const up = effectiveUp(a)
  const quat = useMemo(() => {
    const z = new THREE.Vector3(...a.normal).normalize()
    const y = new THREE.Vector3(...up)
    const x = new THREE.Vector3().crossVectors(y, z).normalize()
    const yy = new THREE.Vector3().crossVectors(z, x)
    const m = new THREE.Matrix4().makeBasis(x, yy, z)
    return new THREE.Quaternion().setFromRotationMatrix(m)
  }, [a.normal, up])

  // text plate sized roughly: width ≈ 0.62 * height * chars
  const w = Math.max(2, previewText.length * a.textHeightMm * 0.62)
  const h = a.textHeightMm * 1.4
  const hot = selected || hovered
  return (
    <group position={a.pos} quaternion={quat}>
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSelect()
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial
          color={selected ? "#6366f1" : "#d8b24a"}
          emissive={selected ? "#6366f1" : "#d8b24a"}
          emissiveIntensity={hot ? 0.8 : 0.25}
        />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={hot ? 0.55 : 0.25} side={THREE.DoubleSide} />
      </mesh>
      <arrowHelper args={[new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0.1), h, 0x21d07a, h * 0.3, h * 0.2]} />
    </group>
  )
}

/**
 * Draggable rotation ring around the selected anchor, generalized to an
 * arbitrary surface normal (the stl-cutter original was axis-aligned only).
 * The handle sits where the text "up" points; dragging it calls onRotate with
 * the signed angle (degrees) from the anchor's base up, around its normal.
 */
function RotationRing({ anchor, onRotate }: { anchor: DraftAnchor; onRotate: (deg: number) => void }) {
  const { camera, gl } = useThree()
  const getThree = useThree((s) => s.get)
  const groupRef = useRef<THREE.Group>(null)
  const offsetRef = useRef(0)
  const [hov, setHov] = useState(false)

  const radius = Math.max(5, anchor.textHeightMm * 2.2)
  const n = useMemo(() => new THREE.Vector3(...anchor.normal).normalize(), [anchor.normal])
  const baseUp = useMemo(() => new THREE.Vector3(...anchor.up).normalize(), [anchor.up])

  const ringQuat = useMemo(() => {
    // any basis with local +Z on the normal works — the torus is symmetric
    const x = new THREE.Vector3().crossVectors(baseUp, n).normalize()
    const y = new THREE.Vector3().crossVectors(n, x)
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n))
  }, [n, baseUp])

  const upDir = effectiveUp(anchor)
  const handleLocal: V3 = [
    anchor.pos[0] + upDir[0] * radius,
    anchor.pos[1] + upDir[1] * radius,
    anchor.pos[2] + upDir[2] * radius,
  ]

  // Signed angle (deg) of the pointer around the anchor normal, measured from
  // the base up direction: theta = atan2(n · (up × d), up · d).
  const getAngleDeg = useCallback(
    (clientX: number, clientY: number): number | null => {
      const group = groupRef.current
      if (!group) return null
      const rect = gl.domElement.getBoundingClientRect()
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      )
      // World-space plane through the anchor (the centering group offsets it)
      const centerWorld = group.localToWorld(new THREE.Vector3(...anchor.pos))
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, centerWorld)
      const hit = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(plane, hit)) return null
      const d = hit.sub(centerWorld)
      const cross = new THREE.Vector3().crossVectors(baseUp, d)
      return (Math.atan2(n.dot(cross), baseUp.dot(d)) * 180) / Math.PI
    },
    [camera, gl, n, baseUp, anchor.pos],
  )

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      // controls fetched imperatively (not hook-subscribed) so the event
      // handler may toggle it without the compiler flagging a render mutation
      const controls = getThree().controls as OrbitControlsImpl | undefined
      if (controls) controls.enabled = false
      const start = getAngleDeg(e.clientX, e.clientY)
      offsetRef.current = (start ?? anchor.rotationDeg) - anchor.rotationDeg
      const onMove = (ev: PointerEvent) => {
        const ang = getAngleDeg(ev.clientX, ev.clientY)
        if (ang === null) return
        let deg = Math.round(ang - offsetRef.current)
        while (deg > 180) deg -= 360
        while (deg < -180) deg += 360
        onRotate(deg)
      }
      const onUp = () => {
        if (controls) controls.enabled = true
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [getThree, getAngleDeg, anchor.rotationDeg, onRotate],
  )

  return (
    <group ref={groupRef}>
      <mesh position={anchor.pos} quaternion={ringQuat}>
        <torusGeometry args={[radius, 0.25, 8, 48]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={hov ? 0.7 : 0.35} />
      </mesh>
      <mesh
        position={handleLocal}
        onPointerDown={onPointerDown}
        onPointerEnter={() => setHov(true)}
        onPointerLeave={() => setHov(false)}
      >
        <sphereGeometry args={[1.2, 12, 12]} />
        <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={hov ? 0.8 : 0.4} />
      </mesh>
    </group>
  )
}

function PartMesh({
  url,
  xray,
  onPick,
  onLoaded,
}: {
  url: string
  xray: boolean
  onPick: (pos: V3, normal: V3) => void
  onLoaded?: (frame: ModelFrame) => void
}) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(url)
      const buf = await res.arrayBuffer()
      const geo = new STLLoader().parse(buf)
      geo.computeVertexNormals()
      geo.computeBoundingSphere()
      if (!cancelled) {
        setGeometry(geo)
        const bs = geo.boundingSphere
        if (bs) onLoaded?.({ center: [bs.center.x, bs.center.y, bs.center.z], radius: bs.radius })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url, onLoaded])

  if (!geometry) return null
  return (
    <mesh
      geometry={geometry}
      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (!e.face) return
        // The centering group translates this mesh, so `e.point` is WORLD
        // space per three's Mesh.raycast — convert back to local so saved
        // anchors stay in base-STL coordinates. `e.face.normal` is already
        // object-local (never world-transformed by the raycaster).
        const local = e.object.worldToLocal(e.point.clone())
        const nrm = e.face.normal.clone().normalize()
        onPick([local.x, local.y, local.z], [nrm.x, nrm.y, nrm.z])
      }}
    >
      <meshStandardMaterial
        color="#8a8f98"
        metalness={0.35}
        roughness={0.45}
        side={THREE.DoubleSide}
        transparent={xray}
        opacity={xray ? 0.35 : 1}
        depthWrite={!xray}
      />
    </mesh>
  )
}

export interface AnchorEditorProps {
  partId: string
  initialAnchors: RingAnchorRow[]
  onClose: () => void
  onSaved: () => Promise<void>
}

export function AnchorEditor({ partId, initialAnchors, onClose, onSaved }: AnchorEditorProps) {
  const [anchors, setAnchors] = useState<DraftAnchor[]>(initialAnchors.map(rowToDraft))
  const [selected, setSelected] = useState<number | null>(initialAnchors.length ? 0 : null)
  const [previewText, setPreviewText] = useState("US 8")
  const [frame, setFrame] = useState<ModelFrame | null>(null)
  const [xray, setXray] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sel = selected !== null ? anchors[selected] : undefined

  function pick(pos: V3, normal: V3) {
    const draft: DraftAnchor = {
      pos,
      normal,
      up: defaultUp(normal),
      rotationDeg: 0,
      textHeightMm: 3,
      depthMm: 0.5,
    }
    setAnchors((xs) => {
      const next = [...xs, draft]
      setSelected(next.length - 1)
      return next
    })
  }

  function patchSel(patch: Partial<DraftAnchor>) {
    if (selected === null) return
    setAnchors((xs) => xs.map((a, i) => (i === selected ? { ...a, ...patch } : a)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/ring-resizer/parts/${partId}/anchors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchors: anchors.map((a) => ({
            pos: a.pos,
            normal: a.normal,
            up: effectiveUp(a),
            textHeightMm: a.textHeightMm,
            depthMm: a.depthMm,
          })),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Model is re-anchored to the origin via a centering group. We control the
  // offset ourselves (unlike drei <Center>) so anchor world positions stay
  // computable for the orbit-target tween.
  const negCenter: V3 = frame ? [-frame.center[0], -frame.center[1], -frame.center[2]] : [0, 0, 0]
  const orbitTarget = useMemo<[number, number, number] | undefined>(() => {
    if (!sel || !frame) return undefined
    return [sel.pos[0] - frame.center[0], sel.pos[1] - frame.center[1], sel.pos[2] - frame.center[2]]
  }, [sel, frame])

  const gridSize = frame ? Math.ceil((frame.radius * 3) / 10) * 10 : 80

  return (
    <div className="glass-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold g-t1">Atur Anchor Engrave</div>
        <div className="text-xs g-t4">
          dbl-click permukaan = tambah anchor · klik marker = fokus · drag cincin ungu = rotasi · F = fit · O = ortho
        </div>
      </div>

      <div className="h-[520px] overflow-hidden rounded-xl border border-white/10">
        <Viewport
          fit
          sceneKey={partId}
          orbitTarget={orbitTarget}
          gridSize={gridSize}
          extraButtons={
            <button
              type="button"
              onClick={() => setXray((v) => !v)}
              title="Tembus pandang — lihat anchor di permukaan dalam"
              className={`select-none rounded px-2 py-1 text-xs transition-colors ${
                xray ? "bg-lime-600/80 text-white" : "bg-black/40 text-white/60 hover:bg-black/60 hover:text-white"
              }`}
            >
              {xray ? "◎ Solid" : "○ X-Ray"}
            </button>
          }
        >
          <group position={negCenter}>
            <PartMesh
              url={`/api/ring-resizer/parts/${partId}/file`}
              xray={xray}
              onPick={pick}
              onLoaded={setFrame}
            />
            {anchors.map((a, i) => (
              <AnchorMarker
                key={i}
                a={a}
                selected={i === selected}
                previewText={previewText}
                onSelect={() => setSelected((cur) => (cur === i ? null : i))}
              />
            ))}
            {sel && <RotationRing anchor={sel} onRotate={(deg) => patchSel({ rotationDeg: deg })} />}
          </group>
        </Viewport>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 g-t4">
          Preview text
          <input
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            className="glass-input rounded-lg px-2 py-1.5"
          />
        </label>
        <label className="flex items-center gap-2 g-t4">
          Anchor
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value === "" ? null : Number(e.target.value))}
            className="glass-input rounded-lg px-2 py-1.5"
          >
            <option value="">—</option>
            {anchors.map((_, i) => (
              <option key={i} value={i}>
                #{i + 1}
              </option>
            ))}
          </select>
        </label>
        {sel && (
          <>
            <label className="flex items-center gap-2 g-t4">
              Rotasi {sel.rotationDeg}°
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={sel.rotationDeg}
                onChange={(e) => patchSel({ rotationDeg: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-2 g-t4">
              Tinggi huruf (mm)
              <input
                type="number"
                step={0.5}
                min={1}
                max={20}
                value={sel.textHeightMm}
                onChange={(e) => patchSel({ textHeightMm: Number(e.target.value) })}
                className="glass-input w-16 rounded-lg px-2 py-1.5"
              />
            </label>
            <label className="flex items-center gap-2 g-t4">
              Kedalaman (mm)
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={3}
                value={sel.depthMm}
                onChange={(e) => patchSel({ depthMm: Number(e.target.value) })}
                className="glass-input w-16 rounded-lg px-2 py-1.5"
              />
            </label>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 font-semibold g-t3 hover:bg-red-500/10"
              onClick={() => {
                if (selected === null) return
                setAnchors((xs) => xs.filter((_, i) => i !== selected))
                setSelected(null)
              }}
            >
              Hapus anchor
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {error && <span className="text-xs g-t3">{error}</span>}
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold g-t3">
          Batal
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Menyimpan…" : "Simpan Anchor"}
        </button>
      </div>
    </div>
  )
}
