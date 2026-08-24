"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Center } from "@react-three/drei"
import * as THREE from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"
import type { ThreeEvent } from "@react-three/fiber"
import type { RingAnchorRow } from "@/lib/hooks/use-ring-models"
import { defaultUp, rotateUp, type V3 } from "./anchor-math"

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

/** Simple 3D marker at each anchor: sphere + up arrow + text plate outline. */
function AnchorMarker({ a, selected, previewText }: { a: DraftAnchor; selected: boolean; previewText: string }) {
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
  return (
    <group position={a.pos} quaternion={quat}>
      <mesh>
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshStandardMaterial color={selected ? "#6366f1" : "#d8b24a"} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={selected ? 0.55 : 0.25} side={THREE.DoubleSide} />
      </mesh>
      <arrowHelper args={[new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0.1), h, 0x21d07a, h * 0.3, h * 0.2]} />
    </group>
  )
}

function PartMesh({ url, onPick }: { url: string; onPick: (pos: V3, normal: V3) => void }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(url)
      const buf = await res.arrayBuffer()
      const geo = new STLLoader().parse(buf)
      geo.computeVertexNormals()
      if (!cancelled) setGeometry(geo)
    })()
    return () => { cancelled = true }
  }, [url])

  if (!geometry) return null
  return (
    <mesh
      geometry={geometry}
      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (!e.face) return
        // `<Center>` (drei) wraps this mesh in a translated ancestor group,
        // so `e.point` is WORLD space (local vertex + center offset) per
        // three's Mesh.raycast (intersection point is explicitly transformed
        // via object.matrixWorld) — NOT the mesh's own local/base-STL space.
        // Convert back to local space so saved anchors, and freshly placed
        // markers (siblings of this mesh inside the same <Center>), land at
        // the same base-STL coordinates as anchors loaded from the DB.
        const local = e.object.worldToLocal(e.point.clone())
        // `e.face.normal`, by contrast, is computed by three from local-space
        // triangle vertices (Mesh.getVertexPosition returns local space) and
        // is never transformed to world — it's already correct as-is. (Also
        // moot here either way: <Center> only translates, and a pure
        // translation doesn't change normal directions.)
        const n = e.face.normal.clone().normalize()
        onPick([local.x, local.y, local.z], [n.x, n.y, n.z])
      }}
    >
      <meshStandardMaterial color="#8a8f98" metalness={0.35} roughness={0.45} side={THREE.DoubleSide} />
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
  const [selected, setSelected] = useState(0)
  const [previewText, setPreviewText] = useState("US 8")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sel = anchors[selected]

  function pick(pos: V3, normal: V3) {
    const draft: DraftAnchor = {
      pos, normal, up: defaultUp(normal), rotationDeg: 0, textHeightMm: 3, depthMm: 0.5,
    }
    // Compute the new anchor's index from the functional updater's own `xs`
    // rather than the closed-over `anchors`, which may be stale relative to
    // pending state updates.
    setAnchors((xs) => {
      const next = [...xs, draft]
      setSelected(next.length - 1)
      return next
    })
  }

  function patchSel(patch: Partial<DraftAnchor>) {
    setAnchors((xs) => xs.map((a, i) => (i === selected ? { ...a, ...patch } : a)))
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/ring-resizer/parts/${partId}/anchors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchors: anchors.map((a) => ({
            pos: a.pos, normal: a.normal, up: effectiveUp(a),
            textHeightMm: a.textHeightMm, depthMm: a.depthMm,
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

  return (
    <div className="glass-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold g-t1">Atur Anchor Engrave</div>
        <div className="text-xs g-t4">double-click permukaan = tambah anchor</div>
      </div>

      <div className="h-[520px] overflow-hidden rounded-xl border border-white/10">
        <Canvas camera={{ position: [0, -40, 25], fov: 45, near: 0.1, far: 2000 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[30, -30, 50]} intensity={1.2} />
          <Suspense fallback={null}>
            <Center>
              <PartMesh url={`/api/ring-resizer/parts/${partId}/file`} onPick={pick} />
              {anchors.map((a, i) => (
                <AnchorMarker key={i} a={a} selected={i === selected} previewText={previewText} />
              ))}
            </Center>
          </Suspense>
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 g-t4">
          Preview text
          <input value={previewText} onChange={(e) => setPreviewText(e.target.value)}
            className="glass-input rounded-lg px-2 py-1.5" />
        </label>
        <label className="flex items-center gap-2 g-t4">
          Anchor
          <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}
            className="glass-input rounded-lg px-2 py-1.5">
            {anchors.map((_, i) => <option key={i} value={i}>#{i + 1}</option>)}
          </select>
        </label>
        {sel && (
          <>
            <label className="flex items-center gap-2 g-t4">
              Rotasi {sel.rotationDeg}°
              <input type="range" min={-180} max={180} step={5} value={sel.rotationDeg}
                onChange={(e) => patchSel({ rotationDeg: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2 g-t4">
              Tinggi huruf (mm)
              <input type="number" step={0.5} min={1} max={20} value={sel.textHeightMm}
                onChange={(e) => patchSel({ textHeightMm: Number(e.target.value) })}
                className="glass-input w-16 rounded-lg px-2 py-1.5" />
            </label>
            <label className="flex items-center gap-2 g-t4">
              Kedalaman (mm)
              <input type="number" step={0.1} min={0.1} max={3} value={sel.depthMm}
                onChange={(e) => patchSel({ depthMm: Number(e.target.value) })}
                className="glass-input w-16 rounded-lg px-2 py-1.5" />
            </label>
            <button type="button" className="rounded-lg px-3 py-1.5 font-semibold g-t3 hover:bg-red-500/10"
              onClick={() => { setAnchors((xs) => xs.filter((_, i) => i !== selected)); setSelected(0) }}>
              Hapus anchor
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {error && <span className="text-xs g-t3">{error}</span>}
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold g-t3">Batal</button>
        <button type="button" onClick={save} disabled={busy}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Menyimpan…" : "Simpan Anchor"}
        </button>
      </div>
    </div>
  )
}
