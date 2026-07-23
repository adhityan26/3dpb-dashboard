# Thumbnail Plate dari 3MF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ekstrak preview render plate (`Metadata/plate_N.png`) dari file `.gcode.3mf` saat import, tampilkan sebagai thumbnail per Part/Plate di form kalkulator, dan simpan permanen ke MinIO supaya tetap muncul saat kalkulasi dibuka lagi.

**Architecture:** Thumbnail di-extract client-side (JSZip, sudah dipakai fitur import-3mf) sebagai `Blob`, ditampilkan instan via `URL.createObjectURL`. Setelah Kalkulasi disimpan (plate sudah punya `id` asli), browser upload tiap thumbnail pending ke endpoint baru yang menyimpannya di MinIO (reuse `lib/minio.ts`/`lib/lg-storage.ts`, bucket yang sama dipakai foto order light-generator) dan menyimpan **key**-nya (bukan URL, karena presigned URL expire) di kolom baru `KalkulasiPlate.thumbnailKey`. Endpoint GET terpisah proxy gambar dari MinIO via presigned URL fresh tiap request — pola identik `app/api/light-generator/orders/[id]/additional/route.ts` yang sudah ada.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7 (`db push`), MinIO via `@aws-sdk/client-s3` (sudah dipakai), JSZip (sudah dipakai fitur import-3mf), Vitest.

## Global Constraints

- Deploy proyek ini pakai `prisma db push --accept-data-loss` otomatis — **JANGAN** bikin migration file manual. Edit `schema.prisma` lalu `npx prisma generate` (tidak butuh koneksi database).
- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum semua command node/pnpm/npx.
- File `.gcode.3mf` aslinya (bisa puluhan MB) **TIDAK PERNAH** diupload ke server — cuma thumbnail PNG (~50-200KB) yang diupload, dan itu pun cuma setelah Kalkulasi disimpan (bukan saat import).
- `thumbnailKey` murni informational — **TIDAK** boleh dipakai/dibaca `hitungKalkulasiV2`/`resolve-v2.ts`/apapun di `packages/kalkulator-core`.
- `thumbnailKey` disimpan sebagai **key MinIO**, bukan URL — presigned URL expire (default 1 jam), key tidak.
- Upload thumbnail bersifat best-effort: gagal upload **tidak boleh** menggagalkan save Kalkulasi itu sendiri.
- Tidak ada cleanup otomatis untuk thumbnail 1 part yang dihapus individual saat edit (di luar scope) — cuma cleanup saat seluruh Kalkulasi dihapus.

---

## File Structure

```
apps/dashboard/prisma/schema.prisma                        # MODIFY — kolom thumbnailKey
apps/dashboard/lib/kalkulator/types.ts                      # MODIFY — PlateData.thumbnailKey
apps/dashboard/lib/kalkulator/service.ts                    # MODIFY — toKalkulasiData mapping + deleteKalkulasi cleanup
apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts  # MODIFY — test thumbnailKey read + delete cleanup
apps/dashboard/app/api/kalkulator/plates/[plateId]/thumbnail/route.ts       # CREATE — PUT (upload) + GET (proxy display)
apps/dashboard/app/api/kalkulator/plates/[plateId]/thumbnail/route.test.ts  # CREATE
apps/dashboard/lib/kalkulator/import-3mf/read-zip.ts         # MODIFY — readPlateThumbnails()
apps/dashboard/lib/kalkulator/import-3mf/__tests__/read-zip.test.ts  # MODIFY
apps/dashboard/lib/kalkulator/import-3mf/types.ts            # MODIFY — Kalkulasi3mfDraft.thumbnails
apps/dashboard/lib/kalkulator/import-3mf/index.ts             # MODIFY — wiring readPlateThumbnails
apps/dashboard/lib/kalkulator/import-3mf/__tests__/index.test.ts  # MODIFY
apps/dashboard/lib/hooks/use-kalkulator.ts                   # MODIFY — useUploadPlateThumbnail()
apps/dashboard/components/kalkulator/KalkulasiForm.tsx       # MODIFY — state, handleImport3mf, handleSave
apps/dashboard/components/kalkulator/PlateTable.tsx          # MODIFY — render thumbnail di header Part
```

---

### Task 1: Data model — kolom `thumbnailKey` + read mapping + cleanup saat delete

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma`
- Modify: `apps/dashboard/lib/kalkulator/types.ts`
- Modify: `apps/dashboard/lib/kalkulator/service.ts`
- Modify: `apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts`

**Interfaces:**
- Produces: `PlateData.thumbnailKey?: string | null` — dipakai Task 6 (UI, untuk tahu plate mana yang punya thumbnail tersimpan). `deleteKalkulasi` (sudah ada, diubah) — dipakai existing callers, tidak ada perubahan signature.

- [ ] **Step 1: Tulis failing test — thumbnailKey ikut ke-baca**

Di `apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts`, cari `describe('duplicateKalkulasi', ...)` block (ada `const plateRaw = {...}` di dalamnya). Di describe block terpisah SETELAH `describe('duplicateKalkulasi', ...)` (bikin describe block baru di akhir file), tambahkan:

```ts
describe('deleteKalkulasi', () => {
  it('hapus best-effort thumbnail MinIO tiap plate yang punya thumbnailKey, sebelum hapus row DB', async () => {
    db.kalkulasiPlate.findMany.mockResolvedValue([
      { thumbnailKey: 'kalkulator-thumbnails/p1.png' },
      { thumbnailKey: null },
      { thumbnailKey: 'kalkulator-thumbnails/p3.png' },
    ])
    db.kalkulasiHarga.delete.mockResolvedValue({})
    await deleteKalkulasi('k1')
    expect(db.kalkulasiPlate.findMany).toHaveBeenCalledWith({ where: { kalkulasiId: 'k1' }, select: { thumbnailKey: true } })
    expect(db.kalkulasiHarga.delete).toHaveBeenCalledWith({ where: { id: 'k1' } })
    expect(vi.mocked(deleteFromMinio)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(deleteFromMinio)).toHaveBeenCalledWith('kalkulator-thumbnails/p1.png')
    expect(vi.mocked(deleteFromMinio)).toHaveBeenCalledWith('kalkulator-thumbnails/p3.png')
  })

  it('deleteFromMinio gagal → tetap tidak throw (best-effort)', async () => {
    db.kalkulasiPlate.findMany.mockResolvedValue([{ thumbnailKey: 'kalkulator-thumbnails/p1.png' }])
    db.kalkulasiHarga.delete.mockResolvedValue({})
    vi.mocked(deleteFromMinio).mockRejectedValue(new Error('network error'))
    await expect(deleteKalkulasi('k1')).resolves.toBeUndefined()
  })

  it('tidak ada plate yang punya thumbnailKey → deleteFromMinio tidak dipanggil sama sekali', async () => {
    db.kalkulasiPlate.findMany.mockResolvedValue([{ thumbnailKey: null }])
    db.kalkulasiHarga.delete.mockResolvedValue({})
    await deleteKalkulasi('k1')
    expect(vi.mocked(deleteFromMinio)).not.toHaveBeenCalled()
  })
})
```

Di bagian atas file (setelah `vi.mock('@/lib/db', ...)` yang sudah ada), tambahkan mock baru dan import:

```ts
vi.mock('@/lib/lg-storage', () => ({ deleteFromMinio: vi.fn() }))
```

Tambahkan `deleteFromMinio` ke import dari `'@/lib/lg-storage'` (baris baru), dan tambahkan `deleteKalkulasi` ke import yang sudah ada dari `'../service'`:

```ts
import { deleteFromMinio } from '@/lib/lg-storage'
```

Ubah baris import service yang sudah ada:
```ts
import { createKalkulasi, duplicateKalkulasi, listKalkulasi, getKalkulasi, parsePagination } from '../service'
```
jadi:
```ts
import { createKalkulasi, duplicateKalkulasi, listKalkulasi, getKalkulasi, deleteKalkulasi, parsePagination } from '../service'
```

Juga tambahkan `findMany: vi.fn()` ke mock `kalkulasiPlate` di dalam `vi.mock('@/lib/db', ...)` (cari blok ini persis):
```ts
vi.mock('@/lib/db', () => ({
  prisma: {
    kalkulasiHarga: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), delete: vi.fn() },
    kalkulasiPlate: { deleteMany: vi.fn() },
    komponenKustom: { deleteMany: vi.fn() },
    kalkulasiLabor: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}))
```
Ubah baris `kalkulasiPlate` jadi:
```ts
    kalkulasiPlate: { deleteMany: vi.fn(), findMany: vi.fn() },
```

Dan update type `MockedPrisma` (cari `type MockedPrisma = {...}` persis di file itu) — ubah baris `kalkulasiPlate: { deleteMany: Mock }` jadi `kalkulasiPlate: { deleteMany: Mock; findMany: Mock }`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/__tests__/service-v2.test.ts
```
Expected: FAIL — `deleteKalkulasi` belum di-export dengan behavior baru (masih `prisma.kalkulasiHarga.delete` doang, `kalkulasiPlate.findMany`/`deleteFromMinio` tidak pernah dipanggil).

- [ ] **Step 3: Tambah kolom `thumbnailKey` ke Prisma schema**

Di `apps/dashboard/prisma/schema.prisma`, cari baris ini di `model KalkulasiPlate` (baris terakhir sebelum `}`):

```prisma
  color                String?                          // hex warna filament, single-material mode (informational)
}
```

Ubah jadi:

```prisma
  color                String?                          // hex warna filament, single-material mode (informational)
  thumbnailKey         String?                          // MinIO object key preview render plate (informational)
}
```

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
npx prisma generate --schema apps/dashboard/prisma/schema.prisma
```
Expected: `✔ Generated Prisma Client`.

- [ ] **Step 4: Tambah `thumbnailKey` ke `PlateData`**

Di `apps/dashboard/lib/kalkulator/types.ts`, cari `interface PlateData` (persis seperti ini):

```ts
export interface PlateData extends PlateInput {
  id: string
  urutan: number
  kalkulasiId: string
  printerProfileId?: string | null
  materialProfileId?: string | null
  mesinPerJam?: number | null
}
```

Ubah jadi:

```ts
export interface PlateData extends PlateInput {
  id: string
  urutan: number
  kalkulasiId: string
  printerProfileId?: string | null
  materialProfileId?: string | null
  mesinPerJam?: number | null
  thumbnailKey?: string | null
}
```

- [ ] **Step 5: Wiring read path di `service.ts` (`toKalkulasiData`)**

Di `apps/dashboard/lib/kalkulator/service.ts`, cari fungsi `toKalkulasiData`, bagian plates mapping (persis seperti ini):

```ts
    plates: (raw.plates ?? []).map((p: any) => ({
      ...p,
      materials: p.materialsJson ? JSON.parse(p.materialsJson) : undefined,
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.filamentHargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      materialProfileId: p.materialProfileId ?? undefined,
      mesinPerJam: p.mesinPerJam ?? undefined,
      color: p.color ?? undefined,
    })),
```

Ubah jadi (tambah baris `thumbnailKey`):

```ts
    plates: (raw.plates ?? []).map((p: any) => ({
      ...p,
      materials: p.materialsJson ? JSON.parse(p.materialsJson) : undefined,
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.filamentHargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      materialProfileId: p.materialProfileId ?? undefined,
      mesinPerJam: p.mesinPerJam ?? undefined,
      color: p.color ?? undefined,
      thumbnailKey: p.thumbnailKey ?? undefined,
    })),
```

Catatan: `thumbnailKey` **TIDAK** ditambahkan ke `platesCreate` (write path) — field ini di-set lewat endpoint upload terpisah (Task 2) setelah plate punya `id` asli, bukan bagian dari payload create/update biasa. `PlateInput`/`PlateInputApp`/`KalkulasiInput` (kalkulator-core) juga TIDAK berubah di task ini.

- [ ] **Step 6: Ubah `deleteKalkulasi` — cleanup MinIO best-effort sebelum hapus row**

Di `apps/dashboard/lib/kalkulator/service.ts`, tambahkan import baru di bagian atas file (cari baris `import { prisma } from '@/lib/db'`, tambahkan setelahnya):

```ts
import { deleteFromMinio } from '@/lib/lg-storage'
```

Cari fungsi `deleteKalkulasi` (persis seperti ini):

```ts
export async function deleteKalkulasi(id: string): Promise<void> {
  await prisma.kalkulasiHarga.delete({ where: { id } })
}
```

Ubah jadi:

```ts
export async function deleteKalkulasi(id: string): Promise<void> {
  const plates = await prisma.kalkulasiPlate.findMany({ where: { kalkulasiId: id }, select: { thumbnailKey: true } })
  await prisma.kalkulasiHarga.delete({ where: { id } })
  await Promise.all(
    plates
      .filter((p): p is { thumbnailKey: string } => !!p.thumbnailKey)
      .map(p => deleteFromMinio(p.thumbnailKey).catch(() => undefined)),
  )
}
```

- [ ] **Step 7: Jalankan test, pastikan lolos**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/__tests__/service-v2.test.ts
```
Expected: PASS (semua test di file itu, termasuk 3 test baru).

- [ ] **Step 8: Type-check**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "service\.ts|types\.ts|service-v2"
```
Expected: tidak ada output.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/prisma/schema.prisma apps/dashboard/lib/kalkulator/types.ts apps/dashboard/lib/kalkulator/service.ts apps/dashboard/lib/kalkulator/__tests__/service-v2.test.ts
git commit -m "feat(kalkulator): kolom thumbnailKey per plate + cleanup MinIO best-effort saat delete kalkulasi"
```

---

### Task 2 & 3: Endpoint upload (PUT) + display proxy (GET) thumbnail plate

**Files:**
- Create: `apps/dashboard/app/api/kalkulator/plates/[plateId]/thumbnail/route.ts`
- Test: `apps/dashboard/app/api/kalkulator/plates/[plateId]/thumbnail/route.test.ts`

**Interfaces:**
- Consumes: `uploadToMinio`, `getPresignedUrl` dari `@/lib/lg-storage` (sudah ada), `prisma` dari `@/lib/db` (sudah ada, `prisma.kalkulasiPlate.findUnique`/`.update`).
- Produces: `PUT /api/kalkulator/plates/[plateId]/thumbnail` (multipart, field `file`) → `{ thumbnailKey: string }`. `GET /api/kalkulator/plates/[plateId]/thumbnail` → image bytes (`Content-Type: image/png`). Dipakai Task 6 (`useUploadPlateThumbnail` hook, dan `<img src="/api/kalkulator/plates/{id}/thumbnail">`).

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/app/api/kalkulator/plates/[plateId]/thumbnail/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    kalkulasiPlate: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/lg-storage', () => ({
  uploadToMinio: vi.fn(),
  getPresignedUrl: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadToMinio, getPresignedUrl } from '@/lib/lg-storage'
import { PUT, GET } from './route'

const mockAuth = vi.mocked(auth)
const ctx = (plateId: string) => ({ params: Promise.resolve({ plateId }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'OWNER', name: 'a' }, expires: '2099-01-01T00:00:00.000Z' } as any)
})

describe('PUT /api/kalkulator/plates/[plateId]/thumbnail', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const req = { formData: async () => new FormData() } as unknown as NextRequest
    const res = await PUT(req, ctx('p1'))
    expect(res.status).toBe(401)
  })

  it('404 kalau plate tidak ada', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue(null)
    const form = new FormData()
    form.append('file', new File(['x'], 'plate.png', { type: 'image/png' }))
    const req = { formData: async () => form } as unknown as NextRequest
    const res = await PUT(req, ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('400 kalau tidak ada field file', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue({ id: 'p1' } as any)
    const req = { formData: async () => new FormData() } as unknown as NextRequest
    const res = await PUT(req, ctx('p1'))
    expect(res.status).toBe(400)
  })

  it('upload sukses → simpan key ke kolom thumbnailKey, return key-nya', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue({ id: 'p1' } as any)
    vi.mocked(prisma.kalkulasiPlate.update).mockResolvedValue({} as any)
    const form = new FormData()
    form.append('file', new File(['x'], 'plate.png', { type: 'image/png' }))
    const req = { formData: async () => form } as unknown as NextRequest
    const res = await PUT(req, ctx('p1'))
    expect(res.status).toBe(200)
    expect(vi.mocked(uploadToMinio)).toHaveBeenCalledWith('kalkulator-thumbnails/p1.png', expect.any(Buffer), 'image/png')
    expect(vi.mocked(prisma.kalkulasiPlate.update)).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { thumbnailKey: 'kalkulator-thumbnails/p1.png' } })
    expect(await res.json()).toEqual({ thumbnailKey: 'kalkulator-thumbnails/p1.png' })
  })
})

describe('GET /api/kalkulator/plates/[plateId]/thumbnail', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET({} as NextRequest, ctx('p1'))
    expect(res.status).toBe(401)
  })

  it('404 kalau plate tidak ada', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue(null)
    const res = await GET({} as NextRequest, ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('404 kalau plate ada tapi thumbnailKey kosong', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue({ id: 'p1', thumbnailKey: null } as any)
    const res = await GET({} as NextRequest, ctx('p1'))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run app/api/kalkulator/plates
```
Expected: FAIL — `./route` tidak ditemukan.

- [ ] **Step 3: Implementasi**

Create `apps/dashboard/app/api/kalkulator/plates/[plateId]/thumbnail/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { uploadToMinio, getPresignedUrl } from "@/lib/lg-storage"

function thumbnailKeyFor(plateId: string): string {
  return `kalkulator-thumbnails/${plateId}.png`
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ plateId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { plateId } = await params
  const plate = await prisma.kalkulasiPlate.findUnique({ where: { id: plateId } })
  if (!plate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = thumbnailKeyFor(plateId)
  await uploadToMinio(key, buffer, "image/png")
  await prisma.kalkulasiPlate.update({ where: { id: plateId }, data: { thumbnailKey: key } })

  return NextResponse.json({ thumbnailKey: key })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ plateId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { plateId } = await params
  const plate = await prisma.kalkulasiPlate.findUnique({ where: { id: plateId } })
  if (!plate?.thumbnailKey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Proxy lewat Next.js — presigned URL / IP internal MinIO tidak pernah kena expose ke browser
  const url = await getPresignedUrl(plate.thumbnailKey)
  const upstream = await fetch(url)
  if (!upstream.ok) return NextResponse.json({ error: "Image not found" }, { status: 404 })

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  })
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run app/api/kalkulator/plates
```
Expected: PASS (8 test).

- [ ] **Step 5: Type-check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "plates/\[plateId\]"
```
Expected: tidak ada output.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/api/kalkulator/plates/
git commit -m "feat(kalkulator): endpoint upload (PUT) + proxy display (GET) thumbnail plate"
```

---

### Task 4: `readPlateThumbnails` — ekstrak PNG plate dari ZIP 3MF

**Files:**
- Modify: `apps/dashboard/lib/kalkulator/import-3mf/read-zip.ts`
- Modify: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/read-zip.test.ts`

**Interfaces:**
- Produces: `readPlateThumbnails(buf: ArrayBuffer, plateCount: number): Promise<(Blob | null)[]>` — array sepanjang `plateCount`, `null` di index yang gambarnya tidak ada. Dipakai Task 5 (`index.ts`).

- [ ] **Step 1: Tulis failing test**

Di `apps/dashboard/lib/kalkulator/import-3mf/__tests__/read-zip.test.ts`, cari baris import (persis seperti ini):

```ts
import { readGcode3mfEntries } from "../read-zip"
```

Ubah jadi:

```ts
import { readGcode3mfEntries, readPlateThumbnails } from "../read-zip"
```

Tambahkan describe block baru di akhir file:

```ts
describe("readPlateThumbnails", () => {
  it("ekstrak Metadata/plate_N.png (1-based) sebagai Blob, null kalau tidak ada", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config></config>",
      "Metadata/plate_1.png": "fake-png-bytes-1",
      "Metadata/plate_2.png": "fake-png-bytes-2",
    })
    const thumbs = await readPlateThumbnails(buf, 3)
    expect(thumbs).toHaveLength(3)
    expect(thumbs[0]).toBeInstanceOf(Blob)
    expect(thumbs[1]).toBeInstanceOf(Blob)
    expect(thumbs[2]).toBeNull() // plate_3.png tidak ada di ZIP
  })

  it("isi Blob-nya benar (round-trip)", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config></config>",
      "Metadata/plate_1.png": "fake-png-bytes-1",
    })
    const thumbs = await readPlateThumbnails(buf, 1)
    const text = await thumbs[0]!.text()
    expect(text).toBe("fake-png-bytes-1")
  })

  it("plateCount 0 → array kosong", async () => {
    const buf = await makeZip({ "Metadata/model_settings.config": "<config></config>" })
    expect(await readPlateThumbnails(buf, 0)).toEqual([])
  })

  it("ZIP corrupt → array berisi null sepanjang plateCount, tidak throw", async () => {
    const buf = new TextEncoder().encode("bukan zip").buffer
    const thumbs = await readPlateThumbnails(buf, 2)
    expect(thumbs).toEqual([null, null])
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/read-zip.test.ts
```
Expected: FAIL — `readPlateThumbnails` bukan export yang ada.

- [ ] **Step 3: Implementasi**

Di `apps/dashboard/lib/kalkulator/import-3mf/read-zip.ts`, tambahkan fungsi baru di akhir file (setelah `readGcode3mfEntries`):

```ts
/** Ekstrak thumbnail preview per plate (Metadata/plate_N.png, 1-based) dari ZIP .3mf
 *  hasil slice. Return array sepanjang plateCount — null di index yang gambarnya tidak
 *  ada (mis. file belum di-slice, atau ZIP corrupt). File .gcode yang besar tetap tidak
 *  disentuh (path berbeda, tidak pernah di-baca fungsi ini). */
export async function readPlateThumbnails(buf: ArrayBuffer, plateCount: number): Promise<(Blob | null)[]> {
  if (plateCount <= 0) return []

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    return Array(plateCount).fill(null)
  }

  const result: (Blob | null)[] = []
  for (let i = 1; i <= plateCount; i++) {
    const file = zip.file(`Metadata/plate_${i}.png`)
    result.push(file ? await file.async("blob") : null)
  }
  return result
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/read-zip.test.ts
```
Expected: PASS (semua test di file, termasuk 4 test baru).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/read-zip.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/read-zip.test.ts
git commit -m "feat(kalkulator): readPlateThumbnails — ekstrak preview PNG per plate dari ZIP 3MF"
```

---

### Task 5: Wiring `thumbnails` ke `Kalkulasi3mfDraft` + orchestrator

**Files:**
- Modify: `apps/dashboard/lib/kalkulator/import-3mf/types.ts`
- Modify: `apps/dashboard/lib/kalkulator/import-3mf/index.ts`
- Modify: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `readPlateThumbnails` (Task 4).
- Produces: `Kalkulasi3mfDraft.thumbnails: (Blob | null)[]` — index-aligned dengan `Kalkulasi3mfDraft.plates`. Dipakai Task 6 (`KalkulasiForm.tsx`).

- [ ] **Step 1: Tulis failing test**

Di `apps/dashboard/lib/kalkulator/import-3mf/__tests__/index.test.ts`, cari test `"parses a full .gcode.3mf file end-to-end into a Kalkulasi3mfDraft"` (persis seperti ini):

```ts
  it("parses a full .gcode.3mf file end-to-end into a Kalkulasi3mfDraft", async () => {
    const file = await makeFile("My Print.gcode.3mf", {
      "Metadata/model_settings.config": MODEL_SETTINGS_XML,
      "Metadata/project_settings.config": PROJECT_SETTINGS_JSON,
      "Metadata/slice_info.config": SLICE_INFO_XML,
    })
    const draft = await import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })
    expect(draft.nama).toBe("My Print")
    expect(draft.isSliced).toBe(true)
    expect(draft.plates).toHaveLength(1)
    expect(draft.plates[0].gramasi).toBe(10)
  })
```

Ubah jadi (tambah thumbnail PNG ke fixture ZIP + assertion `thumbnails`):

```ts
  it("parses a full .gcode.3mf file end-to-end into a Kalkulasi3mfDraft", async () => {
    const file = await makeFile("My Print.gcode.3mf", {
      "Metadata/model_settings.config": MODEL_SETTINGS_XML,
      "Metadata/project_settings.config": PROJECT_SETTINGS_JSON,
      "Metadata/slice_info.config": SLICE_INFO_XML,
      "Metadata/plate_1.png": "fake-png-bytes",
    })
    const draft = await import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })
    expect(draft.nama).toBe("My Print")
    expect(draft.isSliced).toBe(true)
    expect(draft.plates).toHaveLength(1)
    expect(draft.plates[0].gramasi).toBe(10)
    expect(draft.thumbnails).toHaveLength(1)
    expect(draft.thumbnails[0]).toBeInstanceOf(Blob)
  })

  it("plate tanpa Metadata/plate_N.png → thumbnails berisi null di index itu", async () => {
    const file = await makeFile("No Thumbnail.gcode.3mf", {
      "Metadata/model_settings.config": MODEL_SETTINGS_XML,
      "Metadata/project_settings.config": PROJECT_SETTINGS_JSON,
      "Metadata/slice_info.config": SLICE_INFO_XML,
    })
    const draft = await import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })
    expect(draft.thumbnails).toEqual([null])
  })
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/index.test.ts
```
Expected: FAIL — `draft.thumbnails` adalah `undefined`, bukan array.

- [ ] **Step 3: Tambah field `thumbnails` ke tipe `Kalkulasi3mfDraft`**

Di `apps/dashboard/lib/kalkulator/import-3mf/types.ts`, cari interface `Kalkulasi3mfDraft` (persis seperti ini):

```ts
/** Hasil akhir siap di-apply ke state form KalkulasiForm */
export interface Kalkulasi3mfDraft {
  nama: string
  batch: number
  plates: PlateInputApp[]
  isSliced: boolean
  warnings: string[]
}
```

Ubah jadi:

```ts
/** Hasil akhir siap di-apply ke state form KalkulasiForm */
export interface Kalkulasi3mfDraft {
  nama: string
  batch: number
  plates: PlateInputApp[]
  isSliced: boolean
  warnings: string[]
  /** Thumbnail preview per plate (index-aligned dengan `plates`), null kalau plate itu
   *  tidak punya Metadata/plate_N.png di ZIP-nya. */
  thumbnails: (Blob | null)[]
}
```

- [ ] **Step 4: Wiring di `index.ts`**

Di `apps/dashboard/lib/kalkulator/import-3mf/index.ts`, ubah import (persis seperti ini):

```ts
import { readGcode3mfEntries } from "./read-zip"
```

jadi:

```ts
import { readGcode3mfEntries, readPlateThumbnails } from "./read-zip"
```

Cari bagian akhir fungsi `import3mfFile` (persis seperti ini):

```ts
  return buildKalkulasi3mfDraft({
    fileName: file.name,
    slicePlates,
    modelPlates,
    filamentSlots,
    filamentCatalog: deps.filamentCatalog,
    printerProfiles: deps.printerProfiles,
  })
}
```

Ubah jadi:

```ts
  const draft = buildKalkulasi3mfDraft({
    fileName: file.name,
    slicePlates,
    modelPlates,
    filamentSlots,
    filamentCatalog: deps.filamentCatalog,
    printerProfiles: deps.printerProfiles,
  })

  const thumbnails = await readPlateThumbnails(buf, draft.plates.length)
  return { ...draft, thumbnails }
}
```

- [ ] **Step 5: Jalankan test, pastikan lolos**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/index.test.ts
```
Expected: PASS (semua test, termasuk 2 test baru/diubah).

- [ ] **Step 6: Regresi seluruh suite import-3mf + type-check**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf
cd apps/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "import-3mf"
```
Expected: semua test PASS, tidak ada output dari grep tsc.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/types.ts apps/dashboard/lib/kalkulator/import-3mf/index.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/index.test.ts
git commit -m "feat(kalkulator): Kalkulasi3mfDraft.thumbnails — wiring readPlateThumbnails ke import3mfFile"
```

---

### Task 6: UI — preview instan, upload setelah save, tampilkan thumbnail tersimpan

**Files:**
- Modify: `apps/dashboard/lib/hooks/use-kalkulator.ts`
- Modify: `apps/dashboard/components/kalkulator/KalkulasiForm.tsx`
- Modify: `apps/dashboard/components/kalkulator/PlateTable.tsx`

**Interfaces:**
- Consumes: `PUT /api/kalkulator/plates/[plateId]/thumbnail` (Task 2), `Kalkulasi3mfDraft.thumbnails` (Task 5), `PlateData.thumbnailKey` (Task 1).

Tidak ada test otomatis untuk task ini (murni UI wiring + object-URL lifecycle, konsisten dengan bagaimana `PlateTable.tsx` sudah tidak punya test file di codebase ini) — verifikasi lewat `tsc` + regresi suite penuh.

- [ ] **Step 1: Hook upload — `useUploadPlateThumbnail`**

Di `apps/dashboard/lib/hooks/use-kalkulator.ts`, tambahkan setelah fungsi `useDeleteKalkulasi` (cari blok ini persis):

```ts
export function useDeleteKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}
```

Tambahkan setelahnya:

```ts
export function useUploadPlateThumbnail() {
  return useMutation({
    mutationFn: ({ plateId, file }: { plateId: string; file: Blob }) => {
      const form = new FormData()
      form.append('file', file, 'plate.png')
      return apiFetch<{ thumbnailKey: string }>(`/api/kalkulator/plates/${plateId}/thumbnail`, { method: 'PUT', body: form })
    },
  })
}
```

- [ ] **Step 2: State + wiring di `KalkulasiForm.tsx`**

Cari import hook (persis seperti ini, di bagian atas file):

```tsx
import {
  useCreateKalkulasi, useUpdateKalkulasi, useKalkulatorRates,
  useSettingsV2, usePrinterProfiles, useMaterialProfiles, useFilamentHarga,
} from "@/lib/hooks/use-kalkulator"
```

Ubah jadi:

```tsx
import {
  useCreateKalkulasi, useUpdateKalkulasi, useKalkulatorRates,
  useSettingsV2, usePrinterProfiles, useMaterialProfiles, useFilamentHarga,
  useUploadPlateThumbnail,
} from "@/lib/hooks/use-kalkulator"
```

Tambahkan `useEffect` ke import react (cari baris ini persis):

```tsx
import { useState, useMemo, useRef } from "react"
```

Ubah jadi:

```tsx
import { useState, useMemo, useRef, useEffect } from "react"
```

Cari `type PlateRow` (persis seperti ini, dekat atas file):

```tsx
type PlateRow = PlateInputApp & { key: string }
```

Ubah jadi (tambah `id` dan `thumbnailKey`, keduanya opsional — plate baru/belum-disimpan tidak punya):

```tsx
type PlateRow = PlateInputApp & { key: string; id?: string; thumbnailKey?: string | null }
```

Cari inisialisasi state `plates` dari `initial` (persis seperti ini):

```tsx
  const [plates, setPlates] = useState<PlateRow[]>(
    initial?.plates.map(p => ({
      key: `p-${p.id}`,
      namaPart: p.namaPart ?? undefined,
      tipe: p.tipe as "FDM" | "SLA",
      printer: p.printer ?? undefined,
      gramasi: p.gramasi ?? 0,
      materials: p.materials,
      durasiJam: p.durasiJam,
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.hargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      materialProfileId: p.materialProfileId ?? undefined,
    })) ?? [DEFAULT_PLATE]
  )
```

Ubah jadi (tambah `id: p.id, thumbnailKey: p.thumbnailKey ?? undefined,`):

```tsx
  const [plates, setPlates] = useState<PlateRow[]>(
    initial?.plates.map(p => ({
      key: `p-${p.id}`,
      id: p.id,
      thumbnailKey: p.thumbnailKey ?? undefined,
      namaPart: p.namaPart ?? undefined,
      tipe: p.tipe as "FDM" | "SLA",
      printer: p.printer ?? undefined,
      gramasi: p.gramasi ?? 0,
      materials: p.materials,
      durasiJam: p.durasiJam,
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.hargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      materialProfileId: p.materialProfileId ?? undefined,
    })) ?? [DEFAULT_PLATE]
  )

  const [pendingThumbnails, setPendingThumbnails] = useState<Record<string, Blob>>({})
  const [pendingThumbnailUrls, setPendingThumbnailUrls] = useState<Record<string, string>>({})
  const uploadThumbnailMut = useUploadPlateThumbnail()

  // Bikin/revoke object URL tiap pendingThumbnails berubah (cuma habis import, atau setelah
  // save sukses mengosongkannya) — sengaja TIDAK depend ke `plates` biar ga bikin-ulang URL
  // tiap keystroke di form lain.
  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const [key, blob] of Object.entries(pendingThumbnails)) urls[key] = URL.createObjectURL(blob)
    setPendingThumbnailUrls(urls)
    return () => { Object.values(urls).forEach(u => URL.revokeObjectURL(u)) }
  }, [pendingThumbnails])

  // Gabungan: thumbnail pending (blob URL) + thumbnail yang sudah tersimpan (proxy endpoint).
  // Murni string map, aman di-recompute tiap render — tidak ada object URL yang dibuat di sini.
  const thumbnailUrls: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = { ...pendingThumbnailUrls }
    for (const p of plates) {
      if (!map[p.key] && p.thumbnailKey && p.id) map[p.key] = `/api/kalkulator/plates/${p.id}/thumbnail`
    }
    return map
  }, [pendingThumbnailUrls, plates])
```

- [ ] **Step 3: Simpan thumbnail pending saat import 3MF**

Cari fungsi `handleImport3mf` (persis seperti ini):

```tsx
  async function handleImport3mf(file: File) {
    setImport3mfError(null)
    setImport3mfWarnings([])
    setImport3mfPending(true)
    try {
      const draft = await import3mfFile(file, {
        filamentCatalog: filamentCatalog ?? [],
        printerProfiles: printerProfiles ?? [],
      })
      setNama(draft.nama)
      setBatch(draft.batch)
      setPlates(draft.plates.map((p, i) => ({ ...p, key: `p-3mf-${i}` })))
      setImport3mfWarnings(draft.warnings)
    } catch (e) {
      setImport3mfError(e instanceof Error ? e.message : "Gagal membaca file 3MF")
    } finally {
      setImport3mfPending(false)
    }
  }
```

Ubah jadi (tambah simpan `pendingThumbnails` sejajar dengan plate key yang baru dibuat):

```tsx
  async function handleImport3mf(file: File) {
    setImport3mfError(null)
    setImport3mfWarnings([])
    setImport3mfPending(true)
    try {
      const draft = await import3mfFile(file, {
        filamentCatalog: filamentCatalog ?? [],
        printerProfiles: printerProfiles ?? [],
      })
      setNama(draft.nama)
      setBatch(draft.batch)
      const newPlates = draft.plates.map((p, i) => ({ ...p, key: `p-3mf-${i}` }))
      setPlates(newPlates)
      const thumbs: Record<string, Blob> = {}
      draft.thumbnails.forEach((blob, i) => { if (blob) thumbs[newPlates[i].key] = blob })
      setPendingThumbnails(thumbs)
      setImport3mfWarnings(draft.warnings)
    } catch (e) {
      setImport3mfError(e instanceof Error ? e.message : "Gagal membaca file 3MF")
    } finally {
      setImport3mfPending(false)
    }
  }
```

- [ ] **Step 4: Expose baris plate yang ke-filter (buat korelasi index setelah save) + upload setelah save**

Cari baris ini (persis seperti ini):

```tsx
  const platesForSave = useMemo(() => plates.filter(hasPlateContent).map(toPlateInputApp), [plates])
  const platesForCalc = useMemo(() => platesForSave.filter(p => p.durasiJam > 0), [platesForSave])
```

Ubah jadi (pecah jadi 2 memo — `platesForSaveRows` dipakai buat korelasi `plate.key` ke plate hasil save, `platesForSave` sama seperti sebelumnya):

```tsx
  const platesForSaveRows = useMemo(() => plates.filter(hasPlateContent), [plates])
  const platesForSave = useMemo(() => platesForSaveRows.map(toPlateInputApp), [platesForSaveRows])
  const platesForCalc = useMemo(() => platesForSave.filter(p => p.durasiJam > 0), [platesForSave])
```

Cari fungsi `handleSave` (persis seperti ini):

```tsx
  async function handleSave() {
    if (!nama.trim() || (platesForSave.length === 0 && !inputV2.komponen?.some(k => k.harga > 0))) return
    const input: KalkulasiInput = { ...inputV2, plates: platesForSave, nama: nama.trim() }

    let saved: KalkulasiData
    if (isEditing && initial) {
      saved = await updateMut.mutateAsync({ id: initial.id, input })
    } else {
      saved = await createMut.mutateAsync(input)
    }
    onSaved?.(saved)
  }
```

Ubah jadi (upload thumbnail pending setelah save sukses, best-effort — kegagalan upload tidak melempar/menghentikan `onSaved`):

```tsx
  async function handleSave() {
    if (!nama.trim() || (platesForSave.length === 0 && !inputV2.komponen?.some(k => k.harga > 0))) return
    const input: KalkulasiInput = { ...inputV2, plates: platesForSave, nama: nama.trim() }

    let saved: KalkulasiData
    if (isEditing && initial) {
      saved = await updateMut.mutateAsync({ id: initial.id, input })
    } else {
      saved = await createMut.mutateAsync(input)
    }

    // Upload thumbnail pending — best-effort, tidak boleh menggagalkan save yang sudah sukses.
    await Promise.all(
      saved.plates.map(async (savedPlate, i) => {
        const key = platesForSaveRows[i]?.key
        const blob = key ? pendingThumbnails[key] : undefined
        if (!blob) return
        try {
          await uploadThumbnailMut.mutateAsync({ plateId: savedPlate.id, file: blob })
        } catch {
          // best-effort — thumbnail gagal ke-upload, kalkulasi tetap tersimpan normal
        }
      }),
    )

    onSaved?.(saved)
  }
```

- [ ] **Step 5: Teruskan `thumbnailUrls` ke `PlateTable`**

Cari baris ini (persis seperti ini):

```tsx
<PlateTable plates={plates} onChange={setPlates} batch={Math.max(1, batch)} />
```

Ubah jadi:

```tsx
<PlateTable plates={plates} onChange={setPlates} batch={Math.max(1, batch)} thumbnailUrls={thumbnailUrls} />
```

- [ ] **Step 6: Render thumbnail di `PlateTable.tsx`**

Cari `interface PlateTableProps` (persis seperti ini):

```tsx
interface PlateTableProps {
  plates: PlateRow[]
  onChange: (plates: PlateRow[]) => void
  /** Batch unit — kalau > 1, baris TOTAL menampilkan juga gram & durasi per pcs */
  batch?: number
}
```

Ubah jadi:

```tsx
interface PlateTableProps {
  plates: PlateRow[]
  onChange: (plates: PlateRow[]) => void
  /** Batch unit — kalau > 1, baris TOTAL menampilkan juga gram & durasi per pcs */
  batch?: number
  /** URL thumbnail per plate.key — blob URL (pending, belum ke-save) atau endpoint proxy
   *  (/api/kalkulator/plates/{id}/thumbnail, sudah ke-save). Key yang ga ada di map = ga
   *  ada thumbnail, elemen img tidak dirender. */
  thumbnailUrls?: Record<string, string>
}
```

Cari deklarasi fungsi komponen (persis seperti ini):

```tsx
export function PlateTable({ plates, onChange, batch }: PlateTableProps) {
```

Ubah jadi:

```tsx
export function PlateTable({ plates, onChange, batch, thumbnailUrls }: PlateTableProps) {
```

Cari header "Part N" (persis seperti ini):

```tsx
            {/* Row label for multi-plate */}
            {multiPlate && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold g-accent">
                  Part {idx + 1}
                </span>
```

Ubah jadi (tambah `<img>` sebelum span "Part N", cuma dirender kalau ada URL-nya):

```tsx
            {/* Row label for multi-plate */}
            {multiPlate && (
              <div className="flex items-center gap-2 mb-2">
                {thumbnailUrls?.[plate.key] && (
                  <img
                    src={thumbnailUrls[plate.key]}
                    alt=""
                    className="w-10 h-10 rounded-[6px] object-cover flex-shrink-0"
                    style={{ border: "1px solid var(--g-inner-border)" }}
                  />
                )}
                <span className="text-[10px] font-semibold g-accent">
                  Part {idx + 1}
                </span>
```

- [ ] **Step 7: Type-check**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "KalkulasiForm|PlateTable|use-kalkulator"
```
Expected: tidak ada output.

- [ ] **Step 8: Regresi seluruh suite dashboard**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx vitest run --passWithNoTests --exclude "**/.claude/**"
```
Expected: semua test PASS, jumlah = baseline sebelum task ini + test baru dari Task 1/2/4/5 (Task 6 tidak nambah test). Catatan: kalau ada worktree lain nyangkut di `.claude/worktrees/` di dalam `apps/dashboard`, flag `--exclude` di atas sudah nge-skip itu — bukan masalah dari perubahan task ini kalau muncul.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/lib/hooks/use-kalkulator.ts apps/dashboard/components/kalkulator/KalkulasiForm.tsx apps/dashboard/components/kalkulator/PlateTable.tsx
git commit -m "feat(kalkulator): tampilkan thumbnail plate — preview instan pas import, upload setelah save"
```

---

## Self-Review

**1. Spec coverage** (`docs/superpowers/specs/2026-07-23-kalkulator-plate-thumbnail-design.md`):
- Ekstrak `plate_N.png`, bukan file 3MF utuh diupload → Task 4 (`readPlateThumbnails`, cuma baca 1 file kecil per plate dari ZIP) ✅
- MinIO reuse infra existing, prefix `kalkulator-thumbnails/{plateId}.png` → Task 2 ✅
- Alur 2 fase (preview instan saat import, upload setelah save) → Task 5 (draft.thumbnails) + Task 6 (pendingThumbnails → upload di handleSave) ✅
- Upload best-effort, tidak blocking save → Task 6 Step 4 (`try/catch` per plate, tidak melempar ke `handleSave`) ✅
- Kolom `thumbnailKey` (bukan URL), nullable, additive → Task 1 ✅
- Endpoint PUT (upload) + GET (proxy display, presigned URL fresh tiap request) → Task 2 & 3 (satu file route.ts) ✅
- UI: thumbnail di header Part, tersembunyi total kalau tidak ada → Task 6 Step 6 (`thumbnailUrls?.[plate.key] &&`) ✅
- Cleanup saat hapus Kalkulasi (best-effort) → Task 1 Step 6 ✅
- Tidak ada cleanup per-part individual → tidak ada task yang mengimplementasikan ini (sesuai scope) ✅
- `thumbnailKey` tidak masuk kalkulasi HPP → tidak ada task yang menyentuh `formula.ts`/`resolve-v2.ts` untuk field ini ✅

**2. Placeholder scan:** tidak ada "TBD"/"implement later" — semua step punya kode lengkap.

**3. Type consistency:** `Kalkulasi3mfDraft.thumbnails: (Blob | null)[]` (Task 5) dipakai identik di Task 6 (`draft.thumbnails.forEach(...)`). `PlateData.thumbnailKey?: string | null` (Task 1) dipakai konsisten di Task 6 (`p.thumbnailKey ?? undefined` saat inisialisasi `PlateRow`). `useUploadPlateThumbnail()` (Task 6 Step 1) dipanggil dengan `{ plateId, file }` matching signature yang sama di Step 4. Endpoint `PUT/GET /api/kalkulator/plates/[plateId]/thumbnail` (Task 2&3) URL pattern dipakai identik di Task 6 (`\`/api/kalkulator/plates/${p.id}/thumbnail\``).

---

## Execution Handoff

Plan complete dan tersimpan di `docs/superpowers/plans/2026-07-23-kalkulator-plate-thumbnail.md`. Dua opsi eksekusi:

1. **Subagent-Driven (recommended)** — saya dispatch subagent fresh per task, review 2 tahap tiap task, iterasi cepat.
2. **Inline Execution** — saya eksekusi langsung di sesi ini, checkpoint tiap beberapa task.

Mau pakai yang mana?
