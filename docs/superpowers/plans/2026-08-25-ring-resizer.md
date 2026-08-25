# Ring Resizer + Engraver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modul `ring-resizer` di `apps/dashboard`: setup anchor engrave per part cincin (viewer 3D) + produksi STL ter-scale & ter-engrave per order, download ZIP.

**Architecture:** Logika mesh murni di `lib/ring-resizer/` (Node: manifold-3d WASM untuk boolean, opentype.js untuk glyph, fallback three-bvh-csg), REST API tipis di `app/api/ring-resizer/`, UI React sebagai tab baru di seksi Produk (`components/ring-resizer/`), blob STL di MinIO, metadata di Prisma/PostgreSQL.

**Tech Stack:** Next.js 16 (App Router, Node 22), Prisma 7 + PostgreSQL, MinIO via `@aws-sdk/client-s3`, `manifold-3d`, `opentype.js`, `three-bvh-csg`, `fflate`, three ^0.185 + `@react-three/fiber`/`drei` (sudah terpasang), vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-ring-resizer-design.md`

## Global Constraints

- Repo: worktree `.claude/worktrees/ring-resizer`, branch `claude/ring-resizer`. JANGAN kerja di folder master. JANGAN `git add -A` — selalu `git add <path spesifik>`.
- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` di awal tiap sesi shell (default shell mesin ini Node v10 rusak).
- Semua command dijalankan dari root worktree kecuali disebut lain. Test: `pnpm --filter shopee-dashboard test` (vitest, environment `node`, globals on).
- Komentar kode & pesan commit dalam Bahasa Inggris.
- UI: token Glass `g-t1`…`g-t5` untuk warna teks (JANGAN hex), dicek light & dark. Halaman `/produk` sudah dibungkus `PageShell` — jangan tambah `PageShell`/`<main>` baru di dalam tab.
- Rumus sizing (paritas dengan calculator existing): `keliling = 2.55 × US + 36.5 (mm)`, `diameter = keliling ÷ π`, `scale = (diameter + kelonggaran) ÷ baseBoreMm`. Kelonggaran default 0.3 mm. Base bore GL 2026 = 23.871 mm.
- Engrave SETELAH scaling; posisi anchor dikalikan scale, `textHeightMm`/`depthMm` TIDAK.
- Prisma client: `import { prisma } from "@/lib/db"`. Auth di route: `const session = await auth()` dari `@/lib/auth`, 401 bila `!session?.user`.
- Next 16: `params` di route handler adalah Promise (`{ params }: { params: Promise<{ id: string }> }` lalu `await params`).
- JANGAN deploy ke homelab — deploy hanya saat user minta.

---

### Task 1: Dependencies, font asset, Prisma schema

**Files:**
- Modify: `apps/dashboard/package.json` (deps via pnpm)
- Create: `apps/dashboard/public/fonts/engrave.ttf` (Archivo Black, OFL)
- Modify: `apps/dashboard/prisma/schema.prisma` (append 3 model)
- Create: `apps/dashboard/prisma/migrations/<timestamp>_add_ring_resizer/` (generated)

**Interfaces:**
- Produces: npm packages `manifold-3d`, `opentype.js`, `three-bvh-csg`, `fflate`; font di `public/fonts/engrave.ttf`; tabel Prisma `RingModel`, `RingPart`, `RingAnchor` (nama field persis seperti di bawah — dipakai Task 8–9).

- [ ] **Step 1: Install dependencies**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd ~/Documents/shopee-analysis/.claude/worktrees/ring-resizer
pnpm install
pnpm --filter shopee-dashboard add manifold-3d opentype.js three-bvh-csg fflate
```

Expected: sukses; `apps/dashboard/package.json` bertambah 4 dependency.

- [ ] **Step 2: Download font engrave (Archivo Black — satu weight statis, tebal, cocok engraving)**

```bash
mkdir -p apps/dashboard/public/fonts
curl -L -o apps/dashboard/public/fonts/engrave.ttf \
  "https://github.com/google/fonts/raw/main/ofl/archivoblack/ArchivoBlack-Regular.ttf"
ls -la apps/dashboard/public/fonts/engrave.ttf   # harus > 50KB
```

Kalau URL berubah/gagal: cari "Archivo Black" di github.com/google/fonts (folder `ofl/archivoblack/`) dan pakai TTF-nya. Font lain boleh asal statis (bukan variable font) dan tebal — tapi nama file tetap `engrave.ttf`.

- [ ] **Step 3: Tambah model Prisma** — append di akhir `apps/dashboard/prisma/schema.prisma`:

```prisma
// ── Ring Resizer (3D tools — resize + engrave STL cincin) ────────────────────

model RingModel {
  id         String     @id @default(cuid())
  name       String
  baseBoreMm Float
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  parts      RingPart[]
}

model RingPart {
  id        String       @id @default(cuid())
  modelId   String
  model     RingModel    @relation(fields: [modelId], references: [id], onDelete: Cascade)
  name      String
  sizeBytes Int
  triCount  Int
  createdAt DateTime     @default(now())
  anchors   RingAnchor[]

  @@index([modelId])
}

model RingAnchor {
  id           String   @id @default(cuid())
  partId       String
  part         RingPart @relation(fields: [partId], references: [id], onDelete: Cascade)
  posX         Float
  posY         Float
  posZ         Float
  normX        Float
  normY        Float
  normZ        Float
  upX          Float
  upY          Float
  upZ          Float
  textHeightMm Float    @default(3)
  depthMm      Float    @default(0.5)

  @@index([partId])
}
```

- [ ] **Step 4: Buat migration**

```bash
cd apps/dashboard
npx prisma migrate dev --name add_ring_resizer
```

Kalau `DATABASE_URL` tidak menunjuk DB dev yang hidup (cek `.env`/`.env.local`), pakai `npx prisma migrate dev --name add_ring_resizer --create-only` lalu `npx prisma generate` — migration akan dijalankan saat deploy. Verifikasi: `npx prisma validate` → "The schema … is valid".

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/shopee-analysis/.claude/worktrees/ring-resizer
git add apps/dashboard/package.json pnpm-lock.yaml apps/dashboard/public/fonts/engrave.ttf apps/dashboard/prisma
git commit -m "feat(ring-resizer): add deps, engrave font, prisma models"
```

---

### Task 2: Sizing math (`lib/ring-resizer/sizing.ts`)

**Files:**
- Create: `apps/dashboard/lib/ring-resizer/sizing.ts`
- Test: `apps/dashboard/lib/ring-resizer/__tests__/sizing.test.ts`

**Interfaces:**
- Produces:
  - `type SizeMode = "us" | "dia" | "circ"`
  - `interface ScaleResult { scale: number; targetDiaMm: number; usEquivalent: number; circMm: number }`
  - `computeScale(opts: { mode: SizeMode; value: number; clearanceMm: number; baseBoreMm: number }): ScaleResult`

- [ ] **Step 1: Write the failing test** — `apps/dashboard/lib/ring-resizer/__tests__/sizing.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { computeScale } from "../sizing"

describe("computeScale", () => {
  // Parity with the existing GL2026 resize calculator HTML:
  // US 8 → circ 56.9mm, dia 18.112mm; +0.3 clearance → 18.412 / 23.871 = 0.77132…
  it("US size mode matches legacy calculator numbers", () => {
    const r = computeScale({ mode: "us", value: 8, clearanceMm: 0.3, baseBoreMm: 23.871 })
    expect(r.circMm).toBeCloseTo(56.9, 4)
    expect(r.targetDiaMm).toBeCloseTo(18.4121, 3)
    expect(r.scale).toBeCloseTo(0.771316, 5)
    expect(r.usEquivalent).toBeCloseTo(8, 5)
  })

  it("diameter mode is identity on diameter", () => {
    const r = computeScale({ mode: "dia", value: 18.1, clearanceMm: 0, baseBoreMm: 23.871 })
    expect(r.targetDiaMm).toBeCloseTo(18.1, 6)
    expect(r.scale).toBeCloseTo(18.1 / 23.871, 6)
  })

  it("circumference mode converts via pi", () => {
    const r = computeScale({ mode: "circ", value: 57, clearanceMm: 0, baseBoreMm: 23.871 })
    expect(r.targetDiaMm).toBeCloseTo(57 / Math.PI, 6)
  })

  it("rejects non-positive input", () => {
    expect(() => computeScale({ mode: "us", value: 0, clearanceMm: 0.3, baseBoreMm: 23.871 })).toThrow()
    expect(() => computeScale({ mode: "dia", value: 18, clearanceMm: 0.3, baseBoreMm: 0 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer
```

Expected: FAIL — cannot resolve `../sizing`.

- [ ] **Step 3: Write implementation** — `apps/dashboard/lib/ring-resizer/sizing.ts`:

```ts
// Sizing math shared by the production form and the /process API.
// Formula parity with the legacy GL2026 resize-calculator HTML:
//   circ = 2.55 * US + 36.5 (mm), dia = circ / PI, scale = (dia + clearance) / baseBore

export type SizeMode = "us" | "dia" | "circ"

export interface ScaleResult {
  scale: number
  targetDiaMm: number
  usEquivalent: number
  circMm: number
}

export function usToCirc(us: number): number {
  return 2.55 * us + 36.5
}

export function diaToUs(diaMm: number): number {
  return (diaMm * Math.PI - 36.5) / 2.55
}

export function computeScale(opts: {
  mode: SizeMode
  value: number
  clearanceMm: number
  baseBoreMm: number
}): ScaleResult {
  const { mode, value, clearanceMm, baseBoreMm } = opts
  if (!(value > 0) || !(baseBoreMm > 0) || clearanceMm < 0) {
    throw new Error("computeScale: value and baseBoreMm must be > 0, clearanceMm >= 0")
  }
  let diaMm: number
  if (mode === "us") diaMm = usToCirc(value) / Math.PI
  else if (mode === "dia") diaMm = value
  else diaMm = value / Math.PI

  const targetDiaMm = diaMm + clearanceMm
  return {
    scale: targetDiaMm / baseBoreMm,
    targetDiaMm,
    usEquivalent: diaToUs(diaMm),
    circMm: diaMm * Math.PI,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/ring-resizer/sizing.ts apps/dashboard/lib/ring-resizer/__tests__/sizing.test.ts
git commit -m "feat(ring-resizer): sizing math with legacy-calculator parity"
```

---

### Task 3: Binary STL parse/weld/export (`lib/ring-resizer/mesh/stl.ts`)

**Files:**
- Create: `apps/dashboard/lib/ring-resizer/types.ts`
- Create: `apps/dashboard/lib/ring-resizer/mesh/stl.ts`
- Test: `apps/dashboard/lib/ring-resizer/__tests__/stl.test.ts`

**Interfaces:**
- Produces:
  - `interface WeldedMesh { vertProperties: Float32Array; triVerts: Uint32Array }` (di `types.ts`; layout = format `Mesh` milik manifold-3d: xyz per vertex, 3 index per tri)
  - `interface AnchorInput { pos: [number,number,number]; normal: [number,number,number]; up: [number,number,number]; textHeightMm: number; depthMm: number }` (di `types.ts`)
  - `interface PartResult { stl: Buffer; engraved: boolean; warning?: string }` (di `types.ts`)
  - `parseBinaryStl(buf: Buffer): WeldedMesh` — throws `Error("not a binary STL")` bila bukan binary STL valid
  - `exportBinaryStl(mesh: WeldedMesh): Buffer`
  - `scaleMesh(mesh: WeldedMesh, factor: number): void` (in-place, uniform, pivot origin)
  - `makeCubeStl(sizeMm: number): Buffer` (test helper, diekspor dari stl.ts — juga dipakai test Task 5–6)

- [ ] **Step 1: Write the failing test** — `apps/dashboard/lib/ring-resizer/__tests__/stl.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseBinaryStl, exportBinaryStl, scaleMesh, makeCubeStl } from "../mesh/stl"

describe("binary STL parse/weld/export", () => {
  it("parses a cube and welds shared vertices", () => {
    const stl = makeCubeStl(10)
    const mesh = parseBinaryStl(stl)
    expect(mesh.triVerts.length).toBe(12 * 3)      // 12 triangles
    expect(mesh.vertProperties.length).toBe(8 * 3) // welded to 8 unique vertices
  })

  it("round-trips through export", () => {
    const mesh = parseBinaryStl(makeCubeStl(10))
    const again = parseBinaryStl(exportBinaryStl(mesh))
    expect(again.triVerts.length).toBe(mesh.triVerts.length)
    expect(again.vertProperties.length).toBe(mesh.vertProperties.length)
  })

  it("scaleMesh scales every coordinate uniformly around origin", () => {
    const mesh = parseBinaryStl(makeCubeStl(10))
    const maxBefore = Math.max(...mesh.vertProperties)
    scaleMesh(mesh, 0.5)
    const maxAfter = Math.max(...mesh.vertProperties)
    expect(maxAfter).toBeCloseTo(maxBefore * 0.5, 5)
  })

  it("rejects garbage input", () => {
    expect(() => parseBinaryStl(Buffer.from("solid ascii\n"))).toThrow(/binary STL/)
    expect(() => parseBinaryStl(Buffer.alloc(10))).toThrow(/binary STL/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/stl
```

Expected: FAIL — cannot resolve `../mesh/stl`.

- [ ] **Step 3: Write types** — `apps/dashboard/lib/ring-resizer/types.ts`:

```ts
// Shared types for the ring-resizer mesh pipeline.

/** Indexed triangle mesh in manifold-3d Mesh layout (numProp = 3). */
export interface WeldedMesh {
  vertProperties: Float32Array // x,y,z per vertex
  triVerts: Uint32Array        // 3 vertex indices per triangle
}

/** Engrave anchor in base-STL (100%) coordinates. */
export interface AnchorInput {
  pos: [number, number, number]
  normal: [number, number, number] // unit, pointing OUT of the surface
  up: [number, number, number]     // unit, text "up" direction, in surface plane
  textHeightMm: number
  depthMm: number
}

export interface PartResult {
  stl: Buffer
  engraved: boolean
  warning?: string
}
```

- [ ] **Step 4: Write implementation** — `apps/dashboard/lib/ring-resizer/mesh/stl.ts`:

```ts
import type { WeldedMesh } from "../types"

const HEADER_BYTES = 84 // 80-byte header + uint32 triangle count
const TRI_BYTES = 50    // 12B normal + 36B vertices + 2B attr

/**
 * Parse binary STL into an indexed mesh, welding duplicate vertices.
 * Weld key quantizes to 1e-4 mm so bit-identical and near-identical
 * duplicates (typical STL output) collapse to one vertex.
 */
export function parseBinaryStl(buf: Buffer): WeldedMesh {
  if (buf.length < HEADER_BYTES) throw new Error("not a binary STL: too short")
  const triCount = buf.readUInt32LE(80)
  if (triCount === 0 || buf.length < HEADER_BYTES + triCount * TRI_BYTES) {
    throw new Error("not a binary STL: size mismatch with triangle count")
  }

  const keyToIndex = new Map<string, number>()
  const verts: number[] = []
  const triVerts = new Uint32Array(triCount * 3)

  for (let t = 0; t < triCount; t++) {
    const base = HEADER_BYTES + t * TRI_BYTES + 12 // skip normal
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(base + v * 12)
      const y = buf.readFloatLE(base + v * 12 + 4)
      const z = buf.readFloatLE(base + v * 12 + 8)
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
      let idx = keyToIndex.get(key)
      if (idx === undefined) {
        idx = verts.length / 3
        keyToIndex.set(key, idx)
        verts.push(x, y, z)
      }
      triVerts[t * 3 + v] = idx
    }
  }
  return { vertProperties: new Float32Array(verts), triVerts }
}

export function exportBinaryStl(mesh: WeldedMesh): Buffer {
  const triCount = mesh.triVerts.length / 3
  const buf = Buffer.alloc(HEADER_BYTES + triCount * TRI_BYTES)
  buf.write("ring-resizer binary STL", 0, "ascii")
  buf.writeUInt32LE(triCount, 80)

  const p = mesh.vertProperties
  for (let t = 0; t < triCount; t++) {
    const [a, b, c] = [mesh.triVerts[t * 3], mesh.triVerts[t * 3 + 1], mesh.triVerts[t * 3 + 2]]
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2]
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2]
    const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2]
    // face normal = normalize((b-a) x (c-a))
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len

    const base = HEADER_BYTES + t * TRI_BYTES
    buf.writeFloatLE(nx, base); buf.writeFloatLE(ny, base + 4); buf.writeFloatLE(nz, base + 8)
    const coords = [ax, ay, az, bx, by, bz, cx, cy, cz]
    for (let i = 0; i < 9; i++) buf.writeFloatLE(coords[i], base + 12 + i * 4)
    // 2 attribute bytes stay zero
  }
  return buf
}

/** Uniform in-place scale around the origin. */
export function scaleMesh(mesh: WeldedMesh, factor: number): void {
  const p = mesh.vertProperties
  for (let i = 0; i < p.length; i++) p[i] *= factor
}

/** Test helper: axis-aligned cube [0,size]^3 as binary STL (12 tris). */
export function makeCubeStl(sizeMm: number): Buffer {
  const s = sizeMm
  // 8 corners
  const c = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
  ]
  // 12 triangles, outward winding (CCW seen from outside)
  const tris = [
    [0, 2, 1], [0, 3, 2], // bottom (z=0)
    [4, 5, 6], [4, 6, 7], // top (z=s)
    [0, 1, 5], [0, 5, 4], // front (y=0)
    [2, 3, 7], [2, 7, 6], // back (y=s)
    [1, 2, 6], [1, 6, 5], // right (x=s)
    [3, 0, 4], [3, 4, 7], // left (x=0)
  ]
  const buf = Buffer.alloc(HEADER_BYTES + tris.length * TRI_BYTES)
  buf.writeUInt32LE(tris.length, 80)
  tris.forEach((tri, t) => {
    const base = HEADER_BYTES + t * TRI_BYTES
    tri.forEach((vi, v) => {
      const [x, y, z] = c[vi]
      buf.writeFloatLE(x, base + 12 + v * 12)
      buf.writeFloatLE(y, base + 12 + v * 12 + 4)
      buf.writeFloatLE(z, base + 12 + v * 12 + 8)
    })
  })
  return buf
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/stl
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/ring-resizer/types.ts apps/dashboard/lib/ring-resizer/mesh/stl.ts apps/dashboard/lib/ring-resizer/__tests__/stl.test.ts
git commit -m "feat(ring-resizer): binary STL parse/weld/export"
```

---

### Task 4: Manifold loader + text solid (`mesh/manifold.ts`, `mesh/text.ts`)

**Files:**
- Create: `apps/dashboard/lib/ring-resizer/mesh/manifold.ts`
- Create: `apps/dashboard/lib/ring-resizer/mesh/text.ts`
- Test: `apps/dashboard/lib/ring-resizer/__tests__/text.test.ts`

**Interfaces:**
- Consumes: font `apps/dashboard/public/fonts/engrave.ttf` (Task 1)
- Produces:
  - `getManifold(): Promise<ManifoldToplevel>` — WASM singleton
  - `buildTextSolid(opts: { text: string; fontBuf: Buffer; heightMm: number; depthMm: number }): Promise<Manifold>` — solid huruf: X ter-center di 0, Y ter-center di 0, Z membentang `0..depthMm` (belum dioutset/ditransform ke anchor — itu tugas Task 5)
  - `loadEngraveFont(): Buffer` — baca TTF dari `public/fonts/engrave.ttf` (cache module-level)

- [ ] **Step 1: Write the failing test** — `apps/dashboard/lib/ring-resizer/__tests__/text.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildTextSolid, loadEngraveFont } from "../mesh/text"

describe("buildTextSolid", () => {
  it("produces a positive-volume solid spanning 0..depth in Z, centered in X/Y", async () => {
    const solid = await buildTextSolid({
      text: "US 8", fontBuf: loadEngraveFont(), heightMm: 3, depthMm: 0.5,
    })
    expect(solid.volume()).toBeGreaterThan(0)
    const bb = solid.boundingBox()
    expect(bb.min[2]).toBeCloseTo(0, 5)
    expect(bb.max[2]).toBeCloseTo(0.5, 5)
    // centered: |min.x| ≈ |max.x|
    expect(Math.abs(bb.min[0] + bb.max[0])).toBeLessThan(0.1)
    // glyph height in the right ballpark (letters ≈ heightMm)
    expect(bb.max[1] - bb.min[1]).toBeGreaterThan(1.5)
    expect(bb.max[1] - bb.min[1]).toBeLessThan(6)
    solid.delete()
  })

  it("throws on characters missing from the font", async () => {
    await expect(
      buildTextSolid({ text: "日本語", fontBuf: loadEngraveFont(), heightMm: 3, depthMm: 0.5 }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/text
```

Expected: FAIL — cannot resolve `../mesh/text`.

- [ ] **Step 3: Write manifold loader** — `apps/dashboard/lib/ring-resizer/mesh/manifold.ts`:

```ts
import Module from "manifold-3d"
import type { ManifoldToplevel } from "manifold-3d"

let instance: ManifoldToplevel | null = null

/** Lazy WASM singleton — loading manifold takes ~100ms, do it once per process. */
export async function getManifold(): Promise<ManifoldToplevel> {
  if (!instance) {
    instance = await Module()
    instance.setup()
  }
  return instance
}
```

Catatan API `manifold-3d` (cek `node_modules/manifold-3d/manifold.d.ts` bila signature tak cocok — jangan menebak): `new wasm.Mesh({ numProp, vertProperties, triVerts })`, `mesh.merge()`, `new wasm.Manifold(mesh)` (throw bila non-manifold), `new wasm.CrossSection(polygons, "EvenOdd")`, `.extrude(h)`, `.translate([x,y,z])`, `.transform(mat)`, `.subtract(other)`, `.volume()`, `.boundingBox()` → `{ min: Vec3, max: Vec3 }`, `.getMesh()`, `.delete()`. Bila `volume()`/`boundingBox()` tidak ada di versi terpasang, padanannya `getProperties().volume` / `boundingBox()` di d.ts — sesuaikan test & kode SETELAH membaca d.ts.

- [ ] **Step 4: Write text solid builder** — `apps/dashboard/lib/ring-resizer/mesh/text.ts`:

```ts
import { readFileSync } from "node:fs"
import path from "node:path"
import * as opentype from "opentype.js"
import type { Manifold } from "manifold-3d"
import { getManifold } from "./manifold"

let fontCache: Buffer | null = null

export function loadEngraveFont(): Buffer {
  if (!fontCache) {
    fontCache = readFileSync(path.join(process.cwd(), "public/fonts/engrave.ttf"))
  }
  return fontCache
}

type Pt = [number, number]

/**
 * Flatten an opentype path into closed polygons (Y flipped: font space is
 * y-down, we want y-up). Bezier curves are sampled with `segments` steps.
 */
export function pathToPolygons(commands: opentype.PathCommand[], segments = 8): Pt[][] {
  const polys: Pt[][] = []
  let cur: Pt[] = []
  let last: Pt = [0, 0]

  const push = (x: number, y: number) => { last = [x, -y]; cur.push(last) }

  for (const c of commands) {
    if (c.type === "M") { if (cur.length > 2) polys.push(cur); cur = []; push(c.x, c.y) }
    else if (c.type === "L") push(c.x, c.y)
    else if (c.type === "Q") {
      const [x0, y0] = [last[0], -last[1]]
      for (let i = 1; i <= segments; i++) {
        const t = i / segments, mt = 1 - t
        push(mt * mt * x0 + 2 * mt * t * c.x1 + t * t * c.x,
             mt * mt * y0 + 2 * mt * t * c.y1 + t * t * c.y)
      }
    } else if (c.type === "C") {
      const [x0, y0] = [last[0], -last[1]]
      for (let i = 1; i <= segments; i++) {
        const t = i / segments, mt = 1 - t
        push(mt ** 3 * x0 + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t ** 3 * c.x,
             mt ** 3 * y0 + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t ** 3 * c.y)
      }
    } else if (c.type === "Z") { if (cur.length > 2) polys.push(cur); cur = [] }
  }
  if (cur.length > 2) polys.push(cur)
  return polys
}

/**
 * Build an extruded text solid. Capital-letter height ≈ heightMm (cap height
 * assumed ≈ 0.72 em). Solid is centered in X and Y, spans z ∈ [0, depthMm].
 */
export async function buildTextSolid(opts: {
  text: string
  fontBuf: Buffer
  heightMm: number
  depthMm: number
}): Promise<Manifold> {
  const { text, fontBuf, heightMm, depthMm } = opts
  const font = opentype.parse(
    fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength),
  )
  for (const ch of text) {
    if (ch !== " " && font.charToGlyphIndex(ch) === 0) {
      throw new Error(`character "${ch}" not available in engrave font`)
    }
  }
  const fontSize = heightMm / 0.72
  const otPath = font.getPath(text, 0, 0, fontSize)
  const polys = pathToPolygons(otPath.commands)
  if (polys.length === 0) throw new Error("text produced no outlines")

  const wasm = await getManifold()
  const cross = new wasm.CrossSection(polys, "EvenOdd")
  let solid = cross.extrude(depthMm)
  cross.delete()

  const bb = solid.boundingBox()
  const centered = solid.translate([
    -(bb.min[0] + bb.max[0]) / 2,
    -(bb.min[1] + bb.max[1]) / 2,
    0,
  ])
  solid.delete()
  return centered
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/text
```

Expected: PASS (2 tests). Bila gagal karena API manifold beda versi, baca `node_modules/manifold-3d/manifold.d.ts` dan sesuaikan pemanggilan (bukan test-nya, kecuali nama getter properti memang beda).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/ring-resizer/mesh/manifold.ts apps/dashboard/lib/ring-resizer/mesh/text.ts apps/dashboard/lib/ring-resizer/__tests__/text.test.ts
git commit -m "feat(ring-resizer): manifold loader and extruded text solid"
```

---

### Task 5: Anchor transform + engrave with fallback (`mesh/engrave.ts`)

**Files:**
- Create: `apps/dashboard/lib/ring-resizer/mesh/engrave.ts`
- Test: `apps/dashboard/lib/ring-resizer/__tests__/engrave.test.ts`

**Interfaces:**
- Consumes: `WeldedMesh`, `AnchorInput` (Task 3), `buildTextSolid`, `getManifold` (Task 4)
- Produces:
  - `anchorMatrix(anchor: AnchorInput, scale: number): number[]` — Mat4 column-major (16 angka): kolom X = right (`up × normal` dinormalisasi), kolom Y = up (di-orthogonalkan), kolom Z = normal, translasi = `pos * scale`
  - `engraveWelded(opts: { base: WeldedMesh; anchors: AnchorInput[]; text: string; fontBuf: Buffer; scale: number }): Promise<{ mesh: WeldedMesh; engraved: boolean; warning?: string }>` — base SUDAH ter-scale; tangga: manifold → three-bvh-csg → scaled-only+warning

- [ ] **Step 1: Write the failing test** — `apps/dashboard/lib/ring-resizer/__tests__/engrave.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseBinaryStl, makeCubeStl, scaleMesh } from "../mesh/stl"
import { loadEngraveFont } from "../mesh/text"
import { anchorMatrix, engraveWelded } from "../mesh/engrave"
import { getManifold } from "../mesh/manifold"
import type { AnchorInput } from "../types"

const topAnchor: AnchorInput = {
  pos: [10, 10, 20],            // center of the top face of a 20mm cube
  normal: [0, 0, 1],
  up: [0, 1, 0],
  textHeightMm: 4,
  depthMm: 0.5,
}

function meshVolume(mesh: { vertProperties: Float32Array; triVerts: Uint32Array }): number {
  // signed tetrahedron sum — enough for watertight test meshes
  let v = 0
  const p = mesh.vertProperties, t = mesh.triVerts
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3]
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6
  }
  return Math.abs(v)
}

describe("anchorMatrix", () => {
  it("maps local +Z to the anchor normal and origin to scaled pos", () => {
    const m = anchorMatrix(topAnchor, 0.5)
    // column-major: translation = m[12..14] = pos * scale
    expect(m[12]).toBeCloseTo(5); expect(m[13]).toBeCloseTo(5); expect(m[14]).toBeCloseTo(10)
    // Z column = normal
    expect(m[8]).toBeCloseTo(0); expect(m[9]).toBeCloseTo(0); expect(m[10]).toBeCloseTo(1)
  })
})

describe("engraveWelded", () => {
  it("cuts material from a manifold cube (volume decreases)", async () => {
    const base = parseBinaryStl(makeCubeStl(20))
    const before = meshVolume(base)
    const r = await engraveWelded({
      base, anchors: [topAnchor], text: "US 8", fontBuf: loadEngraveFont(), scale: 1,
    })
    expect(r.engraved).toBe(true)
    expect(r.warning).toBeUndefined()
    const after = meshVolume(r.mesh)
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(before * 0.9) // shallow engraving, not destruction
  })

  it("falls back for a non-manifold base and still returns a result", async () => {
    const base = parseBinaryStl(makeCubeStl(20))
    // break manifoldness: drop one triangle
    const broken = { vertProperties: base.vertProperties, triVerts: base.triVerts.slice(3) }
    const r = await engraveWelded({
      base: broken, anchors: [topAnchor], text: "US 8", fontBuf: loadEngraveFont(), scale: 1,
    })
    // either the csg fallback engraved it, or it fell through to scaled-only+warning
    expect(r.mesh.triVerts.length).toBeGreaterThan(0)
    if (!r.engraved) expect(r.warning).toBeTruthy()
  }, 30_000)

  it("no anchors → returns base untouched, engraved=false, no warning", async () => {
    const base = parseBinaryStl(makeCubeStl(20))
    const r = await engraveWelded({
      base, anchors: [], text: "US 8", fontBuf: loadEngraveFont(), scale: 1,
    })
    expect(r.engraved).toBe(false)
    expect(r.warning).toBeUndefined()
    expect(r.mesh).toBe(base)
  })

  it("sanity: manifold module loads", async () => {
    const wasm = await getManifold()
    expect(wasm.Manifold).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/engrave
```

Expected: FAIL — cannot resolve `../mesh/engrave`.

- [ ] **Step 3: Write implementation** — `apps/dashboard/lib/ring-resizer/mesh/engrave.ts`:

```ts
import * as THREE from "three"
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg"
import type { Manifold } from "manifold-3d"
import type { AnchorInput, WeldedMesh } from "../types"
import { getManifold } from "./manifold"
import { buildTextSolid } from "./text"

const OUTSET_MM = 0.6 // cutter sticks out past the surface to guarantee a clean cut

type V3 = [number, number, number]
const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]

/**
 * Column-major 4x4 placing the text solid on the (scaled) surface point:
 * local X = right, local Y = text up, local Z = surface normal.
 */
export function anchorMatrix(anchor: AnchorInput, scale: number): number[] {
  const n = norm(anchor.normal)
  const x = norm(cross(anchor.up, n))
  const y = cross(n, x) // already unit: n ⟂ x
  const p = anchor.pos
  return [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    n[0], n[1], n[2], 0,
    p[0] * scale, p[1] * scale, p[2] * scale, 1,
  ]
}

async function buildCutters(anchors: AnchorInput[], text: string, fontBuf: Buffer, scale: number): Promise<Manifold> {
  const wasm = await getManifold()
  let union: Manifold | null = null
  for (const a of anchors) {
    // extrude depth + outset, then sink so it spans z ∈ [-depth, +outset] locally
    const solid = await buildTextSolid({
      text, fontBuf, heightMm: a.textHeightMm, depthMm: a.depthMm + OUTSET_MM,
    })
    const sunk = solid.translate([0, 0, -a.depthMm])
    solid.delete()
    const placed = sunk.transform(anchorMatrix(a, scale))
    sunk.delete()
    if (!union) union = placed
    else { const u = union.add(placed); union.delete(); placed.delete(); union = u }
  }
  if (!union) throw new Error("no anchors")
  return union
}

function weldedToGeometry(mesh: WeldedMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(mesh.vertProperties.slice(), 3))
  g.setIndex(new THREE.BufferAttribute(mesh.triVerts.slice(), 1))
  g.computeVertexNormals()
  return g
}

function geometryToWelded(g: THREE.BufferGeometry): WeldedMesh {
  const pos = g.getAttribute("position") as THREE.BufferAttribute
  const idx = g.getIndex()
  const vertProperties = new Float32Array(pos.array as ArrayLike<number>)
  const triVerts = idx
    ? new Uint32Array(idx.array as ArrayLike<number>)
    : new Uint32Array(Array.from({ length: pos.count }, (_, i) => i))
  return { vertProperties, triVerts }
}

/**
 * Engrave `text` at every anchor of an ALREADY-SCALED base mesh.
 * Ladder: manifold-3d (exact, watertight) → three-bvh-csg (tolerant) →
 * give up and return the scaled base with a warning.
 */
export async function engraveWelded(opts: {
  base: WeldedMesh
  anchors: AnchorInput[]
  text: string
  fontBuf: Buffer
  scale: number
}): Promise<{ mesh: WeldedMesh; engraved: boolean; warning?: string }> {
  const { base, anchors, text, fontBuf, scale } = opts
  if (anchors.length === 0 || text.trim() === "") {
    return { mesh: base, engraved: false }
  }

  const wasm = await getManifold()
  const cutters = await buildCutters(anchors, text, fontBuf, scale)

  // Rung 1: manifold
  try {
    const m = new wasm.Mesh({ numProp: 3, vertProperties: base.vertProperties, triVerts: base.triVerts })
    m.merge()
    const solid = new wasm.Manifold(m)
    const result = solid.subtract(cutters)
    solid.delete()
    const out = result.getMesh()
    result.delete(); cutters.delete()
    return {
      mesh: { vertProperties: new Float32Array(out.vertProperties), triVerts: new Uint32Array(out.triVerts) },
      engraved: true,
    }
  } catch {
    // fall through to csg
  }

  // Rung 2: three-bvh-csg on the raw triangle soup
  try {
    const cutterMesh = cutters.getMesh()
    cutters.delete()
    const baseBrush = new Brush(weldedToGeometry(base))
    const cutterBrush = new Brush(weldedToGeometry({
      vertProperties: new Float32Array(cutterMesh.vertProperties),
      triVerts: new Uint32Array(cutterMesh.triVerts),
    }))
    baseBrush.updateMatrixWorld(); cutterBrush.updateMatrixWorld()
    const evaluator = new Evaluator()
    const result = evaluator.evaluate(baseBrush, cutterBrush, SUBTRACTION)
    return {
      mesh: geometryToWelded(result.geometry),
      engraved: true,
      warning: "mesh non-manifold — engraved via csg fallback, hasil tidak dijamin watertight",
    }
  } catch (err) {
    return {
      mesh: base,
      engraved: false,
      warning: `engrave gagal (${err instanceof Error ? err.message : String(err)}) — part di-scale tanpa engrave`,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/engrave
```

Expected: PASS (5 tests). Test kedua boleh lewat jalur fallback mana pun — assertion-nya sudah mengizinkan dua-duanya.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/ring-resizer/mesh/engrave.ts apps/dashboard/lib/ring-resizer/__tests__/engrave.test.ts
git commit -m "feat(ring-resizer): anchor transform and engrave with csg fallback ladder"
```

---

### Task 6: Pipeline per part + validasi request (`mesh/pipeline.ts`, `validate.ts`)

**Files:**
- Create: `apps/dashboard/lib/ring-resizer/mesh/pipeline.ts`
- Create: `apps/dashboard/lib/ring-resizer/validate.ts`
- Test: `apps/dashboard/lib/ring-resizer/__tests__/pipeline.test.ts`
- Test: `apps/dashboard/lib/ring-resizer/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: Task 2–5 (`computeScale`, `parseBinaryStl`, `scaleMesh`, `exportBinaryStl`, `engraveWelded`, `loadEngraveFont`)
- Produces:
  - `processPart(opts: { stl: Buffer; scale: number; anchors: AnchorInput[]; text: string }): Promise<PartResult>`
  - `sanitizeLabel(s: string): string` — untuk nama file (ganti non `[A-Za-z0-9._-]` jadi `_`)
  - `parseProcessRequest(body: unknown): { ok: true; req: ProcessRequest } | { ok: false; error: string }` dengan `interface ProcessRequest { modelId: string; mode: SizeMode; value: number; clearanceMm: number; text: string }`
  - `parseAnchorsBody(body: unknown): { ok: true; anchors: AnchorInput[] } | { ok: false; error: string }`

- [ ] **Step 1: Write failing pipeline test** — `apps/dashboard/lib/ring-resizer/__tests__/pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { makeCubeStl, parseBinaryStl } from "../mesh/stl"
import { processPart, sanitizeLabel } from "../mesh/pipeline"
import type { AnchorInput } from "../types"

const anchor: AnchorInput = {
  pos: [10, 10, 20], normal: [0, 0, 1], up: [0, 1, 0], textHeightMm: 4, depthMm: 0.5,
}

describe("processPart", () => {
  it("scales exactly and engraves", async () => {
    const r = await processPart({ stl: makeCubeStl(20), scale: 0.75, anchors: [anchor], text: "US 8" })
    expect(r.engraved).toBe(true)
    const mesh = parseBinaryStl(r.stl)
    const maxCoord = Math.max(...mesh.vertProperties)
    expect(maxCoord).toBeCloseTo(15, 3) // 20 * 0.75
  })

  it("without anchors returns scaled-only, engraved=false", async () => {
    const r = await processPart({ stl: makeCubeStl(20), scale: 0.5, anchors: [], text: "US 8" })
    expect(r.engraved).toBe(false)
    const mesh = parseBinaryStl(r.stl)
    expect(Math.max(...mesh.vertProperties)).toBeCloseTo(10, 3)
  })
})

describe("sanitizeLabel", () => {
  it("keeps safe chars, replaces the rest", () => {
    // space, "/", space, "#" each become "_": "US 8 / #1234" → "US_8____1234"
    expect(sanitizeLabel("US 8 / #1234")).toBe("US_8____1234")
    expect(sanitizeLabel("band.stl")).toBe("band.stl")
  })
})
```

- [ ] **Step 2: Write failing validate test** — `apps/dashboard/lib/ring-resizer/__tests__/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseProcessRequest, parseAnchorsBody } from "../validate"

describe("parseProcessRequest", () => {
  const good = { modelId: "abc", mode: "us", value: 8, clearanceMm: 0.3, text: "US 8" }

  it("accepts a valid request", () => {
    const r = parseProcessRequest(good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.req.mode).toBe("us")
  })

  it.each([
    [{ ...good, mode: "banana" }],
    [{ ...good, value: -1 }],
    [{ ...good, text: "x".repeat(25) }],       // > 24 chars
    [{ ...good, text: "héllo" }],              // non-ASCII rejected
    [{ ...good, modelId: "" }],
    ["not an object"],
  ])("rejects %j", (body) => {
    expect(parseProcessRequest(body).ok).toBe(false)
  })
})

describe("parseAnchorsBody", () => {
  it("accepts a valid anchor list", () => {
    const r = parseAnchorsBody({
      anchors: [{ pos: [1, 2, 3], normal: [0, 0, 1], up: [0, 1, 0], textHeightMm: 3, depthMm: 0.5 }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.anchors).toHaveLength(1)
  })

  it("rejects malformed anchors", () => {
    expect(parseAnchorsBody({ anchors: [{ pos: [1, 2] }] }).ok).toBe(false)
    expect(parseAnchorsBody({}).ok).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/pipeline lib/ring-resizer/__tests__/validate
```

Expected: FAIL — module not found (keduanya).

- [ ] **Step 4: Write pipeline** — `apps/dashboard/lib/ring-resizer/mesh/pipeline.ts`:

```ts
import type { AnchorInput, PartResult } from "../types"
import { parseBinaryStl, exportBinaryStl, scaleMesh } from "./stl"
import { engraveWelded } from "./engrave"
import { loadEngraveFont } from "./text"

/** Scale (exact, origin pivot) then engrave one part. */
export async function processPart(opts: {
  stl: Buffer
  scale: number
  anchors: AnchorInput[]
  text: string
}): Promise<PartResult> {
  const mesh = parseBinaryStl(opts.stl)
  scaleMesh(mesh, opts.scale)
  const r = await engraveWelded({
    base: mesh,
    anchors: opts.anchors,
    text: opts.text,
    fontBuf: loadEngraveFont(),
    scale: opts.scale,
  })
  return { stl: exportBinaryStl(r.mesh), engraved: r.engraved, warning: r.warning }
}

/** Filesystem/ZIP-safe label: anything outside [A-Za-z0-9._-] becomes "_". */
export function sanitizeLabel(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_")
}
```

- [ ] **Step 5: Write validation** — `apps/dashboard/lib/ring-resizer/validate.ts`:

```ts
import type { SizeMode } from "./sizing"
import type { AnchorInput } from "./types"

export interface ProcessRequest {
  modelId: string
  mode: SizeMode
  value: number
  clearanceMm: number
  text: string
}

export const MAX_TEXT_LEN = 24
const TEXT_RE = /^[\x20-\x7E]*$/ // printable ASCII — matches the engrave font coverage we rely on

type Result<T> = { ok: true } & T | { ok: false; error: string }

export function parseProcessRequest(body: unknown): Result<{ req: ProcessRequest }> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be an object" }
  const b = body as Record<string, unknown>
  if (typeof b.modelId !== "string" || b.modelId.length === 0) return { ok: false, error: "modelId required" }
  if (b.mode !== "us" && b.mode !== "dia" && b.mode !== "circ") return { ok: false, error: "mode must be us|dia|circ" }
  if (typeof b.value !== "number" || !(b.value > 0)) return { ok: false, error: "value must be > 0" }
  const clearanceMm = typeof b.clearanceMm === "number" ? b.clearanceMm : 0
  if (clearanceMm < 0 || clearanceMm > 2) return { ok: false, error: "clearanceMm out of range" }
  if (typeof b.text !== "string" || b.text.length > MAX_TEXT_LEN || !TEXT_RE.test(b.text)) {
    return { ok: false, error: `text must be printable ASCII, max ${MAX_TEXT_LEN} chars` }
  }
  return { ok: true, req: { modelId: b.modelId, mode: b.mode, value: b.value, clearanceMm, text: b.text } }
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n))
}

export function parseAnchorsBody(body: unknown): Result<{ anchors: AnchorInput[] }> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be an object" }
  const list = (body as Record<string, unknown>).anchors
  if (!Array.isArray(list)) return { ok: false, error: "anchors must be an array" }
  const anchors: AnchorInput[] = []
  for (const a of list) {
    if (typeof a !== "object" || a === null) return { ok: false, error: "anchor must be an object" }
    const r = a as Record<string, unknown>
    if (!isVec3(r.pos) || !isVec3(r.normal) || !isVec3(r.up)) {
      return { ok: false, error: "anchor pos/normal/up must be [x,y,z] numbers" }
    }
    const textHeightMm = typeof r.textHeightMm === "number" && r.textHeightMm > 0.5 && r.textHeightMm <= 20 ? r.textHeightMm : NaN
    const depthMm = typeof r.depthMm === "number" && r.depthMm > 0 && r.depthMm <= 3 ? r.depthMm : NaN
    if (Number.isNaN(textHeightMm) || Number.isNaN(depthMm)) {
      return { ok: false, error: "textHeightMm (0.5..20) and depthMm (0..3) required" }
    }
    anchors.push({ pos: r.pos, normal: r.normal, up: r.up, textHeightMm, depthMm })
  }
  return { ok: true, anchors }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer
```

Expected: PASS — seluruh suite lib/ring-resizer hijau.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/ring-resizer/mesh/pipeline.ts apps/dashboard/lib/ring-resizer/validate.ts apps/dashboard/lib/ring-resizer/__tests__/pipeline.test.ts apps/dashboard/lib/ring-resizer/__tests__/validate.test.ts
git commit -m "feat(ring-resizer): per-part pipeline and request validation"
```

---

### Task 7: MinIO storage helper (`lib/ring-resizer/storage.ts`)

**Files:**
- Create: `apps/dashboard/lib/ring-resizer/storage.ts`
- Test: `apps/dashboard/lib/ring-resizer/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `getMinioClient` dari `@/lib/minio` (existing)
- Produces:
  - `RING_BUCKET: string` (env `RING_BUCKET`, default `"ring-models"`)
  - `ringPartKey(modelId: string, partId: string): string` → `` `${modelId}/${partId}.stl` ``
  - `uploadRingStl(modelId: string, partId: string, body: Buffer): Promise<void>` (auto-create bucket bila belum ada)
  - `downloadRingStl(modelId: string, partId: string): Promise<Buffer>`
  - `deleteRingStl(modelId: string, partId: string): Promise<void>` (idempotent — NoSuchKey ditelan)

- [ ] **Step 1: Write the failing test** — mock S3 client, `apps/dashboard/lib/ring-resizer/__tests__/storage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const sent: unknown[] = []
vi.mock("@/lib/minio", () => ({
  getMinioClient: () => ({
    send: vi.fn(async (cmd: unknown) => {
      sent.push(cmd)
      const name = (cmd as { constructor: { name: string } }).constructor.name
      if (name === "GetObjectCommand") {
        return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }
      }
      return {}
    }),
  }),
}))

import { ringPartKey, uploadRingStl, downloadRingStl } from "../storage"

beforeEach(() => { sent.length = 0 })

describe("ring storage", () => {
  it("builds keys as modelId/partId.stl", () => {
    expect(ringPartKey("m1", "p1")).toBe("m1/p1.stl")
  })

  it("upload sends PutObjectCommand with the right key", async () => {
    await uploadRingStl("m1", "p1", Buffer.from("x"))
    const put = sent.find((c) => (c as { constructor: { name: string } }).constructor.name === "PutObjectCommand")
    expect(put).toBeDefined()
    expect((put as { input: { Key: string } }).input.Key).toBe("m1/p1.stl")
  })

  it("download returns the object bytes as Buffer", async () => {
    const buf = await downloadRingStl("m1", "p1")
    expect([...buf]).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/storage
```

Expected: FAIL — cannot resolve `../storage`.

- [ ] **Step 3: Write implementation** — `apps/dashboard/lib/ring-resizer/storage.ts`:

```ts
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3"
import { getMinioClient } from "@/lib/minio"

export const RING_BUCKET = process.env.RING_BUCKET ?? "ring-models"

export function ringPartKey(modelId: string, partId: string): string {
  return `${modelId}/${partId}.stl`
}

let bucketEnsured = false
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return
  try {
    await getMinioClient().send(new CreateBucketCommand({ Bucket: RING_BUCKET }))
  } catch {
    // already exists / already owned — fine
  }
  bucketEnsured = true
}

export async function uploadRingStl(modelId: string, partId: string, body: Buffer): Promise<void> {
  await ensureBucket()
  await getMinioClient().send(
    new PutObjectCommand({
      Bucket: RING_BUCKET,
      Key: ringPartKey(modelId, partId),
      Body: body,
      ContentType: "model/stl",
    }),
  )
}

export async function downloadRingStl(modelId: string, partId: string): Promise<Buffer> {
  const res = await getMinioClient().send(
    new GetObjectCommand({ Bucket: RING_BUCKET, Key: ringPartKey(modelId, partId) }),
  )
  if (!res.Body) throw new Error("empty object body")
  return Buffer.from(await res.Body.transformToByteArray())
}

export async function deleteRingStl(modelId: string, partId: string): Promise<void> {
  try {
    await getMinioClient().send(
      new DeleteObjectCommand({ Bucket: RING_BUCKET, Key: ringPartKey(modelId, partId) }),
    )
  } catch {
    // idempotent delete
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter shopee-dashboard test -- lib/ring-resizer/__tests__/storage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/ring-resizer/storage.ts apps/dashboard/lib/ring-resizer/__tests__/storage.test.ts
git commit -m "feat(ring-resizer): minio storage helper"
```

---

### Task 8: API — models CRUD, part upload, file proxy, anchors

**Files:**
- Create: `apps/dashboard/app/api/ring-resizer/models/route.ts`
- Create: `apps/dashboard/app/api/ring-resizer/models/[id]/route.ts`
- Create: `apps/dashboard/app/api/ring-resizer/models/[id]/parts/route.ts`
- Create: `apps/dashboard/app/api/ring-resizer/parts/[id]/file/route.ts`
- Create: `apps/dashboard/app/api/ring-resizer/parts/[id]/anchors/route.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`), `auth` (`@/lib/auth`), Task 3 `parseBinaryStl`, Task 6 `parseAnchorsBody`, Task 7 storage.
- Produces (dipakai UI Task 10–13):
  - `GET /api/ring-resizer/models` → `{ models: Array<{ id, name, baseBoreMm, parts: Array<{ id, name, sizeBytes, triCount, anchors: RingAnchorRow[] }> }> }` (anchors ikut — UI perlu)
  - `POST /api/ring-resizer/models` body `{ name: string, baseBoreMm: number }` → `{ model }` (400 bila invalid)
  - `PATCH /api/ring-resizer/models/[id]` body `{ name?, baseBoreMm? }` → `{ model }`; `DELETE` → `{ ok: true }` (hapus MinIO objects + cascade DB)
  - `POST /api/ring-resizer/models/[id]/parts` — `FormData` field `file` (STL) + `name` → `{ part }` (400 bila bukan binary STL)
  - `GET /api/ring-resizer/parts/[id]/file` → body STL, `Content-Type: model/stl`
  - `PUT /api/ring-resizer/parts/[id]/anchors` body `{ anchors: AnchorInput[] }` → `{ anchors }` (replace-all)

Logika route sengaja tipis — validasi & mesh sudah dites di Task 3–7, jadi task ini tanpa unit test route (pola repo: route existing juga tidak dites langsung). Verifikasi lewat typecheck + smoke test di Task 14.

- [ ] **Step 1: models collection** — `apps/dashboard/app/api/ring-resizer/models/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const models = await prisma.ringModel.findMany({
    orderBy: { createdAt: "desc" },
    include: { parts: { include: { anchors: true }, orderBy: { createdAt: "asc" } } },
  })
  return NextResponse.json({ models })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json()
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const baseBoreMm = typeof body?.baseBoreMm === "number" ? body.baseBoreMm : NaN
  if (!name || !(baseBoreMm > 0)) {
    return NextResponse.json({ error: "name and baseBoreMm (> 0) required" }, { status: 400 })
  }
  const model = await prisma.ringModel.create({ data: { name, baseBoreMm } })
  return NextResponse.json({ model }, { status: 201 })
}
```

- [ ] **Step 2: model item** — `apps/dashboard/app/api/ring-resizer/models/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { deleteRingStl } from "@/lib/ring-resizer/storage"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const data: { name?: string; baseBoreMm?: number } = {}
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.baseBoreMm === "number" && body.baseBoreMm > 0) data.baseBoreMm = body.baseBoreMm
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 })
  const model = await prisma.ringModel.update({ where: { id }, data })
  return NextResponse.json({ model })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const parts = await prisma.ringPart.findMany({ where: { modelId: id }, select: { id: true } })
  await Promise.all(parts.map((p) => deleteRingStl(id, p.id)))
  await prisma.ringModel.delete({ where: { id } }) // cascades parts + anchors
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: part upload** — `apps/dashboard/app/api/ring-resizer/models/[id]/parts/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseBinaryStl } from "@/lib/ring-resizer/mesh/stl"
import { uploadRingStl } from "@/lib/ring-resizer/storage"

// STL uploads run to ~130MB — keep this handler on the Node runtime.
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: modelId } = await params

  const model = await prisma.ringModel.findUnique({ where: { id: modelId } })
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file")
  const name = typeof form.get("name") === "string" ? (form.get("name") as string).trim() : ""
  if (!(file instanceof File) || !name) {
    return NextResponse.json({ error: "file (STL) and name required" }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())

  let triCount: number
  try {
    triCount = parseBinaryStl(buf).triVerts.length / 3
  } catch (err) {
    return NextResponse.json(
      { error: `invalid STL: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    )
  }

  const part = await prisma.ringPart.create({
    data: { modelId, name, sizeBytes: buf.length, triCount },
  })
  await uploadRingStl(modelId, part.id, buf)
  return NextResponse.json({ part }, { status: 201 })
}
```

- [ ] **Step 4: file proxy** — `apps/dashboard/app/api/ring-resizer/parts/[id]/file/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadRingStl } from "@/lib/ring-resizer/storage"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const part = await prisma.ringPart.findUnique({ where: { id } })
  if (!part) return NextResponse.json({ error: "part not found" }, { status: 404 })
  const buf = await downloadRingStl(part.modelId, part.id)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "model/stl",
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=3600", // STL immutable per part id
    },
  })
}
```

- [ ] **Step 5: anchors replace** — `apps/dashboard/app/api/ring-resizer/parts/[id]/anchors/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseAnchorsBody } from "@/lib/ring-resizer/validate"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: partId } = await params
  const part = await prisma.ringPart.findUnique({ where: { id: partId } })
  if (!part) return NextResponse.json({ error: "part not found" }, { status: 404 })

  const parsed = parseAnchorsBody(await req.json())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const anchors = await prisma.$transaction(async (tx) => {
    await tx.ringAnchor.deleteMany({ where: { partId } })
    await tx.ringAnchor.createMany({
      data: parsed.anchors.map((a) => ({
        partId,
        posX: a.pos[0], posY: a.pos[1], posZ: a.pos[2],
        normX: a.normal[0], normY: a.normal[1], normZ: a.normal[2],
        upX: a.up[0], upY: a.up[1], upZ: a.up[2],
        textHeightMm: a.textHeightMm, depthMm: a.depthMm,
      })),
    })
    return tx.ringAnchor.findMany({ where: { partId } })
  })
  return NextResponse.json({ anchors })
}
```

- [ ] **Step 6: Typecheck + full test**

```bash
cd apps/dashboard && npx tsc --noEmit && cd ../..
pnpm --filter shopee-dashboard test
```

Expected: tsc bersih, semua test PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/app/api/ring-resizer
git commit -m "feat(ring-resizer): models/parts/anchors API routes"
```

---

### Task 9: API — process → ZIP

**Files:**
- Create: `apps/dashboard/app/api/ring-resizer/process/route.ts`

**Interfaces:**
- Consumes: Task 2 `computeScale`, Task 6 `processPart`/`sanitizeLabel`/`parseProcessRequest`, Task 7 `downloadRingStl`, prisma.
- Produces: `POST /api/ring-resizer/process` body `ProcessRequest` → response `application/zip`, header `X-Ring-Warnings` (JSON array string, kosong bila tak ada), `Content-Disposition: attachment; filename="<Model>_<label>.zip"`. ZIP berisi `<partName>_<label>.stl` per part.

- [ ] **Step 1: Write route** — `apps/dashboard/app/api/ring-resizer/process/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { zipSync } from "fflate"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { computeScale } from "@/lib/ring-resizer/sizing"
import { parseProcessRequest } from "@/lib/ring-resizer/validate"
import { processPart, sanitizeLabel } from "@/lib/ring-resizer/mesh/pipeline"
import { downloadRingStl } from "@/lib/ring-resizer/storage"
import type { AnchorInput } from "@/lib/ring-resizer/types"

// Boolean ops on 1.7M-triangle meshes take tens of seconds.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = parseProcessRequest(await req.json())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { modelId, mode, value, clearanceMm, text } = parsed.req

  const model = await prisma.ringModel.findUnique({
    where: { id: modelId },
    include: { parts: { include: { anchors: true }, orderBy: { createdAt: "asc" } } },
  })
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 })
  if (model.parts.length === 0) return NextResponse.json({ error: "model has no parts" }, { status: 400 })

  const { scale } = computeScale({ mode, value, clearanceMm, baseBoreMm: model.baseBoreMm })
  const label = sanitizeLabel(text) || "resized"

  const files: Record<string, Uint8Array> = {}
  const warnings: string[] = []
  for (const part of model.parts) {
    const stl = await downloadRingStl(model.id, part.id)
    const anchors: AnchorInput[] = part.anchors.map((a) => ({
      pos: [a.posX, a.posY, a.posZ],
      normal: [a.normX, a.normY, a.normZ],
      up: [a.upX, a.upY, a.upZ],
      textHeightMm: a.textHeightMm,
      depthMm: a.depthMm,
    }))
    const result = await processPart({ stl, scale, anchors, text })
    files[`${sanitizeLabel(part.name)}_${label}.stl`] = new Uint8Array(result.stl)
    if (result.warning) warnings.push(`${part.name}: ${result.warning}`)
  }

  const zip = zipSync(files, { level: 0 }) // STL barely compresses; skip the CPU
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sanitizeLabel(model.name)}_${label}.zip"`,
      "X-Ring-Warnings": JSON.stringify(warnings),
    },
  })
}
```

- [ ] **Step 2: Typecheck + full test**

```bash
cd apps/dashboard && npx tsc --noEmit && cd ../..
pnpm --filter shopee-dashboard test
```

Expected: bersih & PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/app/api/ring-resizer/process
git commit -m "feat(ring-resizer): process endpoint returning zipped scaled+engraved STLs"
```

---

### Task 10: UI shell — sidebar entry + RingResizerTab + hooks

**Files:**
- Modify: `apps/dashboard/components/produk/ProdukSidebar.tsx` (tambah item `ring`)
- Modify: `apps/dashboard/app/(dashboard)/produk/page.tsx` (render tab `ring`)
- Create: `apps/dashboard/components/ring-resizer/RingResizerTab.tsx`
- Create: `apps/dashboard/lib/hooks/use-ring-models.ts`
- Test: `apps/dashboard/components/ring-resizer/__tests__/RingResizerTab.test.tsx`

**Interfaces:**
- Consumes: API Task 8 (`GET /api/ring-resizer/models` dst.)
- Produces:
  - `ProdukTab` union bertambah `"ring"`
  - `RingResizerTab` (default export TIDAK dipakai — named export, dirender via `next/dynamic` di produk page)
  - Hook `useRingModels(): { models: RingModelWithParts[]; loading: boolean; error: string | null; refresh: () => Promise<void> }` dengan tipe:

```ts
export interface RingAnchorRow {
  id: string; posX: number; posY: number; posZ: number
  normX: number; normY: number; normZ: number
  upX: number; upY: number; upZ: number
  textHeightMm: number; depthMm: number
}
export interface RingPartRow { id: string; name: string; sizeBytes: number; triCount: number; anchors: RingAnchorRow[] }
export interface RingModelWithParts { id: string; name: string; baseBoreMm: number; parts: RingPartRow[] }
```

- [ ] **Step 1: Write the failing test** — `apps/dashboard/components/ring-resizer/__tests__/RingResizerTab.test.tsx` (pola repo: `renderToStaticMarkup`, tanpa jsdom interaktif):

```tsx
import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("@/lib/hooks/use-ring-models", () => ({
  useRingModels: () => ({ models: [], loading: false, error: null, refresh: async () => {} }),
}))

import { RingResizerTab } from "../RingResizerTab"

describe("RingResizerTab", () => {
  it("renders both sub-tab labels", () => {
    const html = renderToStaticMarkup(<RingResizerTab />)
    expect(html).toContain("Setup Model")
    expect(html).toContain("Produksi")
  })

  it("shows empty state when no models exist", () => {
    const html = renderToStaticMarkup(<RingResizerTab />)
    expect(html).toContain("Belum ada model")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write hook** — `apps/dashboard/lib/hooks/use-ring-models.ts`:

```ts
"use client"

import { useCallback, useEffect, useState } from "react"

export interface RingAnchorRow {
  id: string; posX: number; posY: number; posZ: number
  normX: number; normY: number; normZ: number
  upX: number; upY: number; upZ: number
  textHeightMm: number; depthMm: number
}
export interface RingPartRow { id: string; name: string; sizeBytes: number; triCount: number; anchors: RingAnchorRow[] }
export interface RingModelWithParts { id: string; name: string; baseBoreMm: number; parts: RingPartRow[] }

export function useRingModels() {
  const [models, setModels] = useState<RingModelWithParts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ring-resizer/models")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setModels(json.models)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  return { models, loading, error, refresh }
}
```

- [ ] **Step 4: Write tab shell** — `apps/dashboard/components/ring-resizer/RingResizerTab.tsx`. Sub-tab Setup memakai komponen `ModelManager` (Task 11) dan Produksi memakai `ProductionPanel` (Task 13); untuk task INI buat placeholder minimal kedua komponen itu di file yang sama strukturnya nanti dipindah? — TIDAK. Supaya task self-contained dan test lolos, buat file terpisah dengan konten minimal yang akan DIISI PENUH di Task 11/13 (bukan placeholder logika — hanya empty-state yang memang final untuk kondisi tanpa model):

`apps/dashboard/components/ring-resizer/RingResizerTab.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRingModels } from "@/lib/hooks/use-ring-models"
import { ModelManager } from "./ModelManager"
import { ProductionPanel } from "./ProductionPanel"

type SubTab = "setup" | "production"

/** Ring Resizer — first tool of the Produk "3D tools" family. */
export function RingResizerTab() {
  const [sub, setSub] = useState<SubTab>("production")
  const ring = useRingModels()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSub("production")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            sub === "production" ? "bg-indigo-500 text-white" : "glass-card g-t3"
          }`}
        >
          Produksi
        </button>
        <button
          type="button"
          onClick={() => setSub("setup")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            sub === "setup" ? "bg-indigo-500 text-white" : "glass-card g-t3"
          }`}
        >
          Setup Model
        </button>
      </div>

      {ring.error && <div className="glass-card p-4 text-sm g-t2">Gagal memuat model: {ring.error}</div>}

      {sub === "setup" ? (
        <ModelManager models={ring.models} loading={ring.loading} onChanged={ring.refresh} />
      ) : (
        <ProductionPanel models={ring.models} loading={ring.loading} />
      )}
    </div>
  )
}
```

`apps/dashboard/components/ring-resizer/ModelManager.tsx` (versi minimal task ini — Task 11 melengkapinya; empty-state ini final):

```tsx
"use client"

import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"

export interface ModelManagerProps {
  models: RingModelWithParts[]
  loading: boolean
  onChanged: () => Promise<void>
}

export function ModelManager({ models, loading }: ModelManagerProps) {
  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>
  if (models.length === 0) {
    return <div className="glass-card p-6 text-sm g-t4">Belum ada model — buat model cincin pertama kamu.</div>
  }
  return <div className="glass-card p-6 text-sm g-t4">{models.length} model</div>
}
```

`apps/dashboard/components/ring-resizer/ProductionPanel.tsx` (versi minimal task ini — Task 13 melengkapinya):

```tsx
"use client"

import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"

export interface ProductionPanelProps {
  models: RingModelWithParts[]
  loading: boolean
}

export function ProductionPanel({ models, loading }: ProductionPanelProps) {
  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>
  if (models.length === 0) {
    return <div className="glass-card p-6 text-sm g-t4">Belum ada model — setup model dulu di tab Setup Model.</div>
  }
  return <div className="glass-card p-6 text-sm g-t4">{models.length} model siap</div>
}
```


- [ ] **Step 5: Wire ke sidebar + halaman produk.**

`components/produk/ProdukSidebar.tsx` — ubah union + items:

```ts
export type ProdukTab = "katalog" | "produk" | "kalkulator" | "filamen" | "ring"

const ITEMS: SectionSidebarItem<ProdukTab>[] = [
  { key: "katalog",    icon: "📦", label: "Katalog" },
  { key: "produk",     icon: "🛍️", label: "Shopee" },
  { key: "kalkulator", icon: "🧮", label: "Kalkulator" },
  { key: "filamen",    icon: "🧵", label: "Filamen" },
  { key: "ring",       icon: "💍", label: "Ring Resizer" },
]
```

`app/(dashboard)/produk/page.tsx` — tambah import dynamic di atas (dekat import lain):

```tsx
import dynamic from "next/dynamic"

const RingResizerTab = dynamic(
  () => import("@/components/ring-resizer/RingResizerTab").then((m) => m.RingResizerTab),
  { ssr: false, loading: () => <div className="glass-card p-6 text-sm g-t4">Memuat Ring Resizer…</div> },
)
```

lalu di tempat tab lain dirender (cari pola `produkTab === "filamen"` / switch yang merender `<FilamenTab />` dkk. di file itu), tambahkan cabang dengan pola yang sama persis:

```tsx
{produkTab === "ring" && <RingResizerTab />}
```

(Ikuti struktur kondisional yang ADA di file — kalau bentuknya ternary berantai atau map, sisipkan dengan gaya yang sama, jangan restrukturisasi.)

- [ ] **Step 6: Run tests + typecheck**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer
cd apps/dashboard && npx tsc --noEmit && cd ../..
```

Expected: PASS (2 tests), tsc bersih.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/components/ring-resizer apps/dashboard/components/produk/ProdukSidebar.tsx "apps/dashboard/app/(dashboard)/produk/page.tsx" apps/dashboard/lib/hooks/use-ring-models.ts
git commit -m "feat(ring-resizer): produk sidebar entry and tab shell"
```

---

### Task 11: Setup UI — ModelManager penuh (create/upload/delete)

**Files:**
- Modify: `apps/dashboard/components/ring-resizer/ModelManager.tsx` (lengkapi)
- Create: `apps/dashboard/components/ring-resizer/ModelForm.tsx`
- Test: `apps/dashboard/components/ring-resizer/__tests__/ModelManager.test.tsx`

**Interfaces:**
- Consumes: API Task 8; `ModelManagerProps` (Task 10, tidak berubah).
- Produces: `ModelManager` menampilkan list model + form create + upload part + tombol "Atur Anchor" per part yang memanggil prop BARU `onEditAnchors?: (modelId: string, partId: string) => void` (dipakai Task 12). `ModelForm` props: `{ onCreated: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test** — `apps/dashboard/components/ring-resizer/__tests__/ModelManager.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ModelManager } from "../ModelManager"

const models = [
  {
    id: "m1", name: "Green Lantern 2026", baseBoreMm: 23.871,
    parts: [
      { id: "p1", name: "band", sizeBytes: 83_000_000, triCount: 1_740_432, anchors: [{ id: "a1", posX: 0, posY: 0, posZ: 0, normX: 0, normY: 0, normZ: 1, upX: 0, upY: 1, upZ: 0, textHeightMm: 3, depthMm: 0.5 }] },
      { id: "p2", name: "frame", sizeBytes: 21_000_000, triCount: 439_804, anchors: [] },
    ],
  },
]

describe("ModelManager", () => {
  it("lists models with part rows and anchor counts", () => {
    const html = renderToStaticMarkup(
      <ModelManager models={models} loading={false} onChanged={async () => {}} />,
    )
    expect(html).toContain("Green Lantern 2026")
    expect(html).toContain("band")
    expect(html).toContain("frame")
    expect(html).toContain("1 anchor")   // p1
    expect(html).toContain("0 anchor")   // p2 — belum di-setup, harus kelihatan
    expect(html).toContain("23.871")
  })

  it("keeps the empty state", () => {
    const html = renderToStaticMarkup(<ModelManager models={[]} loading={false} onChanged={async () => {}} />)
    expect(html).toContain("Belum ada model")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer/__tests__/ModelManager
```

Expected: FAIL — assertion "1 anchor" dkk. belum ada di markup.

- [ ] **Step 3: Implement `ModelForm`** — `apps/dashboard/components/ring-resizer/ModelForm.tsx`:

```tsx
"use client"

import { useState } from "react"

export function ModelForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("")
  const [bore, setBore] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/ring-resizer/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, baseBoreMm: parseFloat(bore) }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setName(""); setBore("")
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass-card flex flex-wrap items-end gap-3 p-4">
      <label className="flex flex-col gap-1 text-xs g-t4">
        Nama model
        <input value={name} onChange={(e) => setName(e.target.value)} required
          className="glass-input rounded-lg px-3 py-2 text-sm" placeholder="Green Lantern 2026" />
      </label>
      <label className="flex flex-col gap-1 text-xs g-t4">
        Base bore (mm) — diameter lubang dalam STL asli
        <input value={bore} onChange={(e) => setBore(e.target.value)} required type="number" step="0.001" min="1"
          className="glass-input rounded-lg px-3 py-2 text-sm" placeholder="23.871" />
      </label>
      <button type="submit" disabled={busy}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Menyimpan…" : "Buat Model"}
      </button>
      {error && <span className="text-xs g-t3">{error}</span>}
    </form>
  )
}
```

- [ ] **Step 4: Lengkapi `ModelManager`** — ganti isi `ModelManager.tsx`:

```tsx
"use client"

import { useRef, useState } from "react"
import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"
import { ModelForm } from "./ModelForm"

export interface ModelManagerProps {
  models: RingModelWithParts[]
  loading: boolean
  onChanged: () => Promise<void>
  onEditAnchors?: (modelId: string, partId: string) => void
}

function fmtBytes(n: number): string {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`
}

function PartUpload({ modelId, onChanged }: { modelId: string; onChanged: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file || !name.trim()) return
    setBusy(true); setError(null)
    try {
      const form = new FormData()
      form.set("file", file)
      form.set("name", name.trim())
      const res = await fetch(`/api/ring-resizer/models/${modelId}/parts`, { method: "POST", body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setName(""); if (fileRef.current) fileRef.current.value = ""
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={upload} className="flex flex-wrap items-center gap-2 text-xs">
      <input ref={fileRef} type="file" accept=".stl" required className="text-xs g-t4" />
      <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="nama part (band/frame/…)"
        className="glass-input rounded-lg px-2 py-1.5 text-xs" />
      <button type="submit" disabled={busy}
        className="rounded-lg bg-indigo-500/80 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
        {busy ? "Upload…" : "Upload Part"}
      </button>
      {error && <span className="g-t3">{error}</span>}
    </form>
  )
}

export function ModelManager({ models, loading, onChanged, onEditAnchors }: ModelManagerProps) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function removeModel(id: string, name: string) {
    if (!window.confirm(`Hapus model "${name}" beserta semua part & anchor?`)) return
    setBusyId(id)
    try {
      await fetch(`/api/ring-resizer/models/${id}`, { method: "DELETE" })
      await onChanged()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>

  return (
    <div className="flex flex-col gap-4">
      <ModelForm onCreated={onChanged} />
      {models.length === 0 && (
        <div className="glass-card p-6 text-sm g-t4">Belum ada model — buat model cincin pertama kamu.</div>
      )}
      {models.map((m) => (
        <div key={m.id} className="glass-card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold g-t1">{m.name}</div>
              <div className="text-xs g-t4">base bore {m.baseBoreMm} mm · {m.parts.length} part</div>
            </div>
            <button type="button" onClick={() => removeModel(m.id, m.name)} disabled={busyId === m.id}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold g-t3 hover:bg-red-500/10 disabled:opacity-50">
              Hapus
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {m.parts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs">
                <span className="font-medium g-t2">{p.name}</span>
                <span className="g-t4">{fmtBytes(p.sizeBytes)} · {p.triCount.toLocaleString()} tri · {p.anchors.length} anchor</span>
                {onEditAnchors && (
                  <button type="button" onClick={() => onEditAnchors(m.id, p.id)}
                    className="rounded-lg bg-indigo-500/80 px-3 py-1.5 font-semibold text-white">
                    Atur Anchor
                  </button>
                )}
              </li>
            ))}
          </ul>
          <PartUpload modelId={m.id} onChanged={onChanged} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run tests + typecheck**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer
cd apps/dashboard && npx tsc --noEmit && cd ../..
```

Expected: PASS semua, tsc bersih.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/ring-resizer
git commit -m "feat(ring-resizer): model manager with create/upload/delete"
```

---

### Task 12: Anchor editor 3D (viewer + klik permukaan + preview text + save)

**Files:**
- Create: `apps/dashboard/components/ring-resizer/AnchorEditor.tsx`
- Create: `apps/dashboard/components/ring-resizer/anchor-math.ts`
- Modify: `apps/dashboard/components/ring-resizer/RingResizerTab.tsx` (state editor terbuka)
- Test: `apps/dashboard/components/ring-resizer/__tests__/anchor-math.test.ts`

**Interfaces:**
- Consumes: `GET /api/ring-resizer/parts/[id]/file` (STL), `PUT /api/ring-resizer/parts/[id]/anchors`, font `/fonts/engrave.ttf` (public), `RingAnchorRow` (Task 10).
- Produces:
  - `anchor-math.ts`: `defaultUp(normal: [number,number,number]): [number,number,number]` (pilih axis dunia paling tegak-lurus normal, proyeksikan ke bidang permukaan, normalisasi) dan `rotateUp(normal: V3, up: V3, degrees: number): V3` (putar `up` di sekitar `normal`)
  - `AnchorEditor` props: `{ partId: string; initialAnchors: RingAnchorRow[]; onClose: () => void; onSaved: () => Promise<void> }`
  - `RingResizerTab` merender `<AnchorEditor …>` full-area saat state `editing: { modelId, partId } | null` terisi (di-set dari `onEditAnchors` milik `ModelManager`)

Catatan komponen r3f tidak dites unit (pola repo: bagian WebGL memang tak bisa jalan di test env — lihat komentar `Lg3DViewer`); yang dites adalah math murni.

- [ ] **Step 1: Write the failing math test** — `apps/dashboard/components/ring-resizer/__tests__/anchor-math.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { defaultUp, rotateUp } from "../anchor-math"

const len = (v: number[]) => Math.hypot(...v)
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe("defaultUp", () => {
  it("returns a unit vector perpendicular to the normal", () => {
    for (const n of [[0, 0, 1], [1, 0, 0], [0.577, 0.577, 0.577]] as const) {
      const up = defaultUp([...n] as [number, number, number])
      expect(len(up)).toBeCloseTo(1, 5)
      expect(Math.abs(dot(up, n))).toBeLessThan(1e-6)
    }
  })
})

describe("rotateUp", () => {
  it("rotating 90° around +Z maps +Y to -X", () => {
    const r = rotateUp([0, 0, 1], [0, 1, 0], 90)
    expect(r[0]).toBeCloseTo(-1, 5)
    expect(r[1]).toBeCloseTo(0, 5)
  })

  it("stays perpendicular to the normal for any angle", () => {
    const n: [number, number, number] = [0.267, 0.535, 0.802]
    const up = defaultUp(n)
    for (const deg of [30, 123, 270]) {
      expect(Math.abs(dot(rotateUp(n, up, deg), n))).toBeLessThan(1e-5)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer/__tests__/anchor-math
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write math** — `apps/dashboard/components/ring-resizer/anchor-math.ts`:

```ts
// Pure vector math for anchor placement — kept out of the r3f component so it
// is testable in the node test environment.

export type V3 = [number, number, number]

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]
const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

/** World axis least parallel to the normal, projected onto the surface plane. */
export function defaultUp(normal: V3): V3 {
  const n = norm(normal)
  const candidates: V3[] = [[0, 0, 1], [0, 1, 0], [1, 0, 0]]
  let best: V3 = candidates[0]
  let bestAbs = 2
  for (const c of candidates) {
    const d = Math.abs(dot(c, n))
    if (d < bestAbs) { bestAbs = d; best = c }
  }
  return norm(sub(best, scale(n, dot(best, n))))
}

/** Rodrigues rotation of `up` around `normal` by `degrees`. */
export function rotateUp(normal: V3, up: V3, degrees: number): V3 {
  const n = norm(normal)
  const rad = (degrees * Math.PI) / 180
  const c = Math.cos(rad), s = Math.sin(rad)
  const term1 = scale(up, c)
  const term2 = scale(cross(n, up), s)
  const term3 = scale(n, dot(n, up) * (1 - c))
  return norm([term1[0] + term2[0] + term3[0], term1[1] + term2[1] + term3[1], term1[2] + term2[2] + term3[2]])
}
```

- [ ] **Step 4: Run math test to verify it passes**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer/__tests__/anchor-math
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write `AnchorEditor`** — `apps/dashboard/components/ring-resizer/AnchorEditor.tsx`:

```tsx
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
        // point is in world space == local space (mesh has no transform)
        const n = e.face.normal.clone().normalize()
        onPick([e.point.x, e.point.y, e.point.z], [n.x, n.y, n.z])
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
    setAnchors((xs) => [...xs, draft])
    setSelected(anchors.length)
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
```

Catatan disengaja (YAGNI, spec §4): preview di editor = plate ukuran-asli + arah panah (bukan glyph ter-extrude penuh) — cukup akurat untuk menempatkan posisi/rotasi/ukuran karena dimensi plate = dimensi text; hasil glyph final diverifikasi dari STL output. Kalau saat sesi setup bareng terasa kurang, upgrade jadi ExtrudeGeometry via opentype.js di iterasi berikutnya.

- [ ] **Step 6: Wire editor ke tab** — di `RingResizerTab.tsx` tambah state + render:

```tsx
// tambahan import
import { AnchorEditor } from "./AnchorEditor"

// di dalam RingResizerTab():
const [editing, setEditing] = useState<{ modelId: string; partId: string } | null>(null)

// cari data anchor part yang diedit dari ring.models:
const editingPart = editing
  ? ring.models.find((m) => m.id === editing.modelId)?.parts.find((p) => p.id === editing.partId)
  : undefined

// render: bila editing → editor menggantikan konten sub-tab setup
{sub === "setup" ? (
  editing && editingPart ? (
    <AnchorEditor
      partId={editing.partId}
      initialAnchors={editingPart.anchors}
      onClose={() => setEditing(null)}
      onSaved={ring.refresh}
    />
  ) : (
    <ModelManager models={ring.models} loading={ring.loading} onChanged={ring.refresh}
      onEditAnchors={(modelId, partId) => setEditing({ modelId, partId })} />
  )
) : (
  <ProductionPanel models={ring.models} loading={ring.loading} />
)}
```

- [ ] **Step 7: Update test Task 10** — `RingResizerTab.test.tsx` sekarang butuh mock `../AnchorEditor` (r3f tidak jalan di node env). Tambahkan di atas import `RingResizerTab`:

```tsx
vi.mock("../AnchorEditor", () => ({ AnchorEditor: () => <div /> }))
```

- [ ] **Step 8: Run tests + typecheck**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer
cd apps/dashboard && npx tsc --noEmit && cd ../..
```

Expected: PASS semua, tsc bersih.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/components/ring-resizer
git commit -m "feat(ring-resizer): 3d anchor editor with surface picking"
```

---

### Task 13: Produksi UI — form ukuran + submit + download + warnings

**Files:**
- Modify: `apps/dashboard/components/ring-resizer/ProductionPanel.tsx` (lengkapi)
- Test: `apps/dashboard/components/ring-resizer/__tests__/ProductionPanel.test.tsx`

**Interfaces:**
- Consumes: `POST /api/ring-resizer/process` (Task 9), `computeScale` + `usToCirc`/`diaToUs` (Task 2 — dipakai untuk ringkasan live di client), `RingModelWithParts` (Task 10). `ProductionPanelProps` tidak berubah.

- [ ] **Step 1: Write the failing test** — `apps/dashboard/components/ring-resizer/__tests__/ProductionPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ProductionPanel } from "../ProductionPanel"

const models = [
  {
    id: "m1", name: "Green Lantern 2026", baseBoreMm: 23.871,
    parts: [
      { id: "p1", name: "band", sizeBytes: 1, triCount: 1, anchors: [{ id: "a1", posX: 0, posY: 0, posZ: 0, normX: 0, normY: 0, normZ: 1, upX: 0, upY: 1, upZ: 0, textHeightMm: 3, depthMm: 0.5 }] },
    ],
  },
]

describe("ProductionPanel", () => {
  it("renders size modes, clearance toggle, and live scale summary for default US 8", () => {
    const html = renderToStaticMarkup(<ProductionPanel models={models} loading={false} />)
    expect(html).toContain("US Size")
    expect(html).toContain("Diameter")
    expect(html).toContain("Keliling")
    expect(html).toContain("kelonggaran")
    // default US 8 + 0.3 clearance on 23.871 bore → 77.13%
    expect(html).toContain("77.13")
    expect(html).toContain("Green Lantern 2026")
  })

  it("keeps the empty state", () => {
    const html = renderToStaticMarkup(<ProductionPanel models={[]} loading={false} />)
    expect(html).toContain("Belum ada model")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer/__tests__/ProductionPanel
```

Expected: FAIL — markup belum mengandung form.

- [ ] **Step 3: Lengkapi `ProductionPanel.tsx`:**

```tsx
"use client"

import { useMemo, useState } from "react"
import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"
import { computeScale, type SizeMode } from "@/lib/ring-resizer/sizing"

export interface ProductionPanelProps {
  models: RingModelWithParts[]
  loading: boolean
}

const MODE_LABEL: Record<SizeMode, string> = { us: "US Size", dia: "Diameter (mm)", circ: "Keliling (mm)" }
const MODE_DEFAULT: Record<SizeMode, number> = { us: 8, dia: 18.1, circ: 57 }

export function ProductionPanel({ models, loading }: ProductionPanelProps) {
  const [modelId, setModelId] = useState<string | null>(null)
  const [mode, setMode] = useState<SizeMode>("us")
  const [value, setValue] = useState<number>(8)
  const [clearance, setClearance] = useState(true)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const model = models.find((m) => m.id === modelId) ?? models[0]

  const summary = useMemo(() => {
    if (!model || !(value > 0)) return null
    try {
      return computeScale({ mode, value, clearanceMm: clearance ? 0.3 : 0, baseBoreMm: model.baseBoreMm })
    } catch {
      return null
    }
  }, [model, mode, value, clearance])

  const defaultText = summary ? `US ${summary.usEquivalent.toFixed(1).replace(/\.0$/, "")}` : ""
  const effectiveText = text || defaultText

  async function submit() {
    if (!model || !summary) return
    setBusy(true); setError(null); setWarnings([])
    try {
      const res = await fetch("/api/ring-resizer/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id, mode, value, clearanceMm: clearance ? 0.3 : 0, text: effectiveText,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setWarnings(JSON.parse(res.headers.get("X-Ring-Warnings") ?? "[]"))
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") ?? ""
      const fname = /filename="([^"]+)"/.exec(cd)?.[1] ?? "ring.zip"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>
  if (models.length === 0) {
    return <div className="glass-card p-6 text-sm g-t4">Belum ada model — setup model dulu di tab Setup Model.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-1 text-xs g-t4">
          Model cincin
          <select value={model?.id} onChange={(e) => setModelId(e.target.value)}
            className="glass-input max-w-xs rounded-lg px-3 py-2 text-sm">
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>

        <div className="flex gap-2">
          {(Object.keys(MODE_LABEL) as SizeMode[]).map((m) => (
            <button key={m} type="button"
              onClick={() => { setMode(m); setValue(MODE_DEFAULT[m]) }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === m ? "bg-indigo-500 text-white" : "glass-card g-t3"
              }`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs g-t4">
            {MODE_LABEL[mode]}
            <input type="number" value={value} step={mode === "us" ? 0.5 : 0.1} min={0}
              onChange={(e) => setValue(Number(e.target.value))}
              className="glass-input w-32 rounded-lg px-3 py-2 text-lg font-bold" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs g-t4">
            <input type="checkbox" checked={clearance} onChange={(e) => setClearance(e.target.checked)} />
            + 0.3 mm kelonggaran (rekomendasi)
          </label>
          <label className="flex flex-col gap-1 text-xs g-t4">
            Text engrave
            <input value={text} placeholder={defaultText} maxLength={24}
              onChange={(e) => setText(e.target.value)}
              className="glass-input w-48 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>

        {summary && model && (
          <div className="rounded-xl border border-indigo-500/40 p-4 text-sm">
            <span className="text-2xl font-extrabold g-t1">{(summary.scale * 100).toFixed(2)}%</span>
            <span className="ml-3 g-t4">
              ≈ US {summary.usEquivalent.toFixed(1)} · target lubang {summary.targetDiaMm.toFixed(2)} mm ·
              keliling {summary.circMm.toFixed(1)} mm · {model.parts.length} part ·
              {" "}{model.parts.reduce((n, p) => n + p.anchors.length, 0)} anchor · text “{effectiveText}”
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={submit} disabled={busy || !summary}
            className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Memproses… (bisa ~1 menit)" : "Proses & Download ZIP"}
          </button>
          {error && <span className="text-xs g-t3">{error}</span>}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="glass-card p-4 text-xs g-t3">
          <div className="mb-1 font-semibold">Warning:</div>
          <ul className="list-disc pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter shopee-dashboard test -- components/ring-resizer
cd apps/dashboard && npx tsc --noEmit && cd ../..
```

Expected: PASS semua, tsc bersih. (Angka `77.13` di test = `(18.4121/23.871*100).toFixed(2)` — kalau meleset, cek pembulatan `toFixed(2)` di markup.)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/ring-resizer
git commit -m "feat(ring-resizer): production panel with live scale summary and zip download"
```

---

### Task 14: Verifikasi menyeluruh + smoke test manual

**Files:**
- Modify: (perbaikan kecil apa pun yang muncul dari lint/test/build)

- [ ] **Step 1: Full workspace test + lint + build**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd ~/Documents/shopee-analysis/.claude/worktrees/ring-resizer
pnpm turbo test
pnpm --filter shopee-dashboard lint
pnpm --filter shopee-dashboard build
```

Expected: semua test workspace PASS (termasuk 14 golden test kalkulator-core — tidak boleh tersentuh), lint bersih, build sukses. Perbaiki apa pun yang gagal sebelum lanjut.

- [ ] **Step 2: Smoke test end-to-end lokal** (butuh DATABASE_URL + MinIO hidup; kalau env lokal tak ada, tandai step ini "Perlu verifikasi di homelab" dan laporkan — JANGAN deploy sendiri):

```bash
pnpm --filter shopee-dashboard dev
```

Lalu di browser (login dulu): buka `/produk` → sidebar **Ring Resizer** → Setup Model:
1. Buat model "Green Lantern 2026", base bore `23.871`.
2. Upload part `band` pakai file kecil dulu (contoh: `frame Green Lantern 2026 Ring Do3D.stl`, 21 MB, dari `/Volumes/3D Model/Do3D/#LS2713 Green Lantern 2026 Ring Do3D/`).
3. Atur Anchor → double-click permukaan dalam → set rotasi/tinggi/kedalaman → Simpan.
4. Tab Produksi → US 8 → cek ringkasan `77.13%` → Proses & Download ZIP.
5. Buka STL hasil di slicer/viewer: ukuran ~77% asli, text ter-engrave di posisi anchor, kedalaman ~0.5 mm.
6. Ulangi produksi dengan `US 6` — pastikan huruf SAMA besar (tidak ikut mengecil).
7. Cek tampilan light DAN dark mode.

- [ ] **Step 3: Commit perbaikan (bila ada) & laporkan**

```bash
git add <path spesifik yang berubah>
git commit -m "fix(ring-resizer): smoke test fixes"
```

Laporkan ke user: status test, hasil smoke test, dan bahwa branch `claude/ring-resizer` siap di-review/merge — biarkan user yang memutuskan merge & deploy. Catat juga task ke board via task-tracker (status "Perlu verifikasi/test").
