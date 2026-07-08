# Bot Data API — Design

**Date:** 2026-06-16
**Status:** Approved (pending spec review)

## Goal

Expose the dashboard's operations as token-authenticated JSON HTTP endpoints under `/api/bot/*` so an **external Discord bot** (a separate process, run/managed in another session) can call them. The bot owns all Discord presentation; the dashboard returns raw data.

## Context & pivot

An earlier iteration built the bot as an in-dashboard Discord **interactions webhook** (`/api/discord/interactions` + text-reply handlers). That approach is now abandoned: the bot will run as a separate process calling data APIs. This spec **removes the webhook** and replaces it with a token-authed JSON API. The endpoints call the same underlying `lib/*` services the webhook handlers called (DRY) — only auth and response shape change.

## Decisions (from brainstorming)

- **Remove the interactions webhook entirely** (keep only reusable service helpers).
- **Namespace `/api/bot/*`**, separate from session-gated internal APIs and from `/api/v1/*` (Spoolman).
- **JSON responses** (bot formats the Discord messages).
- **Single bearer token** `BOT_API_TOKEN` (env), mirroring the `STL_SERVICE_TOKEN` pattern.
- **Invoice accepts structured `items`** (array), not a delimited string — clean JSON contract; string parsing is the bot's concern.

## Architecture

```
External bot process ──(HTTPS + Authorization: Bearer BOT_API_TOKEN)──▶ /api/bot/* (dashboard)
                                                                          │ requireBotToken → 401 if bad
                                                                          ▼
                                                                    existing lib/* services
                                                                    (createQuotation, getQuotationByNomor,
                                                                     getOrderDetail, getEscrowDetail,
                                                                     loadRates+hitungKalkulasi,
                                                                     getProductsPage, getReadyToShipOrders,
                                                                     listSpools)
                                                                          ▼
                                                                    JSON response
```

### Auth
- `lib/bot/auth.ts` → `requireBotToken(req: NextRequest): boolean`. Reads `process.env.BOT_API_TOKEN` at request time. Compares the `Authorization: Bearer <token>` header against it with a constant-time comparison. Returns false (→ route returns 401) if the header is missing, malformed, or mismatched. If `BOT_API_TOKEN` is unset on the server, treat every request as unauthorized (401) — never allow open access.
- Each route calls it first: `if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`.

### Endpoints

All under `app/api/bot/`. All require the bearer token.

| Method & path | Input | Response JSON (200) |
|---|---|---|
| `POST /api/bot/invoice` | body `{ buyer: string, items: {namaProduk,qty,hargaPerUnit}[], ongkir?: number }` | `{ nomor, total, url }` |
| `GET /api/bot/invoice/[nomor]` | path `nomor` | `{ nomor, status, total, totalPaid, sisaBayar }` |
| `GET /api/bot/shopee/order/[sn]` | path `sn` | `{ orderSn, status, items: {name,qty}[], total, buyerPaid, received, url }` |
| `POST /api/bot/kalkulator` | body `{ gramasi: number, jam: number, tipe?: "FDM"\|"SLA", tier?: "A"\|"B"\|"C" }` | `{ hppTotal, floorPrice, shopeeA, offlineA, marginShopeeA }` |
| `GET /api/bot/produk` | query `?q=` | `{ products: {name,priceMin,priceMax,hpp,margin,stock}[], total }` |
| `GET /api/bot/order/perlu-cetak` | — | `{ orders: {orderSn,status,buyer}[], count }` |
| `GET /api/bot/stok/filament` | query `?brand=` | `{ groups: {key,count}[] }` |

Notes:
- `url` fields: invoice → `https://dashboard.3dprintingbandung.my.id/tagihan`; shopee order → `https://seller.shopee.co.id/portal/sale/order/{sn}`.
- shopee order: `buyerPaid`/`received` come from `getEscrowDetail`; if escrow is null, return them as `null` (order still returns with status/items/total).
- kalkulator: single-plate, defaults `tipe="FDM"`, `tier="A"`; builds one `PlateInput` `{tipe,gramasi,durasiJam}` and calls `loadRates()`+`hitungKalkulasi`.
- produk: `getProductsPage({page:1, limit:5, q, status:"all"})`; `margin` = `grossMargin30d` (may be null), `hpp` may be null.
- stok filament: `listSpools()`, filter by `brand` substring (case-insensitive) when given, group by `brand + " " + material` excluding `status==="empty"`, `count` = spools per group.

### Removed (webhook teardown)
Delete: `app/api/discord/interactions/route.ts`; `lib/discord/` entirely (`verify.ts`, `types.ts`, `format.ts`, `respond.ts`, `parse-items.ts`, `command-defs.ts`, `dispatch.ts`, `commands/*`, `__tests__/*`); `scripts/register-discord-commands.mjs`; `components/settings/DiscordStatusCard.tsx`; the `useDiscordStatus` hook in `lib/hooks/use-settings.ts`; `app/api/settings/discord-status/route.ts`; the `<DiscordStatusCard />` render in `app/(dashboard)/settings/page.tsx`; the `docs/discord-bot-setup.md`; the 5 `DISCORD_*` env lines in `deploy.sh`; and `tweetnacl` from package.json (only the webhook used it).

**Kept:** `getQuotationByNomor` in `lib/invoice/service.ts` — a genuine service helper reused by `GET /api/bot/invoice/[nomor]`.

## Error handling
- Missing/invalid bearer token → 401 `{error:"Unauthorized"}`.
- Invoice: missing `buyer` or empty `items`, or an item missing `namaProduk`/`qty`/`hargaPerUnit` or with non-positive qty/harga → 400 `{error}` with a clear message; do not create a partial invoice.
- Not found (invoice nomor, shopee order sn) → 404 `{error}`.
- Bad kalkulator input (gramasi/jam ≤ 0) → 400.
- Service throw → 500 `{error}`.

## Testing
- `lib/bot/__tests__/auth.test.ts`: `requireBotToken` — valid token true; missing header false; wrong token false; unset env false.
- Per-route tests (Vitest, mock the underlying service): success shape + 401 on bad token + the 400/404 branch where it exists (invoice bad-body, invoice-nomor not found, shopee sn not found).

## Deployment
- `deploy.sh`: add `-e BOT_API_TOKEN="${BOT_API_TOKEN:-}"` to the shopee-dashboard container.
- `docs/bot-api.md`: endpoint reference + `curl` examples (with the Bearer header) for whoever builds the external bot.

## Out of scope (YAGNI)
- Per-endpoint scopes / multiple tokens (single token suffices for internal use).
- Rate limiting, pagination beyond produk's top-5, write endpoints beyond invoice-create.
- Rebuilding any Discord-side logic here (bot lives elsewhere).
