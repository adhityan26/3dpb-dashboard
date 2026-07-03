# Bot Data API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abandoned Discord interactions webhook with token-authenticated JSON endpoints under `/api/bot/*` that an external Discord bot calls, backed by existing `lib/*` services.

**Architecture:** A single bearer-token guard (`requireBotToken`, mirroring the `STL_SERVICE_TOKEN` pattern) protects thin `/api/bot/*` routes. Each route parses its input, calls an existing service function, and returns raw JSON. First the old webhook is torn down; then the routes are built.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest.

## Global Constraints

- This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before using unfamiliar route APIs.
- All `/api/bot/*` routes require `Authorization: Bearer <BOT_API_TOKEN>`; unauthorized → HTTP 401 `{error:"Unauthorized"}`. If `BOT_API_TOKEN` env is unset, treat all requests as unauthorized (never open access).
- Responses are raw JSON; the bot does all Discord formatting.
- Routes call existing `lib/*` services — never duplicate business logic.
- Secrets only in env (`BOT_API_TOKEN`), never in DB/UI.
- Tests use Vitest (`npm test`). Node 22 runtime — if `npx vitest`/`npx tsc` errors "Unexpected token ?", run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22` first.

## Verified service signatures (consumed by routes)

- `createQuotation(input: QuotationInput): Promise<QuotationData>` — `lib/invoice/service.ts`. `QuotationItemInput` = `{ namaProduk, qty, hargaPerUnit, channelHarga: "offline"|"marketplace", ... }`. `QuotationData` has `nomor`, `total`, `status`, `totalPaid`, `sisaBayar`.
- `getQuotationByNomor(nomor: string): Promise<QuotationData | null>` — `lib/invoice/service.ts` (already exists; kept from the removed webhook work).
- `getOrderDetail(orderSnList: string[]): Promise<ShopeeOrderDetail[]>` — `lib/shopee/orders.ts`. `ShopeeOrderDetail`: `order_sn`, `order_status`, `total_amount`, `item_list: { item_name, model_quantity_purchased }[]`.
- `getEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetail | null>` — `lib/shopee/escrow.ts`: `buyer_payment_amount`, `escrow_amount`.
- `loadRates(): Promise<KalkulatorRates>` — `lib/kalkulator/rates.ts`. `hitungKalkulasi(plates: PlateInput[], aksesori, batch, rates, marginTier, hargaShopeeAktual?, customRiskPct?, helmOptions?): HasilKalkulasi` — `lib/kalkulator/formula.ts`. `PlateInput` = `{ tipe?, gramasi?, durasiJam, ... }`; aksesori = `{ switchQty, hasLabel, komponenKustom, packingType?, gantunganType? }`. `HasilKalkulasi`: `hppTotal`, `floorPrice`, `shopeeA`, `offlineA`, `marginShopeeA`. Types `PrintTipe`, `MarginTier` exported from `lib/kalkulator/types.ts`.
- `getProductsPage({ page, limit, q, status }): Promise<ProductsPageResult>` — `lib/products/service.ts`. `ProductSummary`: `name`, `priceMin`, `priceMax`, `hpp`, `grossMargin30d`, `stockTotal`. Result has `products`, `total`.
- `getReadyToShipOrders(): Promise<OrderListResult>` — `lib/orders/service.ts`. `OrderSummary`: `orderSn`, `shopeeStatus`, `buyerUsername`, `labelPrinted`.
- `listSpools(): Promise<SpoolsResponse>` — `lib/filamen/spool-service.ts`. `SpoolData`: `brand`, `material`, `status`.

## File Structure

- DELETE (Task 1): `app/api/discord/interactions/route.ts`; `lib/discord/**`; `scripts/register-discord-commands.mjs`; `components/settings/DiscordStatusCard.tsx`; `app/api/settings/discord-status/route.ts`; `useDiscordStatus` hook + `<DiscordStatusCard/>` render; `docs/discord-bot-setup.md`; `DISCORD_*` lines in deploy.sh; `tweetnacl` from package.json.
- `lib/bot/auth.ts` (Task 2) — `requireBotToken`.
- `app/api/bot/invoice/route.ts` (Task 3, POST) + `app/api/bot/invoice/[nomor]/route.ts` (Task 3, GET).
- `app/api/bot/shopee/order/[sn]/route.ts` (Task 4).
- `app/api/bot/kalkulator/route.ts` (Task 5, POST).
- `app/api/bot/produk/route.ts`, `app/api/bot/order/perlu-cetak/route.ts`, `app/api/bot/stok/filament/route.ts` (Task 6).
- `deploy.sh` + `docs/bot-api.md` (Task 7).

---

## Task 1: Tear down the Discord interactions webhook

**Files:**
- Delete: the webhook files listed below
- Modify: `lib/hooks/use-settings.ts`, `app/(dashboard)/settings/page.tsx`, `deploy.sh`, `package.json`

**Interfaces:**
- Produces: nothing new. Leaves `getQuotationByNomor` in `lib/invoice/service.ts` intact.

- [ ] **Step 1: Delete the webhook files**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
git rm -r app/api/discord lib/discord scripts/register-discord-commands.mjs \
  components/settings/DiscordStatusCard.tsx app/api/settings/discord-status \
  docs/discord-bot-setup.md
```

- [ ] **Step 2: Remove the `useDiscordStatus` hook**

In `lib/hooks/use-settings.ts`, delete the entire `export function useDiscordStatus() { ... }` block (the query hook added for the status card). Leave the rest of the file unchanged.

- [ ] **Step 3: Remove the card from the settings page**

In `app/(dashboard)/settings/page.tsx`, delete the `import { DiscordStatusCard } from "@/components/settings/DiscordStatusCard"` line and the `<DiscordStatusCard />` render line. Leave the surrounding cards unchanged.

- [ ] **Step 4: Remove Discord env from deploy.sh**

In `deploy.sh`, delete the five `-e DISCORD_PUBLIC_KEY=... / DISCORD_APP_ID=... / DISCORD_BOT_TOKEN=... / DISCORD_GUILD_ID=... / DISCORD_ALLOWED_USER_IDS=...` lines from the shopee-dashboard `docker run` block, and delete the `discord:register` script entry from `package.json` `"scripts"`.

- [ ] **Step 5: Remove tweetnacl**

Run: `npm uninstall tweetnacl`
Expected: removed from package.json dependencies.

- [ ] **Step 6: Verify nothing references the deleted code**

Run: `grep -rn "discord\|tweetnacl\|DiscordStatus\|useDiscordStatus" lib app components scripts --include=*.ts --include=*.tsx --include=*.mjs | grep -v node_modules`
Expected: NO output (the only surviving Discord-era symbol is `getQuotationByNomor`, which does not match "discord"). If anything matches, remove that reference.

- [ ] **Step 7: Verify tests + typecheck still pass**

Run: `npm test`
Expected: pass (the discord test files are gone; `getQuotationByNomor` test in `lib/__tests__/invoice/by-nomor.test.ts` remains and passes).
Run: `npx tsc --noEmit 2>&1 | grep -iE "discord|tweetnacl"`
Expected: NO output.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(bot): remove Discord interactions webhook (pivot to token API)"
```

---

## Task 2: Bearer token auth guard

**Files:**
- Create: `lib/bot/auth.ts`
- Test: `lib/bot/__tests__/auth.test.ts`

**Interfaces:**
- Produces: `requireBotToken(req: { headers: { get(name: string): string | null } }): boolean` — true only when `Authorization: Bearer <token>` matches `process.env.BOT_API_TOKEN` (and the env is set).

- [ ] **Step 1: Write the failing test**

Create `lib/bot/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest"
import { requireBotToken } from "@/lib/bot/auth"

function reqWith(auth: string | null) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? auth : null) } }
}

const ORIGINAL = process.env.BOT_API_TOKEN
afterEach(() => { process.env.BOT_API_TOKEN = ORIGINAL })

describe("requireBotToken", () => {
  it("returns true for a matching bearer token", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith("Bearer secret123"))).toBe(true)
  })
  it("returns false for a wrong token", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith("Bearer nope"))).toBe(false)
  })
  it("returns false when the header is missing", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith(null))).toBe(false)
  })
  it("returns false when the header is malformed (no Bearer prefix)", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith("secret123"))).toBe(false)
  })
  it("returns false when BOT_API_TOKEN is unset", () => {
    delete process.env.BOT_API_TOKEN
    expect(requireBotToken(reqWith("Bearer anything"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bot/__tests__/auth.test.ts`
Expected: FAIL — `requireBotToken` not found.

- [ ] **Step 3: Implement**

Create `lib/bot/auth.ts`:

```typescript
/** Constant-time string comparison to avoid timing leaks on the token. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify the bearer token on a bot API request.
 * Returns true only when Authorization: "Bearer <token>" matches BOT_API_TOKEN
 * and the env var is set. Unset env → always false (never open access).
 */
export function requireBotToken(req: { headers: { get(name: string): string | null } }): boolean {
  const expected = process.env.BOT_API_TOKEN
  if (!expected) return false
  const header = req.headers.get("authorization")
  if (!header || !header.startsWith("Bearer ")) return false
  const token = header.slice("Bearer ".length)
  return timingSafeEqual(token, expected)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bot/__tests__/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/bot/auth.ts lib/bot/__tests__/auth.test.ts
git commit -m "feat(bot): bearer token auth guard"
```

---

## Task 3: Invoice endpoints (create + status)

**Files:**
- Create: `app/api/bot/invoice/route.ts` (POST), `app/api/bot/invoice/[nomor]/route.ts` (GET)
- Test: `lib/bot/__tests__/invoice-routes.test.ts`

**Interfaces:**
- Consumes: `requireBotToken` (Task 2); `createQuotation`, `getQuotationByNomor` (lib/invoice/service).
- Produces: `POST /api/bot/invoice` → `{nomor,total,url}`; `GET /api/bot/invoice/[nomor]` → `{nomor,status,total,totalPaid,sisaBayar}`.

- [ ] **Step 1: Write the failing test**

Create `lib/bot/__tests__/invoice-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/invoice/service", () => ({
  createQuotation: vi.fn(),
  getQuotationByNomor: vi.fn(),
}))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { POST } from "@/app/api/bot/invoice/route"
import { GET } from "@/app/api/bot/invoice/[nomor]/route"
import { createQuotation, getQuotationByNomor } from "@/lib/invoice/service"
import { requireBotToken } from "@/lib/bot/auth"

const mockCreate = createQuotation as any
const mockByNomor = getQuotationByNomor as any
const mockAuth = requireBotToken as any

function req(body?: unknown) {
  return { headers: { get: () => "Bearer x" }, json: async () => body } as any
}

describe("POST /api/bot/invoice", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await POST(req({ buyer: "B", items: [{ namaProduk: "A", qty: 1, hargaPerUnit: 100 }] }))
    expect(res.status).toBe(401)
  })

  it("400 when items empty", async () => {
    mockAuth.mockReturnValue(true)
    const res = await POST(req({ buyer: "B", items: [] }))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("400 when an item has non-positive qty", async () => {
    mockAuth.mockReturnValue(true)
    const res = await POST(req({ buyer: "B", items: [{ namaProduk: "A", qty: 0, hargaPerUnit: 100 }] }))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("creates and returns nomor/total/url", async () => {
    mockAuth.mockReturnValue(true)
    mockCreate.mockResolvedValue({ nomor: "INV-1", total: 200 })
    const res = await POST(req({ buyer: "B", items: [{ namaProduk: "A", qty: 2, hargaPerUnit: 100 }], ongkir: 5000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nomor).toBe("INV-1")
    expect(body.total).toBe(200)
    expect(body.url).toContain("/tagihan")
    const arg = mockCreate.mock.calls[0][0]
    expect(arg.buyerNama).toBe("B")
    expect(arg.ongkir).toBe(5000)
    expect(arg.items[0].channelHarga).toBe("marketplace")
  })
})

describe("GET /api/bot/invoice/[nomor]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await GET(req(), { params: Promise.resolve({ nomor: "INV-1" }) })
    expect(res.status).toBe(401)
  })

  it("404 when not found", async () => {
    mockAuth.mockReturnValue(true)
    mockByNomor.mockResolvedValue(null)
    const res = await GET(req(), { params: Promise.resolve({ nomor: "INV-X" }) })
    expect(res.status).toBe(404)
  })

  it("returns status/total/paid/sisa", async () => {
    mockAuth.mockReturnValue(true)
    mockByNomor.mockResolvedValue({ nomor: "INV-1", status: "PARTIAL", total: 200, totalPaid: 50, sisaBayar: 150 })
    const res = await GET(req(), { params: Promise.resolve({ nomor: "INV-1" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ nomor: "INV-1", status: "PARTIAL", total: 200, totalPaid: 50, sisaBayar: 150 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bot/__tests__/invoice-routes.test.ts`
Expected: FAIL — routes not found.

- [ ] **Step 3: Implement the POST route**

Create `app/api/bot/invoice/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { createQuotation } from "@/lib/invoice/service"

const BASE_URL = "https://dashboard.3dprintingbandung.my.id"

interface ItemInput { namaProduk?: unknown; qty?: unknown; hargaPerUnit?: unknown }

export async function POST(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { buyer?: unknown; items?: unknown; ongkir?: unknown } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

  const buyer = typeof body.buyer === "string" ? body.buyer.trim() : ""
  if (!buyer) return NextResponse.json({ error: "buyer wajib diisi" }, { status: 400 })

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items wajib berisi minimal 1 item" }, { status: 400 })
  }

  const items = []
  for (const raw of body.items as ItemInput[]) {
    const namaProduk = typeof raw.namaProduk === "string" ? raw.namaProduk.trim() : ""
    const qty = Number(raw.qty)
    const hargaPerUnit = Number(raw.hargaPerUnit)
    if (!namaProduk || !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty) ||
        !Number.isFinite(hargaPerUnit) || hargaPerUnit <= 0) {
      return NextResponse.json(
        { error: "setiap item butuh namaProduk, qty (int>0), hargaPerUnit (>0)" },
        { status: 400 },
      )
    }
    items.push({ namaProduk, qty, hargaPerUnit, channelHarga: "marketplace" as const })
  }

  const ongkir = typeof body.ongkir === "number" && body.ongkir >= 0 ? body.ongkir : 0

  try {
    const inv = await createQuotation({ buyerNama: buyer, ongkir, items })
    return NextResponse.json({ nomor: inv.nomor, total: inv.total, url: `${BASE_URL}/tagihan` })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat invoice" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Implement the GET route**

Create `app/api/bot/invoice/[nomor]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getQuotationByNomor } from "@/lib/invoice/service"

export async function GET(req: NextRequest, { params }: { params: Promise<{ nomor: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { nomor } = await params
  const inv = await getQuotationByNomor(nomor)
  if (!inv) return NextResponse.json({ error: `Invoice ${nomor} tidak ditemukan` }, { status: 404 })
  return NextResponse.json({
    nomor: inv.nomor,
    status: inv.status,
    total: inv.total,
    totalPaid: inv.totalPaid,
    sisaBayar: inv.sisaBayar,
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/bot/__tests__/invoice-routes.test.ts`
Expected: PASS (7 tests). Then `npx tsc --noEmit` — no errors in the new route files.

- [ ] **Step 6: Commit**

```bash
git add app/api/bot/invoice lib/bot/__tests__/invoice-routes.test.ts
git commit -m "feat(bot): invoice create + status endpoints"
```

---

## Task 4: Shopee order endpoint

**Files:**
- Create: `app/api/bot/shopee/order/[sn]/route.ts`
- Test: `lib/bot/__tests__/shopee-route.test.ts`

**Interfaces:**
- Consumes: `requireBotToken`; `getOrderDetail` (lib/shopee/orders), `getEscrowDetail` (lib/shopee/escrow).
- Produces: `GET /api/bot/shopee/order/[sn]` → `{orderSn,status,items,total,buyerPaid,received,url}`.

- [ ] **Step 1: Write the failing test**

Create `lib/bot/__tests__/shopee-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/orders", () => ({ getOrderDetail: vi.fn() }))
vi.mock("@/lib/shopee/escrow", () => ({ getEscrowDetail: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { GET } from "@/app/api/bot/shopee/order/[sn]/route"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"
import { requireBotToken } from "@/lib/bot/auth"

const mockDetail = getOrderDetail as any
const mockEscrow = getEscrowDetail as any
const mockAuth = requireBotToken as any
const req = { headers: { get: () => "Bearer x" } } as any
const ctx = (sn: string) => ({ params: Promise.resolve({ sn }) })

describe("GET /api/bot/shopee/order/[sn]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(401)
  })

  it("404 when order not found", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([])
    mockEscrow.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(404)
  })

  it("returns order with escrow money", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([{
      order_sn: "S1", order_status: "READY_TO_SHIP", total_amount: 100,
      item_list: [{ item_name: "Keychain", model_quantity_purchased: 2 }],
    }])
    mockEscrow.mockResolvedValue({ buyer_payment_amount: 110, escrow_amount: 90 })
    const res = await GET(req, ctx("S1"))
    const body = await res.json()
    expect(body).toEqual({
      orderSn: "S1", status: "READY_TO_SHIP", total: 100,
      items: [{ name: "Keychain", qty: 2 }],
      buyerPaid: 110, received: 90,
      url: "https://seller.shopee.co.id/portal/sale/order/S1",
    })
  })

  it("returns null money when escrow missing", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([{ order_sn: "S1", order_status: "UNPAID", total_amount: 100, item_list: [] }])
    mockEscrow.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    const body = await res.json()
    expect(body.buyerPaid).toBeNull()
    expect(body.received).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bot/__tests__/shopee-route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement**

Create `app/api/bot/shopee/order/[sn]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"

const SELLER_ORDER_URL = "https://seller.shopee.co.id/portal/sale/order"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sn: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { sn } = await params

  const [details, escrow] = await Promise.all([getOrderDetail([sn]), getEscrowDetail(sn)])
  const detail = details[0]
  if (!detail) return NextResponse.json({ error: `Order ${sn} tidak ditemukan` }, { status: 404 })

  return NextResponse.json({
    orderSn: detail.order_sn,
    status: detail.order_status,
    total: detail.total_amount,
    items: detail.item_list.map(i => ({ name: i.item_name, qty: i.model_quantity_purchased })),
    buyerPaid: escrow ? escrow.buyer_payment_amount : null,
    received: escrow ? escrow.escrow_amount : null,
    url: `${SELLER_ORDER_URL}/${detail.order_sn}`,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bot/__tests__/shopee-route.test.ts`
Expected: PASS (4 tests). Then `npx tsc --noEmit` — no errors in the new file.

- [ ] **Step 5: Commit**

```bash
git add app/api/bot/shopee lib/bot/__tests__/shopee-route.test.ts
git commit -m "feat(bot): shopee order endpoint"
```

---

## Task 5: Kalkulator endpoint

**Files:**
- Create: `app/api/bot/kalkulator/route.ts`
- Test: `lib/bot/__tests__/kalkulator-route.test.ts`

**Interfaces:**
- Consumes: `requireBotToken`; `loadRates` (lib/kalkulator/rates), `hitungKalkulasi` (lib/kalkulator/formula).
- Produces: `POST /api/bot/kalkulator` → `{hppTotal,floorPrice,shopeeA,offlineA,marginShopeeA}`.

- [ ] **Step 1: Write the failing test**

Create `lib/bot/__tests__/kalkulator-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/kalkulator/rates", () => ({ loadRates: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { POST } from "@/app/api/bot/kalkulator/route"
import { loadRates } from "@/lib/kalkulator/rates"
import { requireBotToken } from "@/lib/bot/auth"

const mockRates = loadRates as any
const mockAuth = requireBotToken as any
const req = (body: unknown) => ({ headers: { get: () => "Bearer x" }, json: async () => body } as any)

const RATES = {
  fdmHppPerGram: 300, slaHppPerGram: 800, fdmJualPerGram: 500, slaJualPerGram: 1200,
  mesinPerJam: 1000, adminEcommerce: 0.8, failureRatePct: 12, failureSpreadPct: 50,
  testLayerPct: 5, packing: {}, gantungan: {}, switchPerPcs: 0, labelPerLembar: 0,
}

describe("POST /api/bot/kalkulator", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await POST(req({ gramasi: 50, jam: 2 }))
    expect(res.status).toBe(401)
  })

  it("400 when gramasi or jam <= 0", async () => {
    mockAuth.mockReturnValue(true)
    const res = await POST(req({ gramasi: 0, jam: 2 }))
    expect(res.status).toBe(400)
  })

  it("returns computed prices", async () => {
    mockAuth.mockReturnValue(true)
    mockRates.mockResolvedValue(RATES)
    const res = await POST(req({ gramasi: 50, jam: 2, tipe: "FDM", tier: "A" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("hppTotal")
    expect(body).toHaveProperty("floorPrice")
    expect(body).toHaveProperty("shopeeA")
    expect(body).toHaveProperty("offlineA")
    expect(body).toHaveProperty("marginShopeeA")
    expect(typeof body.hppTotal).toBe("number")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bot/__tests__/kalkulator-route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement**

Create `app/api/bot/kalkulator/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { loadRates } from "@/lib/kalkulator/rates"
import { hitungKalkulasi } from "@/lib/kalkulator/formula"
import type { PrintTipe, MarginTier } from "@/lib/kalkulator/types"

export async function POST(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { gramasi?: unknown; jam?: unknown; tipe?: unknown; tier?: unknown } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

  const gramasi = Number(body.gramasi)
  const jam = Number(body.jam)
  if (!Number.isFinite(gramasi) || gramasi <= 0 || !Number.isFinite(jam) || jam <= 0) {
    return NextResponse.json({ error: "gramasi dan jam harus angka > 0" }, { status: 400 })
  }
  const tipe = (body.tipe === "SLA" ? "SLA" : "FDM") as PrintTipe
  const tier = (body.tier === "B" || body.tier === "C" ? body.tier : "A") as MarginTier

  const rates = await loadRates()
  const hasil = hitungKalkulasi(
    [{ tipe, gramasi, durasiJam: jam }],
    { switchQty: 0, hasLabel: false, komponenKustom: [] },
    1,
    rates,
    tier,
  )
  return NextResponse.json({
    hppTotal: hasil.hppTotal,
    floorPrice: hasil.floorPrice,
    shopeeA: hasil.shopeeA,
    offlineA: hasil.offlineA,
    marginShopeeA: hasil.marginShopeeA,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bot/__tests__/kalkulator-route.test.ts`
Expected: PASS (3 tests). Then `npx tsc --noEmit` — no errors in the new file.

- [ ] **Step 5: Commit**

```bash
git add app/api/bot/kalkulator lib/bot/__tests__/kalkulator-route.test.ts
git commit -m "feat(bot): kalkulator endpoint"
```

---

## Task 6: Produk, order queue, and filament stock endpoints

**Files:**
- Create: `app/api/bot/produk/route.ts`, `app/api/bot/order/perlu-cetak/route.ts`, `app/api/bot/stok/filament/route.ts`
- Test: `lib/bot/__tests__/read-routes.test.ts`

**Interfaces:**
- Consumes: `requireBotToken`; `getProductsPage` (lib/products/service), `getReadyToShipOrders` (lib/orders/service), `listSpools` (lib/filamen/spool-service).
- Produces: `GET /api/bot/produk?q=` → `{products,total}`; `GET /api/bot/order/perlu-cetak` → `{orders,count}`; `GET /api/bot/stok/filament?brand=` → `{groups}`.

- [ ] **Step 1: Write the failing test**

Create `lib/bot/__tests__/read-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/products/service", () => ({ getProductsPage: vi.fn() }))
vi.mock("@/lib/orders/service", () => ({ getReadyToShipOrders: vi.fn() }))
vi.mock("@/lib/filamen/spool-service", () => ({ listSpools: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { GET as produkGET } from "@/app/api/bot/produk/route"
import { GET as orderGET } from "@/app/api/bot/order/perlu-cetak/route"
import { GET as stokGET } from "@/app/api/bot/stok/filament/route"
import { getProductsPage } from "@/lib/products/service"
import { getReadyToShipOrders } from "@/lib/orders/service"
import { listSpools } from "@/lib/filamen/spool-service"
import { requireBotToken } from "@/lib/bot/auth"

const mockProducts = getProductsPage as any
const mockOrders = getReadyToShipOrders as any
const mockSpools = listSpools as any
const mockAuth = requireBotToken as any
const reqUrl = (url: string) => ({ headers: { get: () => "Bearer x" }, url } as any)

describe("GET /api/bot/produk", () => {
  beforeEach(() => vi.clearAllMocks())
  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await produkGET(reqUrl("http://x/api/bot/produk?q=key"))
    expect(res.status).toBe(401)
  })
  it("returns mapped products", async () => {
    mockAuth.mockReturnValue(true)
    mockProducts.mockResolvedValue({ total: 1, products: [
      { name: "Keychain", priceMin: 15000, priceMax: 15000, hpp: 5000, grossMargin30d: 40, stockTotal: 12 },
    ] })
    const res = await produkGET(reqUrl("http://x/api/bot/produk?q=key"))
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.products[0]).toEqual({ name: "Keychain", priceMin: 15000, priceMax: 15000, hpp: 5000, margin: 40, stock: 12 })
    expect(mockProducts.mock.calls[0][0]).toMatchObject({ q: "key", page: 1, limit: 5, status: "all" })
  })
})

describe("GET /api/bot/order/perlu-cetak", () => {
  beforeEach(() => vi.clearAllMocks())
  it("returns only not-yet-printed orders", async () => {
    mockAuth.mockReturnValue(true)
    mockOrders.mockResolvedValue({ orders: [
      { orderSn: "A", shopeeStatus: "PROCESSED", buyerUsername: "budi", labelPrinted: false },
      { orderSn: "B", shopeeStatus: "PROCESSED", buyerUsername: "siti", labelPrinted: true },
    ] })
    const res = await orderGET(reqUrl("http://x/api/bot/order/perlu-cetak"))
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.orders).toEqual([{ orderSn: "A", status: "PROCESSED", buyer: "budi" }])
  })
})

describe("GET /api/bot/stok/filament", () => {
  beforeEach(() => vi.clearAllMocks())
  it("groups non-empty spools by brand+material, filtered by brand", async () => {
    mockAuth.mockReturnValue(true)
    mockSpools.mockResolvedValue({ spools: [
      { brand: "Sunlu", material: "PLA", status: "full" },
      { brand: "Sunlu", material: "PLA", status: "low" },
      { brand: "Sunlu", material: "ABS", status: "empty" },
      { brand: "eSun", material: "PLA", status: "full" },
    ] })
    const res = await stokGET(reqUrl("http://x/api/bot/stok/filament?brand=sunlu"))
    const body = await res.json()
    expect(body.groups).toEqual([{ key: "Sunlu PLA", count: 2 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bot/__tests__/read-routes.test.ts`
Expected: FAIL — routes not found.

- [ ] **Step 3: Implement produk route**

Create `app/api/bot/produk/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getProductsPage } from "@/lib/products/service"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const q = new URL(req.url).searchParams.get("q") ?? ""
  const page = await getProductsPage({ page: 1, limit: 5, q, status: "all" })
  return NextResponse.json({
    total: page.total,
    products: page.products.map(p => ({
      name: p.name,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      hpp: p.hpp,
      margin: p.grossMargin30d,
      stock: p.stockTotal,
    })),
  })
}
```

- [ ] **Step 4: Implement order/perlu-cetak route**

Create `app/api/bot/order/perlu-cetak/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getReadyToShipOrders } from "@/lib/orders/service"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await getReadyToShipOrders()
  const orders = result.orders
    .filter(o => !o.labelPrinted)
    .map(o => ({ orderSn: o.orderSn, status: o.shopeeStatus, buyer: o.buyerUsername }))
  return NextResponse.json({ orders, count: orders.length })
}
```

- [ ] **Step 5: Implement stok/filament route**

Create `app/api/bot/stok/filament/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { listSpools } from "@/lib/filamen/spool-service"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const brand = (new URL(req.url).searchParams.get("brand") ?? "").trim().toLowerCase()
  const { spools } = await listSpools()
  const filtered = brand ? spools.filter(s => s.brand.toLowerCase().includes(brand)) : spools

  const groups = new Map<string, number>()
  for (const s of filtered) {
    if (s.status === "empty") continue
    const key = `${s.brand} ${s.material}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const list = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }))
  return NextResponse.json({ groups: list })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/bot/__tests__/read-routes.test.ts`
Expected: PASS (4 tests). Then `npx tsc --noEmit` — no errors in the new files.

- [ ] **Step 7: Commit**

```bash
git add app/api/bot/produk app/api/bot/order app/api/bot/stok lib/bot/__tests__/read-routes.test.ts
git commit -m "feat(bot): produk, order-queue, filament-stock endpoints"
```

---

## Task 7: Env wiring + API docs

**Files:**
- Modify: `deploy.sh`
- Create: `docs/bot-api.md`

- [ ] **Step 1: Add BOT_API_TOKEN to deploy.sh**

In `deploy.sh`, in the shopee-dashboard `docker run` block (among the existing `-e` lines), add:

```bash
  -e BOT_API_TOKEN="${BOT_API_TOKEN:-}" \
```

- [ ] **Step 2: Write the API docs**

Create `docs/bot-api.md`:

```markdown
# Bot Data API

Token-authenticated JSON endpoints for the external Discord bot. Base: `https://dashboard.3dprintingbandung.my.id`.
All requests require header `Authorization: Bearer $BOT_API_TOKEN`. Missing/invalid → 401.

## Endpoints

### POST /api/bot/invoice
Body: `{ "buyer": "Budi", "items": [{ "namaProduk": "Keychain", "qty": 2, "hargaPerUnit": 15000 }], "ongkir": 5000 }`
→ `{ "nomor": "INV-...", "total": 35000, "url": ".../tagihan" }`
```bash
curl -X POST .../api/bot/invoice -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"buyer":"Budi","items":[{"namaProduk":"Keychain","qty":2,"hargaPerUnit":15000}],"ongkir":5000}'
```

### GET /api/bot/invoice/{nomor}
→ `{ "nomor", "status", "total", "totalPaid", "sisaBayar" }` · 404 if not found.

### GET /api/bot/shopee/order/{sn}
→ `{ "orderSn", "status", "items":[{"name","qty"}], "total", "buyerPaid", "received", "url" }` · `buyerPaid`/`received` null if escrow unavailable · 404 if not found.

### POST /api/bot/kalkulator
Body: `{ "gramasi": 50, "jam": 2, "tipe": "FDM", "tier": "A" }` (tipe FDM|SLA default FDM; tier A|B|C default A)
→ `{ "hppTotal", "floorPrice", "shopeeA", "offlineA", "marginShopeeA" }` · 400 if gramasi/jam ≤ 0.

### GET /api/bot/produk?q={kata}
→ `{ "products":[{"name","priceMin","priceMax","hpp","margin","stock"}], "total" }` (top 5; hpp/margin may be null).

### GET /api/bot/order/perlu-cetak
→ `{ "orders":[{"orderSn","status","buyer"}], "count" }` (orders not yet label-printed).

### GET /api/bot/stok/filament?brand={brand}
→ `{ "groups":[{"key","count"}] }` (non-empty spools grouped by "brand material"; brand filter optional).
```

- [ ] **Step 3: Full verification**

Run: `npm test` (all pass) and `npx tsc --noEmit` (no new errors).

- [ ] **Step 4: Commit**

```bash
git add deploy.sh docs/bot-api.md
git commit -m "chore(bot): BOT_API_TOKEN env wiring + API docs"
```

- [ ] **Step 5: Deploy** (after operator sets `BOT_API_TOKEN` on the deploy host)

Run: `bash deploy.sh`
Smoke test: `curl -X POST .../api/bot/kalkulator -H "Authorization: Bearer $BOT_API_TOKEN" -H "Content-Type: application/json" -d '{"gramasi":50,"jam":2}'` → expect a JSON price object.
