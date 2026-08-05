# QRIS Dinamis per Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff embed a specific transaction amount into the uploaded QRIS so a scanning customer sees the amount pre-filled, editable per-invoice (defaults to `sisaBayar`, e.g. for DP scenarios), with graceful fallback to the existing static QRIS.

**Architecture:** Decode the uploaded static QRIS image into its raw EMVCo payload string ONCE at upload time (server-side, `apps/dashboard/app/api/settings/invoice-qris/route.ts`), store it alongside the image. On the invoice detail page, an amount input drives a pure client-side function that mutates the EMVCo payload (inject transaction amount, recompute CRC) and re-renders a new QR image in the browser — no server round-trip per amount change.

**Tech Stack:** Next.js 16 App Router, `jsqr` + `jimp` (new, server-side QR decode), `qrcode` (already installed, client + server QR generation), Prisma `Config` key-value store (no schema change), Vitest.

## Global Constraints

- Amount embedded defaults to `sisaBayar`, editable by staff — no validation against `sisaBayar` (staff trusted for DP scenarios).
- Empty/invalid amount → fall back to the existing static QRIS image, exactly as today.
- The manually-entered amount is **never persisted** — component-local state only, reset on reload.
- Decode happens **once**, at QRIS image upload time — never per-invoice-view.
- Decode failure must NOT block the image upload — image still saves for static display; only the dynamic-amount feature becomes unavailable for that image.
- No Prisma schema changes — reuse the existing `Config { key, value }` key-value model with a second key.
- Every route handler keeps the exact existing auth-gate pattern: `const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`.

---

## File Structure

```
apps/dashboard/lib/invoice/qris.ts                 [CREATE] buildDynamicQris + crc16ccitt (pure, client+server safe)
apps/dashboard/lib/invoice/qris.test.ts             [CREATE]
apps/dashboard/lib/invoice/qris-decode.ts           [CREATE] decodeQrisImage (server-only, jimp+jsqr)
apps/dashboard/app/api/settings/invoice-qris/route.ts [MODIFY] decode on PUT, store qrisPayload, return decodeWarning
apps/dashboard/app/api/settings/invoice-qris/route.test.ts [CREATE]
apps/dashboard/lib/hooks/use-invoice.ts             [MODIFY] useInvoiceQris/useUpdateInvoiceQris return shape
apps/dashboard/components/settings/InvoiceMethodsCard.tsx [MODIFY] show decodeWarning
apps/dashboard/components/invoice/InvoiceDetail.tsx [MODIFY] amount input + client-side dynamic QR render
apps/dashboard/components/invoice/InvoiceDetail.test.tsx [CREATE]
apps/dashboard/package.json                         [MODIFY] add jsqr, jimp
```

---

### Task 1: `buildDynamicQris` — pure EMVCo payload mutation

**Files:**
- Create: `apps/dashboard/lib/invoice/qris.ts`
- Create: `apps/dashboard/lib/invoice/qris.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (first task).
- Produces:
  - `export function crc16ccitt(str: string): string` — 4-char uppercase hex CRC16/CCITT-FALSE. Consumed internally by `buildDynamicQris`, and by Task 2's tests for cross-checking.
  - `export function buildDynamicQris(staticPayload: string, amountRupiah: number): string` — throws `Error` on invalid `amountRupiah` (not finite, ≤ 0). Consumed by Task 5 (client-side, `InvoiceDetail.tsx`).

EMVCo QR payload format: a flat sequence of TLV (tag-length-value) fields — each field is a 2-digit numeric tag, a 2-digit decimal length, then that many characters of value. Fields must appear in ascending numeric tag order. Tag `01` is the Point of Initiation Method (`"11"` = static, `"12"` = dynamic). Tag `54` is Transaction Amount (absent on static QRIS). Tag `63` is the CRC, always last, with a fixed length of `"04"` — the CRC is computed over the ENTIRE payload including the literal `"6304"` prefix of the CRC field itself, but excluding the CRC's own 4 hex digits.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/dashboard/lib/invoice/qris.test.ts
import { describe, it, expect } from 'vitest'
import { crc16ccitt, buildDynamicQris } from './qris'

describe('crc16ccitt', () => {
  it('matches the standard CRC-16/CCITT-FALSE conformance test vector', () => {
    // Well-known reference test vector for this CRC variant:
    // CRC-16/CCITT-FALSE("123456789") = 0x29B1
    expect(crc16ccitt('123456789')).toBe('29B1')
  })
})

describe('buildDynamicQris', () => {
  // Hand-built minimal static QRIS payload (not a real merchant, structurally valid EMVCo TLV):
  // 00 02 "01"              Payload Format Indicator
  // 01 02 "11"              Point of Initiation Method (static)
  // 52 04 "5411"            Merchant Category Code
  // 53 03 "360"             Transaction Currency (IDR)
  // 58 02 "ID"               Country Code
  // 59 12 "TESTMERCHANT"    Merchant Name (12 chars)
  // 60 07 "JAKARTA"          Merchant City
  // 63 04 "ABCD"             CRC placeholder (garbage — buildDynamicQris must discard and recompute, not trust it)
  const staticPayload =
    '000201' +
    '010211' +
    '52045411' +
    '5303360' +
    '5802ID' +
    '5912TESTMERCHANT' +
    '6007JAKARTA' +
    '6304ABCD'

  it('throws on a non-positive amount', () => {
    expect(() => buildDynamicQris(staticPayload, 0)).toThrow()
    expect(() => buildDynamicQris(staticPayload, -100)).toThrow()
    expect(() => buildDynamicQris(staticPayload, NaN)).toThrow()
  })

  it('switches the Point of Initiation Method from static (11) to dynamic (12)', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    expect(result).toContain('010212')
    expect(result).not.toContain('010211')
  })

  it('inserts the transaction amount as tag 54 with the correct TLV length prefix', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    // "50000" is 5 chars -> length prefix "05"
    expect(result).toContain('540550000')
  })

  it('formats a non-integer amount to 2 decimal places', () => {
    const result = buildDynamicQris(staticPayload, 15000.5)
    // "15000.50" is 8 chars -> length prefix "08"
    expect(result).toContain('540815000.50')
  })

  it('keeps fields in ascending tag order (00, 01, 52, 53, 54, 58, 59, 60, 63)', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    const tagOrder = ['00', '01', '52', '53', '54', '58', '59', '60', '63']
    let searchFrom = 0
    for (const tag of tagOrder) {
      const idx = result.indexOf(tag, searchFrom)
      expect(idx).toBeGreaterThanOrEqual(searchFrom)
      searchFrom = idx + 2
    }
  })

  it('recomputes the CRC over the new payload rather than reusing the stale one', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    expect(result.slice(-8, -4)).toBe('6304')
    const withoutCrc = result.slice(0, -4)
    expect(result.slice(-4)).toBe(crc16ccitt(withoutCrc))
    expect(result.slice(-4)).not.toBe('ABCD') // the garbage CRC from the input must not survive
  })

  it('drops a pre-existing tag 54 before inserting the new one (idempotent re-conversion)', () => {
    const alreadyDynamic = buildDynamicQris(staticPayload, 50000)
    const reconverted = buildDynamicQris(alreadyDynamic, 75000)
    expect(reconverted).toContain('540575000')
    expect(reconverted).not.toContain('540550000')
    // exactly one tag 54 field
    expect(reconverted.split('54').length - 1).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && pnpm vitest run lib/invoice/qris.test.ts`
Expected: FAIL — `apps/dashboard/lib/invoice/qris.ts` does not exist yet.

- [ ] **Step 3: Implement `qris.ts`**

```ts
// apps/dashboard/lib/invoice/qris.ts

interface TlvField {
  tag: string
  value: string
}

function parseTlv(payload: string): TlvField[] {
  const fields: TlvField[] = []
  let i = 0
  while (i < payload.length) {
    const tag = payload.substring(i, i + 2)
    const len = parseInt(payload.substring(i + 2, i + 4), 10)
    const value = payload.substring(i + 4, i + 4 + len)
    fields.push({ tag, value })
    i += 4 + len
  }
  return fields
}

function serializeTlv(fields: TlvField[]): string {
  return fields.map((f) => `${f.tag}${String(f.value.length).padStart(2, '0')}${f.value}`).join('')
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection — the variant EMVCo/QRIS requires. */
export function crc16ccitt(str: string): string {
  let crc = 0xffff
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Convert a static QRIS EMVCo payload into a dynamic one carrying a specific
 * transaction amount: flips the Point of Initiation Method (tag 01) from
 * static ("11") to dynamic ("12"), injects/replaces the Transaction Amount
 * (tag 54), and recomputes the trailing CRC (tag 63) — the input payload's
 * own CRC is always discarded, never trusted.
 */
export function buildDynamicQris(staticPayload: string, amountRupiah: number): string {
  if (!Number.isFinite(amountRupiah) || amountRupiah <= 0) {
    throw new Error('Jumlah QRIS tidak valid')
  }

  const fields = parseTlv(staticPayload).filter((f) => f.tag !== '63' && f.tag !== '54')

  const poi = fields.find((f) => f.tag === '01')
  if (poi) poi.value = '12'

  const amountValue = Number.isInteger(amountRupiah) ? String(amountRupiah) : amountRupiah.toFixed(2)
  fields.push({ tag: '54', value: amountValue })

  fields.sort((a, b) => Number(a.tag) - Number(b.tag))

  const withoutCrc = serializeTlv(fields) + '6304'
  return withoutCrc + crc16ccitt(withoutCrc)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && pnpm vitest run lib/invoice/qris.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/dashboard
git add lib/invoice/qris.ts lib/invoice/qris.test.ts
git commit -m "feat(invoice): add buildDynamicQris EMVCo payload mutation"
```

---

### Task 2: Server-side QRIS decode + route changes

**Files:**
- Create: `apps/dashboard/lib/invoice/qris-decode.ts`
- Modify: `apps/dashboard/app/api/settings/invoice-qris/route.ts`
- Create: `apps/dashboard/app/api/settings/invoice-qris/route.test.ts`
- Modify: `apps/dashboard/package.json` (add `jsqr`, `jimp`)

**Interfaces:**
- Consumes: nothing from Task 1 directly (decode is independent of the mutation logic).
- Produces:
  - `decodeQrisImage(dataUrl: string): Promise<string | null>` — exported from `qris-decode.ts`, returns the decoded EMVCo string or `null` if no QR code was found. Consumed by the route in this task.
  - `PAYLOAD_CONFIG_KEY = 'invoice.qrisPayload'` — the second `Config` row key, exported from `route.ts` only if needed elsewhere (not required by later tasks — later tasks only see it via the API response shape below).
  - `GET /api/settings/invoice-qris` response: `{ qris: string; qrisPayload: string | null }` (was `{ qris: string }`). Consumed by Task 3.
  - `PUT /api/settings/invoice-qris` response: `{ qris: string; qrisPayload: string | null; decodeWarning?: string }` (was `{ qris: string }`). Consumed by Task 3 and Task 4.

- [ ] **Step 1: Add the new dependencies**

```bash
cd apps/dashboard
pnpm add jsqr jimp@^1.6.0
```

- [ ] **Step 2: Write the failing test for `decodeQrisImage`**

`jsqr` needs raw RGBA pixel data, not an encoded image — `jimp` decodes PNG/JPEG into that pixel buffer. Since this function's correctness depends on `jimp`+`jsqr` actually reading a real QR image (not something worth hand-constructing pixel-by-pixel in a unit test), test it by generating a real QR code with the ALREADY-INSTALLED `qrcode` package, then decoding it back — a round-trip test.

```ts
// apps/dashboard/lib/invoice/__tests__/qris-decode.test.ts
import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import { decodeQrisImage } from '../qris-decode'

describe('decodeQrisImage', () => {
  it('decodes a real QR code image back to its original payload text', async () => {
    const payload = '000201010211520454115303360' + '5802ID5912TESTMERCHANT6007JAKARTA6304ABCD'
    const dataUrl = await QRCode.toDataURL(payload, { type: 'image/png' })

    const result = await decodeQrisImage(dataUrl)

    expect(result).toBe(payload)
  })

  it('returns null for an image that has no QR code in it', async () => {
    // 1x1 transparent PNG data URL — a valid image, no QR code
    const blankPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

    const result = await decodeQrisImage(blankPng)

    expect(result).toBeNull()
  })
})
```

Note the test file lives in `apps/dashboard/lib/invoice/__tests__/` (sibling `__tests__/` dir) even though `qris.ts`/`qris.test.ts` in Task 1 used an inline sibling file — both conventions are equally unestablished in this app (no prior test files exist at all here); use `__tests__/` for this one specifically because Task 5 will also add an `__tests__/`-style file for a component test, and grouping the two async/IO-heavy tests together under `__tests__/` versus the pure-function `qris.test.ts` sitting directly next to its source keeps the distinction between "pure logic" and "IO-heavy" tests visible in the file tree.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run lib/invoice/__tests__/qris-decode.test.ts`
Expected: FAIL — `apps/dashboard/lib/invoice/qris-decode.ts` does not exist yet.

- [ ] **Step 4: Implement `qris-decode.ts`**

```ts
// apps/dashboard/lib/invoice/qris-decode.ts
import jsQR from 'jsqr'
import { Jimp } from 'jimp'

/**
 * Decode a QR code from an uploaded image (as a data URL) into its raw text
 * payload. Returns null if the image doesn't contain a readable QR code —
 * callers must treat that as "decode failed, fall back to static display",
 * never as a hard error.
 */
export async function decodeQrisImage(dataUrl: string): Promise<string | null> {
  const base64 = dataUrl.split(',')[1]
  if (!base64) return null

  const buffer = Buffer.from(base64, 'base64')
  const image = await Jimp.read(buffer)
  const { data, width, height } = image.bitmap

  const result = jsQR(new Uint8ClampedArray(data), width, height)
  return result ? result.data : null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run lib/invoice/__tests__/qris-decode.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Read the current route file, then write the failing test for the updated route**

Read `apps/dashboard/app/api/settings/invoice-qris/route.ts` first (reproduced here for reference — this is its exact current content before your changes):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const CONFIG_KEY = 'invoice.qrisImage'
const MAX_BYTES = 2_000_000

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  const qris: string = row ? row.value : ''
  return NextResponse.json({ qris })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qris } = await req.json() as { qris: string }
  if (typeof qris !== 'string') return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  if (qris && !qris.startsWith('data:image/')) {
    return NextResponse.json({ error: 'QRIS must be an image data URL' }, { status: 400 })
  }
  if (qris.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Gambar terlalu besar (maks ~1.5MB)' }, { status: 400 })
  }

  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: qris },
    create: { key: CONFIG_KEY, value: qris },
  })
  return NextResponse.json({ qris })
}
```

Write the test:

```ts
// apps/dashboard/app/api/settings/invoice-qris/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: { config: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('@/lib/invoice/qris-decode', () => ({ decodeQrisImage: vi.fn() }))

import { GET, PUT } from './route'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decodeQrisImage } from '@/lib/invoice/qris-decode'

const mockAuth = auth as any
const mockPrisma = prisma as any
const mockDecode = decodeQrisImage as any

function makePutRequest(body: unknown) {
  return { json: async () => body } as any
}

describe('GET /api/settings/invoice-qris', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns both the image and the decoded payload', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPrisma.config.findUnique
      .mockResolvedValueOnce({ value: 'data:image/png;base64,AAA' }) // qrisImage row
      .mockResolvedValueOnce({ value: '00020101...' }) // qrisPayload row
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual({ qris: 'data:image/png;base64,AAA', qrisPayload: '00020101...' })
  })

  it('returns qrisPayload: null when no payload row exists yet', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPrisma.config.findUnique
      .mockResolvedValueOnce({ value: 'data:image/png;base64,AAA' })
      .mockResolvedValueOnce(null)
    const res = await GET()
    const json = await res.json()
    expect(json.qrisPayload).toBeNull()
  })
})

describe('PUT /api/settings/invoice-qris', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))
    expect(res.status).toBe(401)
  })

  it('decodes successfully and stores both the image and the payload', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockDecode.mockResolvedValue('00020101021...')

    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))

    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'invoice.qrisImage' }, update: { value: 'data:image/png;base64,AAA' } }),
    )
    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'invoice.qrisPayload' }, update: { value: '00020101021...' } }),
    )
    const json = await res.json()
    expect(json).toEqual({ qris: 'data:image/png;base64,AAA', qrisPayload: '00020101021...', decodeWarning: undefined })
  })

  it('saves the image and returns a decodeWarning when decode fails, without blocking the upload', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockDecode.mockResolvedValue(null)

    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))

    expect(res.status).toBe(200)
    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'invoice.qrisImage' } }),
    )
    const json = await res.json()
    expect(json.qris).toBe('data:image/png;base64,AAA')
    expect(json.qrisPayload).toBeNull()
    expect(json.decodeWarning).toMatch(/tidak terbaca/i)
  })

  it('saves the image and returns a decodeWarning when decode throws', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockDecode.mockRejectedValue(new Error('corrupt image'))

    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.qrisPayload).toBeNull()
    expect(json.decodeWarning).toMatch(/tidak terbaca/i)
  })

  it('skips decode entirely when qris is empty (image removed)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })

    const res = await PUT(makePutRequest({ qris: '' }))

    expect(mockDecode).not.toHaveBeenCalled()
    const json = await res.json()
    expect(json).toEqual({ qris: '', qrisPayload: null, decodeWarning: undefined })
  })

  it('still rejects a non-image data URL with 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const res = await PUT(makePutRequest({ qris: 'not-a-data-url' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run app/api/settings/invoice-qris/route.test.ts`
Expected: FAIL — route doesn't yet return `qrisPayload`/`decodeWarning`, doesn't call `decodeQrisImage`.

- [ ] **Step 8: Implement the updated route**

```ts
// apps/dashboard/app/api/settings/invoice-qris/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decodeQrisImage } from '@/lib/invoice/qris-decode'

const CONFIG_KEY = 'invoice.qrisImage'
const PAYLOAD_CONFIG_KEY = 'invoice.qrisPayload'
const MAX_BYTES = 2_000_000
const DECODE_WARNING = 'QR tidak terbaca otomatis — fitur jumlah dinamis tidak tersedia untuk gambar ini'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [imageRow, payloadRow] = await Promise.all([
    prisma.config.findUnique({ where: { key: CONFIG_KEY } }),
    prisma.config.findUnique({ where: { key: PAYLOAD_CONFIG_KEY } }),
  ])
  const qris: string = imageRow ? imageRow.value : ''
  const qrisPayload: string | null = payloadRow && payloadRow.value ? payloadRow.value : null
  return NextResponse.json({ qris, qrisPayload })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qris } = await req.json() as { qris: string }
  if (typeof qris !== 'string') return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  if (qris && !qris.startsWith('data:image/')) {
    return NextResponse.json({ error: 'QRIS must be an image data URL' }, { status: 400 })
  }
  if (qris.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Gambar terlalu besar (maks ~1.5MB)' }, { status: 400 })
  }

  let qrisPayload: string | null = null
  let decodeWarning: string | undefined

  if (qris) {
    try {
      qrisPayload = await decodeQrisImage(qris)
      if (!qrisPayload) decodeWarning = DECODE_WARNING
    } catch {
      decodeWarning = DECODE_WARNING
    }
  }

  await Promise.all([
    prisma.config.upsert({
      where: { key: CONFIG_KEY },
      update: { value: qris },
      create: { key: CONFIG_KEY, value: qris },
    }),
    prisma.config.upsert({
      where: { key: PAYLOAD_CONFIG_KEY },
      update: { value: qrisPayload ?? '' },
      create: { key: PAYLOAD_CONFIG_KEY, value: qrisPayload ?? '' },
    }),
  ])

  return NextResponse.json({ qris, qrisPayload, decodeWarning })
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run app/api/settings/invoice-qris/route.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 10: Run the full dashboard suite once to confirm nothing else broke**

Run: `cd apps/dashboard && pnpm test`
Expected: all tests pass (existing suite + this task's new tests)

- [ ] **Step 11: Commit**

```bash
cd apps/dashboard
git add package.json ../../pnpm-lock.yaml lib/invoice/qris-decode.ts lib/invoice/__tests__/qris-decode.test.ts app/api/settings/invoice-qris/route.ts app/api/settings/invoice-qris/route.test.ts
git commit -m "feat(invoice): decode uploaded QRIS to EMVCo payload on upload"
```

---

### Task 3: `use-invoice.ts` hook updates

**Files:**
- Modify: `apps/dashboard/lib/hooks/use-invoice.ts`

**Interfaces:**
- Consumes: the new GET/PUT response shapes from Task 2 (`{ qris: string; qrisPayload: string | null; decodeWarning?: string }`).
- Produces:
  - `useInvoiceQris(): UseQueryResult<{ qris: string; qrisPayload: string | null }>` — return type changes from `UseQueryResult<string>` to this object shape. Consumed by Task 4 and Task 5.
  - `useUpdateInvoiceQris(): UseMutationResult<{ qris: string; qrisPayload: string | null; decodeWarning?: string }, Error, string>` — mutation's resolved value now carries `decodeWarning`. Consumed by Task 4.

Read `apps/dashboard/lib/hooks/use-invoice.ts` first — this is its exact current content for the two functions you're changing (surrounding hooks in the same file are untouched, don't reproduce or modify them):

```ts
const QRIS_KEY = ['invoice', 'qris'] as const

export function useInvoiceQris() {
  return useQuery({
    queryKey: QRIS_KEY,
    queryFn: () => apiFetch<{ qris: string }>('/api/settings/invoice-qris').then(r => r.qris),
    staleTime: 60_000,
  })
}

export function useUpdateInvoiceQris() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (qris: string) =>
      apiFetch<{ qris: string }>('/api/settings/invoice-qris', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qris }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QRIS_KEY }),
  })
}
```

- [ ] **Step 1: Update the two hooks**

```ts
const QRIS_KEY = ['invoice', 'qris'] as const

interface QrisResponse {
  qris: string
  qrisPayload: string | null
}

interface QrisPutResponse extends QrisResponse {
  decodeWarning?: string
}

export function useInvoiceQris() {
  return useQuery({
    queryKey: QRIS_KEY,
    queryFn: () => apiFetch<QrisResponse>('/api/settings/invoice-qris'),
    staleTime: 60_000,
  })
}

export function useUpdateInvoiceQris() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (qris: string) =>
      apiFetch<QrisPutResponse>('/api/settings/invoice-qris', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qris }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QRIS_KEY }),
  })
}
```

Note: `useInvoiceQris()` no longer unwraps `.then(r => r.qris)` — every caller of this hook must be updated to read `data?.qris`/`data?.qrisPayload` instead of `data` directly. This plan's Task 4 and Task 5 are the only two consumers (confirmed during research) — both are updated in this plan.

- [ ] **Step 2: Run the full dashboard suite** (no new tests in this task — it's a pure type/shape change verified by Tasks 4 and 5's tests, which depend on it)

Run: `cd apps/dashboard && pnpm test`
Expected: same pass count as before this task (nothing should newly fail — no consumer is updated yet, so if `InvoiceMethodsCard.tsx`/`InvoiceDetail.tsx` broke at compile time, that surfaces here as a TypeScript error, not a test failure; if so, that confirms Task 4/5 haven't landed yet and is expected — check with `pnpm exec tsc --noEmit` too)

Run: `cd apps/dashboard && pnpm exec tsc --noEmit 2>&1 | grep -E "InvoiceMethodsCard|InvoiceDetail"`
Expected: two errors, one per file, both about `qris` no longer being a `string` — this is expected and gets fixed in Tasks 4 and 5.

- [ ] **Step 3: Commit**

```bash
cd apps/dashboard
git add lib/hooks/use-invoice.ts
git commit -m "feat(invoice): widen useInvoiceQris/useUpdateInvoiceQris to carry qrisPayload"
```

---

### Task 4: `InvoiceMethodsCard.tsx` — surface decode warning

**Files:**
- Modify: `apps/dashboard/components/settings/InvoiceMethodsCard.tsx`

**Interfaces:**
- Consumes: `useInvoiceQris()` (Task 3, now returns `{ qris, qrisPayload } | undefined`), `useUpdateInvoiceQris()` (Task 3, mutation resolves to `{ qris, qrisPayload, decodeWarning? }`).
- Produces: nothing consumed by later tasks (this task only affects the settings UI).

Read `apps/dashboard/components/settings/InvoiceMethodsCard.tsx` first. This is its current QRIS-related section (the rest of the file — other payment method fields — is untouched, don't reproduce or modify it):

```tsx
const { data: qris } = useInvoiceQris()
const updateQrisMut = useUpdateInvoiceQris()
const [qrisErr, setQrisErr] = useState<string | null>(null)
const [qrisSaved, setQrisSaved] = useState(false)

async function handleQrisFile(file: File) {
  setQrisErr(null)
  if (!file.type.startsWith("image/")) {
    setQrisErr("File harus berupa gambar")
    return
  }
  if (file.size > 1_500_000) {
    setQrisErr("Ukuran gambar maksimal 1.5MB")
    return
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  try {
    await updateQrisMut.mutateAsync(dataUrl)
    setQrisSaved(true)
    setTimeout(() => setQrisSaved(false), 1500)
  } catch (err) {
    setQrisErr(err instanceof Error ? err.message : "Gagal upload QRIS")
  }
}

// ... JSX further down:
{qris && (
  <img src={qris} alt="QRIS" className="w-24 h-24 rounded-[5px] object-contain" style={{ background: "#fff", padding: 4 }} />
)}
{qrisErr && <div className="text-xs mt-2" style={{ color: "#f87171" }}>{qrisErr}</div>}
{qrisSaved && <div className="text-xs mt-2" style={{ color: "#34d399" }}>✓ Tersimpan</div>}
```

- [ ] **Step 1: Update the state, handler, and JSX**

```tsx
const { data: qrisData } = useInvoiceQris()
const qris = qrisData?.qris
const updateQrisMut = useUpdateInvoiceQris()
const [qrisErr, setQrisErr] = useState<string | null>(null)
const [qrisWarn, setQrisWarn] = useState<string | null>(null)
const [qrisSaved, setQrisSaved] = useState(false)

async function handleQrisFile(file: File) {
  setQrisErr(null)
  setQrisWarn(null)
  if (!file.type.startsWith("image/")) {
    setQrisErr("File harus berupa gambar")
    return
  }
  if (file.size > 1_500_000) {
    setQrisErr("Ukuran gambar maksimal 1.5MB")
    return
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  try {
    const result = await updateQrisMut.mutateAsync(dataUrl)
    setQrisSaved(true)
    setTimeout(() => setQrisSaved(false), 1500)
    if (result.decodeWarning) setQrisWarn(result.decodeWarning)
  } catch (err) {
    setQrisErr(err instanceof Error ? err.message : "Gagal upload QRIS")
  }
}

// ... JSX further down:
{qris && (
  <img src={qris} alt="QRIS" className="w-24 h-24 rounded-[5px] object-contain" style={{ background: "#fff", padding: 4 }} />
)}
{qrisErr && <div className="text-xs mt-2" style={{ color: "#f87171" }}>{qrisErr}</div>}
{qrisWarn && <div className="text-xs mt-2" style={{ color: "#fbbf24" }}>⚠️ {qrisWarn}</div>}
{qrisSaved && <div className="text-xs mt-2" style={{ color: "#34d399" }}>✓ Tersimpan</div>}
```

- [ ] **Step 2: Manual verification**

Run the dashboard dev server (`pnpm --filter shopee-dashboard dev`), go to Settings → invoice methods, upload a real QRIS image (a genuine one, from any e-wallet/bank QRIS generator) — confirm it saves with no warning. Then upload a random non-QRIS image (any photo) — confirm it still saves (doesn't block), but shows the amber warning text.

- [ ] **Step 3: Run the full dashboard suite + typecheck**

Run: `cd apps/dashboard && pnpm test && pnpm exec tsc --noEmit 2>&1 | grep InvoiceMethodsCard`
Expected: `pnpm test` all pass; the `tsc` grep for `InvoiceMethodsCard` should now find nothing (the Task 3 error is fixed).

- [ ] **Step 4: Commit**

```bash
cd apps/dashboard
git add components/settings/InvoiceMethodsCard.tsx
git commit -m "feat(invoice): show non-blocking decode warning on QRIS upload"
```

---

### Task 5: `InvoiceDetail.tsx` — amount input + client-side dynamic QR

**Files:**
- Modify: `apps/dashboard/components/invoice/InvoiceDetail.tsx`
- Create: `apps/dashboard/components/invoice/__tests__/InvoiceDetail.test.tsx`

**Interfaces:**
- Consumes: `buildDynamicQris` (Task 1), `useInvoiceQris()` returning `{ qris, qrisPayload } | undefined` (Task 3), the `qrcode` package (already installed) for client-side `QRCode.toDataURL(payload: string): Promise<string>`.
- Produces: nothing consumed by later tasks (last task).

Read `apps/dashboard/components/invoice/InvoiceDetail.tsx` first. This is its current QRIS-related section (lines ~55-63 for data fetching, ~663-683 for the render block — the rest of this 697-line file, including the `invoice` local binding used elsewhere in the print view, is untouched):

```tsx
const { data: inv, isLoading } = useInvoice(invoiceId)
const { data: paymentMethods } = usePaymentMethods()
const { data: bankAccount } = useInvoiceBankAccount()
const { data: qris } = useInvoiceQris()

// ... (invoice.sisaBayar is already in scope in the render section below, via `invoice` — the
// local const bound to `inv`/`QuotationData` used throughout the print view)

{((bankAccount && bankAccount.trim()) || qris) && (
  <div style={{ marginTop: 16, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
    {bankAccount && bankAccount.trim() && (
      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 4 }}>
          Pembayaran via Transfer
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "pre-line" }}>
          {bankAccount}
        </div>
      </div>
    )}
    {qris && (
      <div style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qris} alt="QRIS" style={{ width: 110, height: 110, objectFit: "contain" }} />
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginTop: 2 }}>Scan QRIS</div>
      </div>
    )}
  </div>
)}
```

Note this whole block sits inside the `printRef`-scoped area used for JPEG export (`html2canvas`) — a dynamically-generated QR `<img>` swapped in here is automatically included in the exported JPEG too, which is correct per the spec.

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/dashboard/components/invoice/__tests__/InvoiceDetail.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const mockInvoice = {
  id: "inv1",
  nomor: "INV-001",
  buyerNama: "Buyer Test",
  buyerContact: null,
  catatan: null,
  status: "SENT",
  tanggal: "2026-08-01",
  dueDate: null,
  ongkir: 0,
  diskonGlobal: 0,
  diskonGlobalPct: null,
  shopeeOrderSn: null,
  items: [],
  payments: [],
  subtotalProduk: 50000,
  total: 50000,
  totalPaid: 0,
  sisaBayar: 50000,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
}

vi.mock("@/lib/hooks/use-invoice", () => ({
  useInvoice: () => ({ data: mockInvoice, isLoading: false }),
  usePaymentMethods: () => ({ data: [] }),
  useInvoiceBankAccount: () => ({ data: null }),
  useInvoiceQris: vi.fn(),
}))

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async (_payload: string) => "data:image/png;base64,DYNAMIC") },
}))

vi.mock("@/lib/invoice/qris", () => ({
  buildDynamicQris: vi.fn((_payload: string, amount: number) => `dynamic-payload-for-${amount}`),
}))

import { InvoiceDetail } from "../InvoiceDetail"
import { useInvoiceQris } from "@/lib/hooks/use-invoice"
import QRCode from "qrcode"
import { buildDynamicQris } from "@/lib/invoice/qris"

const mockUseInvoiceQris = vi.mocked(useInvoiceQris)
const mockToDataURL = QRCode.toDataURL as any
const mockBuildDynamicQris = buildDynamicQris as any

const QRIS_WITH_PAYLOAD = {
  data: { qris: "data:image/png;base64,STATIC", qrisPayload: "000201010211...6304ABCD" },
} as any

describe("InvoiceDetail QRIS amount input", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInvoiceQris.mockReturnValue(QRIS_WITH_PAYLOAD)
  })

  it("defaults the amount input to sisaBayar", () => {
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i) as HTMLInputElement
    expect(input.value).toBe("50000")
  })

  it("shows the static QRIS image when the amount is cleared", async () => {
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i)
    fireEvent.change(input, { target: { value: "" } })
    await waitFor(() => {
      const img = screen.getByAltText("QRIS") as HTMLImageElement
      expect(img.src).toContain("STATIC")
    })
  })

  it("generates and shows a dynamic QR image when an amount is entered", async () => {
    mockToDataURL.mockResolvedValue("data:image/png;base64,DYNAMIC")
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i)
    fireEvent.change(input, { target: { value: "75000" } })

    await waitFor(() => {
      expect(mockBuildDynamicQris).toHaveBeenCalledWith("000201010211...6304ABCD", 75000)
    })
    await waitFor(() => {
      const img = screen.getByAltText("QRIS") as HTMLImageElement
      expect(img.src).toContain("DYNAMIC")
    })
  })

  it("disables the amount input when qrisPayload is unavailable", () => {
    mockUseInvoiceQris.mockReturnValue({
      data: { qris: "data:image/png;base64,STATIC", qrisPayload: null },
    } as any)
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i) as HTMLInputElement
    expect(input).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run components/invoice/__tests__/InvoiceDetail.test.tsx`
Expected: FAIL — no amount input exists yet, `buildDynamicQris` isn't imported/called.

- [ ] **Step 3: Implement the amount input + dynamic QR state**

Add near the top of the component, after the existing data-fetching hooks:

```tsx
import QRCode from "qrcode"
import { buildDynamicQris } from "@/lib/invoice/qris"

// ... inside the component, after `const { data: qris } = useInvoiceQris()` — actually qris
// now needs updating too since Task 3 changed the hook's return shape:
const { data: qrisData } = useInvoiceQris()
const qris = qrisData?.qris
const qrisPayload = qrisData?.qrisPayload ?? null

const [qrisAmountInput, setQrisAmountInput] = useState<string>("")
const [dynamicQrImage, setDynamicQrImage] = useState<string | null>(null)

useEffect(() => {
  if (invoice) setQrisAmountInput(String(invoice.sisaBayar))
}, [invoice?.id, invoice?.sisaBayar])

useEffect(() => {
  const amount = Number(qrisAmountInput)
  if (!qrisAmountInput || !Number.isFinite(amount) || amount <= 0 || !qrisPayload) {
    setDynamicQrImage(null)
    return
  }
  let cancelled = false
  const timer = setTimeout(async () => {
    try {
      const payload = buildDynamicQris(qrisPayload, amount)
      const dataUrl = await QRCode.toDataURL(payload)
      if (!cancelled) setDynamicQrImage(dataUrl)
    } catch {
      if (!cancelled) setDynamicQrImage(null)
    }
  }, 200)
  return () => { cancelled = true; clearTimeout(timer) }
}, [qrisAmountInput, qrisPayload])

const displayedQris = dynamicQrImage ?? qris
```

`useEffect`/`useState` must already be imported from `"react"` in this file (it's a `"use client"` component using other hooks) — add `useEffect` to the existing React import if it isn't already there.

- [ ] **Step 4: Update the render block**

```tsx
{((bankAccount && bankAccount.trim()) || qris) && (
  <div style={{ marginTop: 16, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
    {bankAccount && bankAccount.trim() && (
      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 4 }}>
          Pembayaran via Transfer
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "pre-line" }}>
          {bankAccount}
        </div>
      </div>
    )}
    {qris && (
      <div style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={displayedQris} alt="QRIS" style={{ width: 110, height: 110, objectFit: "contain" }} />
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginTop: 2 }}>Scan QRIS</div>
        <div style={{ marginTop: 4 }}>
          <label style={{ fontSize: 8, color: "#888", display: "block" }} htmlFor="qris-amount-input">
            Jumlah QRIS
          </label>
          <input
            id="qris-amount-input"
            aria-label="Jumlah QRIS"
            type="number"
            value={qrisAmountInput}
            onChange={(e) => setQrisAmountInput(e.target.value)}
            disabled={!qrisPayload}
            style={{ width: 90, fontSize: 10, padding: "2px 4px", textAlign: "right" }}
          />
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run components/invoice/__tests__/InvoiceDetail.test.tsx`
Expected: PASS (4 tests) — if the last test (disabled-when-no-payload) still fails due to the mock-override issue flagged in Step 1, fix the mock mechanism (not the component code) until it passes; the component behavior itself (disabled input when `qrisPayload` is null) is already correct from Step 3-4's `disabled={!qrisPayload}`.

- [ ] **Step 6: Manual verification**

Run the dashboard dev server, open a real invoice with a QRIS uploaded (from Task 4's manual test), confirm: amount input pre-filled with `sisaBayar`; typing a new amount regenerates the QR image (visually different from the static one) after a short debounce; clearing the input reverts to the static image; exporting to JPEG (existing export button) includes whichever QR image is currently displayed.

- [ ] **Step 7: Run the full dashboard suite + typecheck**

Run: `cd apps/dashboard && pnpm test && pnpm exec tsc --noEmit 2>&1 | grep -E "InvoiceDetail|invoice-qris|use-invoice"`
Expected: `pnpm test` all pass; the `tsc` grep should find nothing (all three files' type errors from Task 3 are now resolved).

- [ ] **Step 8: Commit**

```bash
cd apps/dashboard
git add components/invoice/InvoiceDetail.tsx components/invoice/__tests__/InvoiceDetail.test.tsx
git commit -m "feat(invoice): dynamic per-amount QRIS on invoice detail"
```
