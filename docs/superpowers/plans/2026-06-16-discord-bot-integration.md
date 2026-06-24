# Discord Bot Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose dashboard operations as Discord slash commands for internal/operator use, via a signature-verified HTTP interactions webhook that calls existing `lib/*` services directly.

**Architecture:** Discord posts ed25519-signed slash interactions to `POST /api/discord/interactions` in the dashboard. The route verifies the signature, answers PING→PONG, enforces a guild + user allowlist, then dispatches to thin per-command handlers that call existing service functions. Slow commands defer (ACK <3s) and PATCH the follow-up. A read-only Settings card shows connection/registration status.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, `tweetnacl` (ed25519 verification), Discord HTTP Interactions API.

## Global Constraints

- This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- All Discord replies are **ephemeral** (interaction response flag `64`) — they contain internal pricing/HPP/escrow data.
- Discord command/subcommand names: single lowercase token matching `^[-_\p{L}\p{N}]{1,32}$` (dashes allowed, no spaces).
- Handlers MUST call existing `lib/*` services — never duplicate business logic.
- Secrets only in env (never DB/UI): `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_ALLOWED_USER_IDS`.
- Tests use Vitest (`npm test`).

## File Structure

- `lib/discord/verify.ts` — ed25519 signature verification (tweetnacl)
- `lib/discord/types.ts` — minimal Discord interaction types we use
- `lib/discord/parse-items.ts` — `/invoice buat` items string parser (pure)
- `lib/discord/format.ts` — rupiah formatter + reply-text builders
- `lib/discord/respond.ts` — interaction response builders + follow-up PATCH
- `lib/discord/command-defs.ts` — slash command definitions (single source: route dispatch + registration script)
- `lib/discord/commands/{invoice,shopee,kalkulator,produk,order,stok}.ts` — thin handlers → existing services
- `lib/discord/dispatch.ts` — map command/subcommand → handler
- `app/api/discord/interactions/route.ts` — verify + PING/PONG + access check + dispatch + defer/follow-up
- `lib/invoice/service.ts` — ADD `getQuotationByNomor(nomor)` (status command needs lookup by nomor)
- `app/api/settings/discord-status/route.ts` — status for the card (session-gated)
- `components/settings/DiscordStatusCard.tsx` + hook in `lib/hooks/use-settings.ts`
- `app/(dashboard)/settings/page.tsx` — render the card
- `scripts/register-discord-commands.mjs` — one-shot guild command registration
- `docs/discord-bot-setup.md` — setup runbook
- `deploy.sh` — pass the 5 Discord env vars

## Verified service signatures (consumed by handlers)

- `createQuotation(input: QuotationInput): Promise<QuotationData>` — `lib/invoice/service.ts`. `QuotationInput.items: QuotationItemInput[]` where item = `{ namaProduk, qty, hargaPerUnit, channelHarga: "offline"|"marketplace" }`. `QuotationData` has `nomor`, `total`.
- `getQuotationByNomor(nomor): Promise<QuotationData | null>` — NEW in Task 7.
- `getOrderDetail(orderSnList: string[]): Promise<ShopeeOrderDetail[]>` — `lib/shopee/orders.ts`. `ShopeeOrderDetail`: `order_sn`, `order_status`, `total_amount`, `item_list: { item_name, model_quantity_purchased }[]`.
- `getEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetail | null>` — `lib/shopee/escrow.ts`. Fields: `buyer_payment_amount`, `escrow_amount`.
- `hitungKalkulasi(plates, aksesori, batch, rates, marginTier, hargaShopeeAktual?, customRiskPct?, helmOptions?): HasilKalkulasi` — `lib/kalkulator/formula.ts`. `loadRates(): Promise<KalkulatorRates>` — `lib/kalkulator/rates.ts`. `PlateInput` = `{ tipe?, gramasi?, durasiJam, ... }`. `HasilKalkulasi`: `hppTotal`, `floorPrice`, `shopeeA`, `offlineA`, `marginShopeeA`.
- `getProductsPage({ page, limit, q, status }): Promise<ProductsPageResult>` — `lib/products/service.ts`. `ProductSummary`: `name`, `priceMin`, `priceMax`, `hpp`, `grossMargin30d`, `stockTotal`.
- `getReadyToShipOrders(): Promise<OrderListResult>` — `lib/orders/service.ts`. `OrderSummary`: `orderSn`, `shopeeStatus`, `buyerUsername`, `labelPrinted`.
- `listSpools(): Promise<SpoolsResponse>` — `lib/filamen/spool-service.ts`. `SpoolData`: `brand`, `material`, `colorName`, `status`.

---

## Task 1: Install tweetnacl + ed25519 signature verification

**Files:**
- Modify: `package.json` (add `tweetnacl`)
- Create: `lib/discord/verify.ts`
- Test: `lib/discord/__tests__/verify.test.ts`

**Interfaces:**
- Produces: `verifyDiscordSignature(rawBody: string, signature: string, timestamp: string, publicKey: string): boolean`

- [ ] **Step 1: Install dependency**

Run: `npm install tweetnacl@1.0.3`
Expected: added to dependencies, no errors.

- [ ] **Step 2: Write the failing test**

Create `lib/discord/__tests__/verify.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import nacl from "tweetnacl"
import { verifyDiscordSignature } from "@/lib/discord/verify"

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

describe("verifyDiscordSignature", () => {
  const kp = nacl.sign.keyPair()
  const publicKeyHex = hex(kp.publicKey)
  const timestamp = "1700000000"
  const body = JSON.stringify({ type: 1 })

  it("returns true for a valid signature", () => {
    const message = new TextEncoder().encode(timestamp + body)
    const sig = hex(nacl.sign.detached(message, kp.secretKey))
    expect(verifyDiscordSignature(body, sig, timestamp, publicKeyHex)).toBe(true)
  })

  it("returns false for a tampered body", () => {
    const message = new TextEncoder().encode(timestamp + body)
    const sig = hex(nacl.sign.detached(message, kp.secretKey))
    expect(verifyDiscordSignature('{"type":2}', sig, timestamp, publicKeyHex)).toBe(false)
  })

  it("returns false for malformed signature hex", () => {
    expect(verifyDiscordSignature(body, "zzzz", timestamp, publicKeyHex)).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/discord/__tests__/verify.test.ts`
Expected: FAIL — `verifyDiscordSignature` not found.

- [ ] **Step 4: Implement**

Create `lib/discord/verify.ts`:

```typescript
import nacl from "tweetnacl"

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new Error("bad hex")
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Verify a Discord interaction request's ed25519 signature. */
export function verifyDiscordSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): boolean {
  try {
    const message = new TextEncoder().encode(timestamp + rawBody)
    return nacl.sign.detached.verify(message, hexToBytes(signature), hexToBytes(publicKey))
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/discord/__tests__/verify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/discord/verify.ts lib/discord/__tests__/verify.test.ts
git commit -m "feat(discord): ed25519 interaction signature verification"
```

---

## Task 2: Items parser for /invoice buat

**Files:**
- Create: `lib/discord/parse-items.ts`
- Test: `lib/discord/__tests__/parse-items.test.ts`

**Interfaces:**
- Produces: `parseInvoiceItems(raw: string): { ok: true; items: { namaProduk: string; qty: number; hargaPerUnit: number; channelHarga: "marketplace" }[] } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `lib/discord/__tests__/parse-items.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { parseInvoiceItems } from "@/lib/discord/parse-items"

describe("parseInvoiceItems", () => {
  it("parses a single item", () => {
    const r = parseInvoiceItems("Keychain|2|15000")
    expect(r).toEqual({ ok: true, items: [
      { namaProduk: "Keychain", qty: 2, hargaPerUnit: 15000, channelHarga: "marketplace" },
    ] })
  })

  it("parses multiple items separated by ;", () => {
    const r = parseInvoiceItems("Keychain|2|15000; Stand|1|50000")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items).toHaveLength(2)
  })

  it("trims whitespace around fields", () => {
    const r = parseInvoiceItems("  Keychain | 2 | 15000 ")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0]).toEqual({ namaProduk: "Keychain", qty: 2, hargaPerUnit: 15000, channelHarga: "marketplace" })
  })

  it("rejects an item missing fields", () => {
    const r = parseInvoiceItems("Keychain|2")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("Keychain|2")
  })

  it("rejects non-numeric qty/harga", () => {
    expect(parseInvoiceItems("Keychain|x|15000").ok).toBe(false)
    expect(parseInvoiceItems("Keychain|2|abc").ok).toBe(false)
  })

  it("rejects zero/negative qty or harga", () => {
    expect(parseInvoiceItems("Keychain|0|15000").ok).toBe(false)
    expect(parseInvoiceItems("Keychain|2|-1").ok).toBe(false)
  })

  it("rejects empty input", () => {
    expect(parseInvoiceItems("   ").ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/discord/__tests__/parse-items.test.ts`
Expected: FAIL — not found.

- [ ] **Step 3: Implement**

Create `lib/discord/parse-items.ts`:

```typescript
export interface ParsedInvoiceItem {
  namaProduk: string
  qty: number
  hargaPerUnit: number
  channelHarga: "marketplace"
}

export type ParseItemsResult =
  | { ok: true; items: ParsedInvoiceItem[] }
  | { ok: false; error: string }

/**
 * Parse the /invoice buat items string.
 * Format: `nama|qty|harga` per item, items separated by `;`.
 * Example: "Keychain|2|15000; Stand|1|50000"
 */
export function parseInvoiceItems(raw: string): ParseItemsResult {
  const chunks = raw.split(";").map(s => s.trim()).filter(Boolean)
  if (chunks.length === 0) {
    return { ok: false, error: "Items kosong. Format: `nama|qty|harga; nama|qty|harga`" }
  }
  const items: ParsedInvoiceItem[] = []
  for (const chunk of chunks) {
    const parts = chunk.split("|").map(s => s.trim())
    if (parts.length !== 3 || parts.some(p => p === "")) {
      return { ok: false, error: `Format item salah: \`${chunk}\` — harus \`nama|qty|harga\`` }
    }
    const [namaProduk, qtyStr, hargaStr] = parts
    const qty = Number(qtyStr)
    const hargaPerUnit = Number(hargaStr)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return { ok: false, error: `Qty tidak valid pada \`${chunk}\` — harus bilangan bulat > 0` }
    }
    if (!Number.isFinite(hargaPerUnit) || hargaPerUnit <= 0) {
      return { ok: false, error: `Harga tidak valid pada \`${chunk}\` — harus angka > 0` }
    }
    items.push({ namaProduk, qty, hargaPerUnit, channelHarga: "marketplace" })
  }
  return { ok: true, items }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/discord/__tests__/parse-items.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/discord/parse-items.ts lib/discord/__tests__/parse-items.test.ts
git commit -m "feat(discord): /invoice buat items parser"
```

---

## Task 3: Formatter + response helpers + interaction types

**Files:**
- Create: `lib/discord/types.ts`, `lib/discord/format.ts`, `lib/discord/respond.ts`
- Test: `lib/discord/__tests__/format.test.ts`

**Interfaces:**
- Produces (types.ts): `DiscordInteraction` = `{ type: number; guild_id?: string; member?: { user?: { id: string } }; user?: { id: string }; token: string; application_id?: string; data?: { name: string; options?: DiscordOption[] } }`; `DiscordOption` = `{ name: string; value?: string | number; options?: DiscordOption[] }`.
- Produces (format.ts): `rupiah(n: number): string`; `getOption(opts: DiscordOption[] | undefined, name: string): string | number | undefined`.
- Produces (respond.ts): `EPHEMERAL = 64`; `pong()`, `ephemeralMessage(content: string)`, `deferredEphemeral()` returning interaction-response JSON objects; `followUp(applicationId: string, token: string, content: string): Promise<void>` (PATCH `@original`).

- [ ] **Step 1: Write the failing test**

Create `lib/discord/__tests__/format.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { rupiah, getOption } from "@/lib/discord/format"

describe("rupiah", () => {
  it("formats with thousands separator and Rp prefix", () => {
    expect(rupiah(15000)).toBe("Rp 15.000")
    expect(rupiah(0)).toBe("Rp 0")
    expect(rupiah(1234567)).toBe("Rp 1.234.567")
  })
})

describe("getOption", () => {
  const opts = [{ name: "buyer", value: "Budi" }, { name: "ongkir", value: 5000 }]
  it("returns the value by name", () => {
    expect(getOption(opts, "buyer")).toBe("Budi")
    expect(getOption(opts, "ongkir")).toBe(5000)
  })
  it("returns undefined for missing name or undefined opts", () => {
    expect(getOption(opts, "nope")).toBeUndefined()
    expect(getOption(undefined, "buyer")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/discord/__tests__/format.test.ts`
Expected: FAIL — not found.

- [ ] **Step 3: Implement types.ts**

Create `lib/discord/types.ts`:

```typescript
export interface DiscordOption {
  name: string
  value?: string | number
  options?: DiscordOption[]
}

export interface DiscordInteraction {
  type: number
  guild_id?: string
  member?: { user?: { id: string } }
  user?: { id: string }
  token: string
  application_id?: string
  data?: { name: string; options?: DiscordOption[] }
}

export const INTERACTION_TYPE = { PING: 1, APPLICATION_COMMAND: 2 } as const
export const RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const
```

- [ ] **Step 4: Implement format.ts**

Create `lib/discord/format.ts`:

```typescript
import type { DiscordOption } from "./types"

export function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}

export function getOption(
  opts: DiscordOption[] | undefined,
  name: string,
): string | number | undefined {
  return opts?.find(o => o.name === name)?.value
}
```

- [ ] **Step 5: Implement respond.ts**

Create `lib/discord/respond.ts`:

```typescript
import { RESPONSE_TYPE } from "./types"

export const EPHEMERAL = 64

export function pong() {
  return { type: RESPONSE_TYPE.PONG }
}

export function ephemeralMessage(content: string) {
  return { type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content, flags: EPHEMERAL } }
}

export function deferredEphemeral() {
  return { type: RESPONSE_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: EPHEMERAL } }
}

/** Edit the original deferred response with the final content. */
export async function followUp(applicationId: string, token: string, content: string): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    console.warn("[discord] follow-up PATCH failed:", res.status, await res.text().catch(() => ""))
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/discord/__tests__/format.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/discord/types.ts lib/discord/format.ts lib/discord/respond.ts lib/discord/__tests__/format.test.ts
git commit -m "feat(discord): interaction types, formatter, response helpers"
```

---

## Task 4: Command definitions (single source) + registration script

**Files:**
- Create: `lib/discord/command-defs.ts`, `scripts/register-discord-commands.mjs`

**Interfaces:**
- Produces: `COMMAND_DEFS` — array of Discord application command objects with subcommands/options. Imported by the registration script.

- [ ] **Step 1: Implement command-defs.ts**

Create `lib/discord/command-defs.ts`. Option types: `1`=SUB_COMMAND, `3`=STRING, `4`=INTEGER, `10`=NUMBER. Choices for `tipe`/`tier`.

```typescript
// Discord application command option types
const SUB = 1, STRING = 3, INT = 4, NUMBER = 10

export const COMMAND_DEFS = [
  {
    name: "invoice",
    description: "Kelola invoice",
    options: [
      {
        type: SUB, name: "buat", description: "Buat invoice baru",
        options: [
          { type: STRING, name: "buyer", description: "Nama pembeli", required: true },
          { type: STRING, name: "items", description: "nama|qty|harga; nama|qty|harga", required: true },
          { type: INT, name: "ongkir", description: "Ongkir (opsional)", required: false },
        ],
      },
      {
        type: SUB, name: "status", description: "Cek status invoice",
        options: [
          { type: STRING, name: "nomor", description: "Nomor invoice (mis. INV-20260616-001)", required: true },
        ],
      },
    ],
  },
  {
    name: "shopee",
    description: "Shopee",
    options: [
      {
        type: SUB, name: "order", description: "Cari order Shopee by order SN",
        options: [
          { type: STRING, name: "sn", description: "Order SN", required: true },
        ],
      },
    ],
  },
  {
    name: "kalkulator",
    description: "Hitung harga cepat 1-plate",
    options: [
      { type: NUMBER, name: "gramasi", description: "Gramasi (gram)", required: true },
      { type: NUMBER, name: "jam", description: "Durasi print (jam)", required: true },
      { type: STRING, name: "tipe", description: "Tipe material", required: false,
        choices: [{ name: "FDM", value: "FDM" }, { name: "SLA", value: "SLA" }] },
      { type: STRING, name: "tier", description: "Margin tier", required: false,
        choices: [{ name: "A", value: "A" }, { name: "B", value: "B" }, { name: "C", value: "C" }] },
    ],
  },
  {
    name: "produk",
    description: "Produk Shopee",
    options: [
      {
        type: SUB, name: "cari", description: "Cari produk",
        options: [{ type: STRING, name: "kata", description: "Kata kunci", required: true }],
      },
    ],
  },
  {
    name: "order",
    description: "Order Shopee",
    options: [
      { type: SUB, name: "perlu-cetak", description: "Order siap/perlu cetak label" },
    ],
  },
  {
    name: "stok",
    description: "Stok",
    options: [
      {
        type: SUB, name: "filament", description: "Cek stok filament/spool",
        options: [{ type: STRING, name: "brand", description: "Filter brand (opsional)", required: false }],
      },
    ],
  },
]
```

- [ ] **Step 2: Implement the registration script**

Create `scripts/register-discord-commands.mjs`:

```javascript
// One-shot: register guild slash commands. Run: node scripts/register-discord-commands.mjs
import { COMMAND_DEFS } from "../lib/discord/command-defs.ts"

const APP_ID = process.env.DISCORD_APP_ID
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD_ID = process.env.DISCORD_GUILD_ID

if (!APP_ID || !BOT_TOKEN || !GUILD_ID) {
  console.error("Missing DISCORD_APP_ID / DISCORD_BOT_TOKEN / DISCORD_GUILD_ID env")
  process.exit(1)
}

const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
const res = await fetch(url, {
  method: "PUT",
  headers: { "Authorization": `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(COMMAND_DEFS),
})
if (!res.ok) {
  console.error("Registration failed:", res.status, await res.text())
  process.exit(1)
}
console.log("Registered", (await res.json()).length, "commands to guild", GUILD_ID)
```

Note: this script imports a `.ts` file. It must be run with a TS-capable loader. Add an npm script in `package.json` `"scripts"`:

```json
"discord:register": "node --experimental-strip-types scripts/register-discord-commands.mjs"
```

(Node 22 supports `--experimental-strip-types`. The dashboard runs Node 22.)

- [ ] **Step 3: Verify it parses (dry, no env needed)**

Run: `node --experimental-strip-types --check scripts/register-discord-commands.mjs` (syntax check) and `npx tsc --noEmit` (command-defs.ts compiles).
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/discord/command-defs.ts scripts/register-discord-commands.mjs package.json
git commit -m "feat(discord): command definitions + guild registration script"
```

---

## Task 5: Command handlers

**Files:**
- Create: `lib/discord/commands/invoice.ts`, `shopee.ts`, `kalkulator.ts`, `produk.ts`, `order.ts`, `stok.ts`
- Test: `lib/discord/__tests__/commands.test.ts`

**Interfaces:**
- Consumes: `getOption` (Task 3), `rupiah` (Task 3), `parseInvoiceItems` (Task 2), `DiscordOption` (Task 3), services listed in "Verified service signatures".
- Produces: each file exports `async function handle(options: DiscordOption[] | undefined): Promise<string>` returning the reply text. For `invoice` and `shopee` and `produk`, the function is named `handleInvoiceBuat`, `handleInvoiceStatus`, `handleShopeeOrder`, `handleKalkulator`, `handleProdukCari`, `handleOrderPerluCetak`, `handleStokFilament` respectively (each takes `options: DiscordOption[] | undefined`).

- [ ] **Step 1: Write the failing test (handlers that have branching logic worth testing — invoice parse-failure path + kalkulator)**

Create `lib/discord/__tests__/commands.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/invoice/service", () => ({
  createQuotation: vi.fn(),
  getQuotationByNomor: vi.fn(),
}))
vi.mock("@/lib/kalkulator/rates", () => ({ loadRates: vi.fn() }))

import { handleInvoiceBuat, handleInvoiceStatus } from "@/lib/discord/commands/invoice"
import { handleKalkulator } from "@/lib/discord/commands/kalkulator"
import { createQuotation, getQuotationByNomor } from "@/lib/invoice/service"
import { loadRates } from "@/lib/kalkulator/rates"

const mockCreate = createQuotation as any
const mockByNomor = getQuotationByNomor as any
const mockRates = loadRates as any

describe("handleInvoiceBuat", () => {
  beforeEach(() => vi.clearAllMocks())

  it("replies with an error and does NOT create when items are malformed", async () => {
    const reply = await handleInvoiceBuat([
      { name: "buyer", value: "Budi" },
      { name: "items", value: "Keychain|2" },
    ])
    expect(reply.toLowerCase()).toContain("format")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("creates the invoice and replies with nomor + total on valid input", async () => {
    mockCreate.mockResolvedValue({ nomor: "INV-1", total: 30000 })
    const reply = await handleInvoiceBuat([
      { name: "buyer", value: "Budi" },
      { name: "items", value: "Keychain|2|15000" },
      { name: "ongkir", value: 5000 },
    ])
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const arg = mockCreate.mock.calls[0][0]
    expect(arg.buyerNama).toBe("Budi")
    expect(arg.ongkir).toBe(5000)
    expect(arg.items).toHaveLength(1)
    expect(reply).toContain("INV-1")
    expect(reply).toContain("Rp 30.000")
  })
})

describe("handleInvoiceStatus", () => {
  beforeEach(() => vi.clearAllMocks())

  it("replies not-found when nomor missing", async () => {
    mockByNomor.mockResolvedValue(null)
    const reply = await handleInvoiceStatus([{ name: "nomor", value: "INV-X" }])
    expect(reply.toLowerCase()).toContain("tidak ditemukan")
  })

  it("replies with status, total, paid, sisa", async () => {
    mockByNomor.mockResolvedValue({ nomor: "INV-1", status: "PARTIAL", total: 30000, totalPaid: 10000, sisaBayar: 20000 })
    const reply = await handleInvoiceStatus([{ name: "nomor", value: "INV-1" }])
    expect(reply).toContain("INV-1")
    expect(reply).toContain("Rp 20.000")
  })
})

describe("handleKalkulator", () => {
  beforeEach(() => vi.clearAllMocks())

  it("computes prices from gramasi/jam and replies", async () => {
    mockRates.mockResolvedValue({
      fdmHppPerGram: 300, slaHppPerGram: 800, fdmJualPerGram: 500, slaJualPerGram: 1200,
      mesinPerJam: 1000, adminEcommerce: 0.8, failureRatePct: 12, failureSpreadPct: 50,
      testLayerPct: 5, packing: {}, gantungan: {}, switchPerPcs: 0, labelPerLembar: 0,
    })
    const reply = await handleKalkulator([
      { name: "gramasi", value: 50 },
      { name: "jam", value: 2 },
      { name: "tipe", value: "FDM" },
      { name: "tier", value: "A" },
    ])
    expect(reply).toContain("HPP")
    expect(reply).toMatch(/Rp/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/discord/__tests__/commands.test.ts`
Expected: FAIL — handlers not found.

- [ ] **Step 3: Implement invoice.ts**

Create `lib/discord/commands/invoice.ts`:

```typescript
import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { parseInvoiceItems } from "../parse-items"
import { createQuotation, getQuotationByNomor } from "@/lib/invoice/service"

const BASE_URL = "https://dashboard.3dprintingbandung.my.id"

export async function handleInvoiceBuat(options: DiscordOption[] | undefined): Promise<string> {
  const buyer = String(getOption(options, "buyer") ?? "").trim()
  const itemsRaw = String(getOption(options, "items") ?? "")
  const ongkirRaw = getOption(options, "ongkir")
  if (!buyer) return "❌ Nama buyer wajib diisi."

  const parsed = parseInvoiceItems(itemsRaw)
  if (!parsed.ok) return `❌ ${parsed.error}`

  const ongkir = typeof ongkirRaw === "number" ? ongkirRaw : 0
  const inv = await createQuotation({
    buyerNama: buyer,
    ongkir,
    items: parsed.items,
  })
  return `✅ Invoice **${inv.nomor}** dibuat — total ${rupiah(inv.total)}\n${BASE_URL}/tagihan`
}

export async function handleInvoiceStatus(options: DiscordOption[] | undefined): Promise<string> {
  const nomor = String(getOption(options, "nomor") ?? "").trim()
  if (!nomor) return "❌ Nomor invoice wajib diisi."
  const inv = await getQuotationByNomor(nomor)
  if (!inv) return `❌ Invoice \`${nomor}\` tidak ditemukan.`
  return [
    `🧾 **${inv.nomor}** — ${inv.status}`,
    `Total: ${rupiah(inv.total)}`,
    `Sudah bayar: ${rupiah(inv.totalPaid)}`,
    `Sisa: ${rupiah(inv.sisaBayar)}`,
  ].join("\n")
}
```

- [ ] **Step 4: Implement shopee.ts**

Create `lib/discord/commands/shopee.ts`:

```typescript
import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"

const SELLER_ORDER_URL = "https://seller.shopee.co.id/portal/sale/order"

export async function handleShopeeOrder(options: DiscordOption[] | undefined): Promise<string> {
  const sn = String(getOption(options, "sn") ?? "").trim()
  if (!sn) return "❌ Order SN wajib diisi."

  const [details, escrow] = await Promise.all([
    getOrderDetail([sn]),
    getEscrowDetail(sn),
  ])
  const detail = details[0]
  if (!detail) return `❌ Order \`${sn}\` tidak ditemukan.`

  const itemLines = detail.item_list
    .map(i => `• ${i.item_name} ×${i.model_quantity_purchased}`)
    .join("\n")

  const lines = [
    `📦 **${detail.order_sn}** — ${detail.order_status}`,
    itemLines,
    `Total: ${rupiah(detail.total_amount)}`,
  ]
  if (escrow) {
    lines.push(`Buyer bayar: ${rupiah(escrow.buyer_payment_amount)}`)
    lines.push(`Diterima (escrow): ${rupiah(escrow.escrow_amount)}`)
  }
  lines.push(`${SELLER_ORDER_URL}/${detail.order_sn}`)
  return lines.join("\n")
}
```

- [ ] **Step 5: Implement kalkulator.ts**

Create `lib/discord/commands/kalkulator.ts`:

```typescript
import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { loadRates } from "@/lib/kalkulator/rates"
import { hitungKalkulasi } from "@/lib/kalkulator/formula"
import type { MarginTier, PrintTipe } from "@/lib/kalkulator/types"

export async function handleKalkulator(options: DiscordOption[] | undefined): Promise<string> {
  const gramasi = Number(getOption(options, "gramasi") ?? 0)
  const jam = Number(getOption(options, "jam") ?? 0)
  const tipe = (String(getOption(options, "tipe") ?? "FDM") as PrintTipe)
  const tier = (String(getOption(options, "tier") ?? "A") as MarginTier)
  if (gramasi <= 0 || jam <= 0) return "❌ Gramasi dan jam harus > 0."

  const rates = await loadRates()
  const hasil = hitungKalkulasi(
    [{ tipe, gramasi, durasiJam: jam }],
    { switchQty: 0, hasLabel: false, komponenKustom: [] },
    1,
    rates,
    tier,
  )
  return [
    `🧮 **Kalkulasi cepat** (${gramasi}g · ${jam}j · ${tipe} · tier ${tier})`,
    `HPP: ${rupiah(hasil.hppTotal)}`,
    `Floor price: ${rupiah(hasil.floorPrice)}`,
    `Harga Shopee: ${rupiah(hasil.shopeeA)}`,
    `Harga Offline: ${rupiah(hasil.offlineA)}`,
    `Margin Shopee: ${hasil.marginShopeeA}%`,
  ].join("\n")
}
```

Note: `hitungKalkulasi`'s `aksesori` parameter requires `{ switchQty, hasLabel, komponenKustom }` (packingType/gantunganType optional). Verify against `lib/kalkulator/formula.ts` AksesoriInput.

- [ ] **Step 6: Implement produk.ts**

Create `lib/discord/commands/produk.ts`:

```typescript
import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { getProductsPage } from "@/lib/products/service"

export async function handleProdukCari(options: DiscordOption[] | undefined): Promise<string> {
  const kata = String(getOption(options, "kata") ?? "").trim()
  if (!kata) return "❌ Kata kunci wajib diisi."

  const page = await getProductsPage({ page: 1, limit: 5, q: kata, status: "all" })
  if (page.products.length === 0) return `Tidak ada produk cocok untuk \`${kata}\`.`

  const lines = page.products.map(p => {
    const harga = p.priceMin === p.priceMax ? rupiah(p.priceMin) : `${rupiah(p.priceMin)}–${rupiah(p.priceMax)}`
    const hpp = p.hpp != null ? rupiah(p.hpp) : "—"
    const margin = p.grossMargin30d != null ? `${Math.round(p.grossMargin30d)}%` : "—"
    return `• **${p.name}**\n  harga ${harga} · HPP ${hpp} · margin ${margin} · stok ${p.stockTotal}`
  })
  return `🔎 Hasil untuk \`${kata}\` (${page.total} total):\n${lines.join("\n")}`
}
```

- [ ] **Step 7: Implement order.ts**

Create `lib/discord/commands/order.ts`:

```typescript
import { getReadyToShipOrders } from "@/lib/orders/service"

export async function handleOrderPerluCetak(): Promise<string> {
  const result = await getReadyToShipOrders()
  const perluCetak = result.orders.filter(o => !o.labelPrinted)
  if (perluCetak.length === 0) return "✅ Tidak ada order yang perlu dicetak."
  const lines = perluCetak.slice(0, 15).map(o =>
    `• \`${o.orderSn}\` — ${o.shopeeStatus}${o.buyerUsername ? ` · ${o.buyerUsername}` : ""}`,
  )
  const extra = perluCetak.length > 15 ? `\n…dan ${perluCetak.length - 15} lagi` : ""
  return `🖨️ ${perluCetak.length} order perlu cetak:\n${lines.join("\n")}${extra}`
}
```

- [ ] **Step 8: Implement stok.ts**

Create `lib/discord/commands/stok.ts`:

```typescript
import type { DiscordOption } from "../types"
import { getOption } from "../format"
import { listSpools } from "@/lib/filamen/spool-service"

export async function handleStokFilament(options: DiscordOption[] | undefined): Promise<string> {
  const brand = String(getOption(options, "brand") ?? "").trim().toLowerCase()
  const { spools } = await listSpools()
  const filtered = brand ? spools.filter(s => s.brand.toLowerCase().includes(brand)) : spools
  if (filtered.length === 0) return brand ? `Tidak ada spool brand \`${brand}\`.` : "Belum ada spool."

  // Group by brand+material, count non-empty
  const groups = new Map<string, number>()
  for (const s of filtered) {
    if (s.status === "empty") continue
    const key = `${s.brand} ${s.material}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const lines = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `• ${k}: ${n} spool`)
  return `🧵 Stok filament${brand ? ` (${brand})` : ""}:\n${lines.join("\n") || "semua kosong"}`
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run lib/discord/__tests__/commands.test.ts`
Expected: PASS (5 tests). Then `npx tsc --noEmit` — no errors in these files (fix any type mismatch against actual service types, e.g. `PrintTipe`/`MarginTier` exports).

- [ ] **Step 10: Commit**

```bash
git add lib/discord/commands lib/discord/__tests__/commands.test.ts
git commit -m "feat(discord): command handlers (invoice, shopee, kalkulator, produk, order, stok)"
```

---

## Task 6: Dispatch + interactions route

**Files:**
- Create: `lib/discord/dispatch.ts`, `app/api/discord/interactions/route.ts`
- Test: `lib/discord/__tests__/dispatch.test.ts`

**Interfaces:**
- Consumes: all `handle*` from Task 5; `DiscordInteraction`, `DiscordOption` (Task 3).
- Produces (dispatch.ts): `dispatchCommand(interaction: DiscordInteraction): Promise<string>` — routes by `data.name` + subcommand, returns reply text; throws `Error` for unknown command.

- [ ] **Step 1: Write the failing test**

Create `lib/discord/__tests__/dispatch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/discord/commands/invoice", () => ({
  handleInvoiceBuat: vi.fn().mockResolvedValue("BUAT_OK"),
  handleInvoiceStatus: vi.fn().mockResolvedValue("STATUS_OK"),
}))
vi.mock("@/lib/discord/commands/kalkulator", () => ({ handleKalkulator: vi.fn().mockResolvedValue("KALK_OK") }))
vi.mock("@/lib/discord/commands/shopee", () => ({ handleShopeeOrder: vi.fn() }))
vi.mock("@/lib/discord/commands/produk", () => ({ handleProdukCari: vi.fn() }))
vi.mock("@/lib/discord/commands/order", () => ({ handleOrderPerluCetak: vi.fn() }))
vi.mock("@/lib/discord/commands/stok", () => ({ handleStokFilament: vi.fn() }))

import { dispatchCommand } from "@/lib/discord/dispatch"

describe("dispatchCommand", () => {
  beforeEach(() => vi.clearAllMocks())

  it("routes invoice/buat subcommand", async () => {
    const r = await dispatchCommand({
      type: 2, token: "t",
      data: { name: "invoice", options: [{ name: "buat", options: [{ name: "buyer", value: "X" }] }] },
    } as any)
    expect(r).toBe("BUAT_OK")
  })

  it("routes top-level kalkulator", async () => {
    const r = await dispatchCommand({
      type: 2, token: "t",
      data: { name: "kalkulator", options: [{ name: "gramasi", value: 1 }] },
    } as any)
    expect(r).toBe("KALK_OK")
  })

  it("throws on unknown command", async () => {
    await expect(dispatchCommand({ type: 2, token: "t", data: { name: "nope" } } as any))
      .rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/discord/__tests__/dispatch.test.ts`
Expected: FAIL — not found.

- [ ] **Step 3: Implement dispatch.ts**

Create `lib/discord/dispatch.ts`:

```typescript
import type { DiscordInteraction, DiscordOption } from "./types"
import { handleInvoiceBuat, handleInvoiceStatus } from "./commands/invoice"
import { handleShopeeOrder } from "./commands/shopee"
import { handleKalkulator } from "./commands/kalkulator"
import { handleProdukCari } from "./commands/produk"
import { handleOrderPerluCetak } from "./commands/order"
import { handleStokFilament } from "./commands/stok"

function sub(interaction: DiscordInteraction): { name: string; options?: DiscordOption[] } | null {
  const top = interaction.data?.options?.[0]
  if (top && top.options !== undefined && (top as DiscordOption).value === undefined) {
    return { name: top.name, options: top.options }
  }
  return null
}

export async function dispatchCommand(interaction: DiscordInteraction): Promise<string> {
  const name = interaction.data?.name
  const s = sub(interaction)

  if (name === "invoice" && s?.name === "buat") return handleInvoiceBuat(s.options)
  if (name === "invoice" && s?.name === "status") return handleInvoiceStatus(s.options)
  if (name === "shopee" && s?.name === "order") return handleShopeeOrder(s.options)
  if (name === "produk" && s?.name === "cari") return handleProdukCari(s.options)
  if (name === "order" && s?.name === "perlu-cetak") return handleOrderPerluCetak()
  if (name === "stok" && s?.name === "filament") return handleStokFilament(s.options)
  if (name === "kalkulator") return handleKalkulator(interaction.data?.options)

  throw new Error(`Unknown command: ${name}${s ? ` ${s.name}` : ""}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/discord/__tests__/dispatch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the route**

Create `app/api/discord/interactions/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { verifyDiscordSignature } from "@/lib/discord/verify"
import { INTERACTION_TYPE } from "@/lib/discord/types"
import type { DiscordInteraction } from "@/lib/discord/types"
import { pong, ephemeralMessage, deferredEphemeral, followUp } from "@/lib/discord/respond"
import { dispatchCommand } from "@/lib/discord/dispatch"

function allowed(interaction: DiscordInteraction): boolean {
  const guildOk = !process.env.DISCORD_GUILD_ID || interaction.guild_id === process.env.DISCORD_GUILD_ID
  const userId = interaction.member?.user?.id ?? interaction.user?.id
  const allowList = (process.env.DISCORD_ALLOWED_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean)
  const userOk = allowList.length === 0 || (userId != null && allowList.includes(userId))
  return guildOk && userOk
}

export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const signature = req.headers.get("x-signature-ed25519")
  const timestamp = req.headers.get("x-signature-timestamp")
  const rawBody = await req.text()

  if (!publicKey || !signature || !timestamp || !verifyDiscordSignature(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse("invalid request signature", { status: 401 })
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction

  if (interaction.type === INTERACTION_TYPE.PING) {
    return NextResponse.json(pong())
  }

  if (interaction.type !== INTERACTION_TYPE.APPLICATION_COMMAND) {
    return NextResponse.json(ephemeralMessage("Tidak didukung."))
  }

  if (!allowed(interaction)) {
    return NextResponse.json(ephemeralMessage("⛔ Kamu tidak diizinkan memakai bot ini."))
  }

  const appId = interaction.application_id ?? process.env.DISCORD_APP_ID ?? ""
  const token = interaction.token

  // Defer, then do the work and PATCH the follow-up. Do NOT await the work
  // before returning — the node server stays alive to finish it.
  void (async () => {
    try {
      const reply = await dispatchCommand(interaction)
      await followUp(appId, token, reply)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan."
      await followUp(appId, token, `❌ ${msg}`)
    }
  })()

  return NextResponse.json(deferredEphemeral())
}
```

- [ ] **Step 6: Verify build/typecheck**

Run: `npx tsc --noEmit` — no errors in the route/dispatch.
Run: `npx vitest run lib/discord/` — all discord tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/discord/dispatch.ts "app/api/discord/interactions/route.ts" lib/discord/__tests__/dispatch.test.ts
git commit -m "feat(discord): dispatch + signed interactions route with defer/follow-up"
```

---

## Task 7: getQuotationByNomor service helper

**Files:**
- Modify: `lib/invoice/service.ts`
- Test: extend `lib/invoice/__tests__/...` if one exists, else add `lib/__tests__/invoice/by-nomor.test.ts`

**Interfaces:**
- Produces: `getQuotationByNomor(nomor: string): Promise<QuotationData | null>` — used by `handleInvoiceStatus` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/invoice/by-nomor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: { quotation: { findUnique: vi.fn(), findFirst: vi.fn() } },
}))

import { prisma } from "@/lib/db"
import { getQuotationByNomor } from "@/lib/invoice/service"

const mock = prisma as any

describe("getQuotationByNomor", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when not found", async () => {
    mock.quotation.findFirst.mockResolvedValue(null)
    expect(await getQuotationByNomor("INV-X")).toBeNull()
  })

  it("queries by nomor", async () => {
    mock.quotation.findFirst.mockResolvedValue(null)
    await getQuotationByNomor("INV-1")
    expect(mock.quotation.findFirst.mock.calls[0][0].where.nomor).toBe("INV-1")
  })
})
```

Note: verify the actual Prisma model accessor name used in `lib/invoice/service.ts` (`prisma.quotation`) and how `getQuotation` shapes its return; reuse the same serializer so `getQuotationByNomor` returns an identical `QuotationData` shape (DRY — find the id, then delegate to the existing `getQuotation(id)`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/invoice/by-nomor.test.ts`
Expected: FAIL — `getQuotationByNomor` not exported.

- [ ] **Step 3: Implement**

In `lib/invoice/service.ts`, add (reuse the existing `getQuotation(id)` to avoid duplicating the serializer):

```typescript
export async function getQuotationByNomor(nomor: string): Promise<QuotationData | null> {
  const row = await prisma.quotation.findFirst({ where: { nomor }, select: { id: true } })
  if (!row) return null
  return getQuotation(row.id)
}
```

(Adjust `prisma.quotation` to the actual model accessor if different.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/invoice/by-nomor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/invoice/service.ts lib/__tests__/invoice/by-nomor.test.ts
git commit -m "feat(invoice): getQuotationByNomor helper for Discord status command"
```

---

## Task 8: Settings status card

**Files:**
- Create: `app/api/settings/discord-status/route.ts`, `components/settings/DiscordStatusCard.tsx`
- Modify: `lib/hooks/use-settings.ts` (add `useDiscordStatus`), `app/(dashboard)/settings/page.tsx` (render card)

**Interfaces:**
- Consumes: nothing from prior tasks (independent surface).
- Produces: `GET /api/settings/discord-status` → `{ configured: boolean; endpointUrl: string; guildId: string | null; commands: { name: string }[] | null }`.

- [ ] **Step 1: Implement the status API**

Create `app/api/settings/discord-status/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const appId = process.env.DISCORD_APP_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID ?? null
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const configured = Boolean(appId && botToken && guildId && publicKey)

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://dashboard.3dprintingbandung.my.id"
  const endpointUrl = `${base}/api/discord/interactions`

  let commands: { name: string }[] | null = null
  if (configured) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
        { headers: { Authorization: `Bot ${botToken}` } },
      )
      if (res.ok) {
        const list = await res.json() as { name: string }[]
        commands = list.map(c => ({ name: c.name }))
      }
    } catch { /* leave commands null on fetch failure */ }
  }

  return NextResponse.json({ configured, endpointUrl, guildId, commands })
}
```

Note: if `NEXT_PUBLIC_BASE_URL` is not an existing env var, hardcode the dashboard URL string `https://dashboard.3dprintingbandung.my.id` directly and drop the env read.

- [ ] **Step 2: Add the hook**

In `lib/hooks/use-settings.ts`, add:

```typescript
export function useDiscordStatus() {
  return useQuery({
    queryKey: ["settings", "discord-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/discord-status")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{
        configured: boolean
        endpointUrl: string
        guildId: string | null
        commands: { name: string }[] | null
      }>
    },
    staleTime: 60_000,
  })
}
```

(Match the existing import style in `use-settings.ts` — it already imports `useQuery` from `@tanstack/react-query`; if not, add the import.)

- [ ] **Step 3: Implement the card**

Create `components/settings/DiscordStatusCard.tsx`:

```typescript
"use client"

import { useDiscordStatus } from "@/lib/hooks/use-settings"

export function DiscordStatusCard() {
  const { data, isLoading } = useDiscordStatus()

  return (
    <div className="rounded-[16px] p-5 space-y-3 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🤖 Discord Bot</div>
        <div className="text-xs mt-0.5 g-t4">Status koneksi & command terdaftar (read-only)</div>
      </div>

      {isLoading ? (
        <div className="text-sm g-t4">Memuat...</div>
      ) : !data ? (
        <div className="text-sm g-t4">Gagal memuat status.</div>
      ) : (
        <div className="space-y-2 text-sm">
          <div>
            Status:{" "}
            {data.configured
              ? <span style={{ color: "#34d399" }}>✓ Terkonfigurasi</span>
              : <span style={{ color: "#f87171" }}>✗ Belum (set env DISCORD_*)</span>}
          </div>
          <div className="g-t4 text-xs">
            Interactions Endpoint URL (paste ke Discord Developer Portal):
            <div className="font-mono text-[11px] mt-1 p-2 rounded-[8px]" style={{ background: "var(--g-inner)" }}>
              {data.endpointUrl}
            </div>
          </div>
          {data.guildId && <div className="g-t4 text-xs">Guild ID: <span className="font-mono">{data.guildId}</span></div>}
          <div className="g-t4 text-xs">
            Command terdaftar:{" "}
            {data.commands == null
              ? "—"
              : data.commands.length === 0
                ? "belum ada — jalankan `npm run discord:register`"
                : data.commands.map(c => `/${c.name}`).join(", ")}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Render the card on the Settings page**

In `app/(dashboard)/settings/page.tsx`, import `DiscordStatusCard` and render it alongside the existing cards (e.g. near `InvoiceMethodsCard`). Match the existing layout/grid usage in that file.

```typescript
import { DiscordStatusCard } from "@/components/settings/DiscordStatusCard"
// ...in the JSX, in the same grid/stack as other settings cards:
<DiscordStatusCard />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/api/settings/discord-status/route.ts" components/settings/DiscordStatusCard.tsx lib/hooks/use-settings.ts "app/(dashboard)/settings/page.tsx"
git commit -m "feat(discord): read-only status card in Settings"
```

---

## Task 9: Env wiring, setup docs, deploy

**Files:**
- Modify: `deploy.sh` (pass 5 Discord env vars to the container)
- Create: `docs/discord-bot-setup.md`

- [ ] **Step 1: Pass env vars in deploy.sh**

In `deploy.sh`, in the `docker run` for `shopee-dashboard`, add the env flags (mirror the existing `-e` lines):

```bash
  -e DISCORD_PUBLIC_KEY="${DISCORD_PUBLIC_KEY:-}" \
  -e DISCORD_APP_ID="${DISCORD_APP_ID:-}" \
  -e DISCORD_BOT_TOKEN="${DISCORD_BOT_TOKEN:-}" \
  -e DISCORD_GUILD_ID="${DISCORD_GUILD_ID:-}" \
  -e DISCORD_ALLOWED_USER_IDS="${DISCORD_ALLOWED_USER_IDS:-}" \
```

- [ ] **Step 2: Write the setup runbook**

Create `docs/discord-bot-setup.md` with the concrete steps:

```markdown
# Discord Bot Setup

1. Discord Developer Portal → New Application. Copy **Application ID** and **Public Key** (General Information).
2. Bot tab → Reset Token → copy **Bot Token**.
3. Set env (host shell / deploy env):
   - `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`
   - `DISCORD_GUILD_ID` (right-click your server → Copy Server ID; enable Developer Mode first)
   - `DISCORD_ALLOWED_USER_IDS` (comma-separated; right-click your user → Copy User ID)
4. Register commands: `npm run discord:register` (needs APP_ID, BOT_TOKEN, GUILD_ID in env).
5. Invite bot: OAuth2 → URL Generator → scopes `applications.commands` (+ `bot`) → open URL → add to your server.
6. Set **Interactions Endpoint URL** (General Information) to `https://dashboard.3dprintingbandung.my.id/api/discord/interactions`. Discord sends a PING — it must verify ✓ (requires DISCORD_PUBLIC_KEY deployed).
7. In Settings → Discord Bot card, confirm "Terkonfigurasi ✓" and the command list.
```

- [ ] **Step 3: Full verification**

Run: `npm test` (all pass) and `npx tsc --noEmit` (clean).

- [ ] **Step 4: Commit**

```bash
git add deploy.sh docs/discord-bot-setup.md
git commit -m "chore(discord): env wiring in deploy.sh + setup runbook"
```

- [ ] **Step 5: Deploy** (after operator has set the env vars on the deploy host)

Run: `bash deploy.sh`
Then set the Interactions Endpoint URL in the Discord portal and run `npm run discord:register`. Smoke test: in Discord, `/kalkulator gramasi:50 jam:2` → expect an ephemeral reply with prices.
