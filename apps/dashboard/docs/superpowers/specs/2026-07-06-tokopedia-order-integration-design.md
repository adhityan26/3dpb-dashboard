# Tokopedia Order Integration — Design

**Date:** 2026-07-06
**Status:** Approved (pending spec review)

## Goal

Add Tokopedia order visibility to the dashboard (a "Tokopedia" channel in the Order tab + a session-management card in Settings) and expose read-only bot endpoints, all backed by a cookie-session integration with Tokopedia Seller Center (TikTok OEC backend). The dashboard manages the session; the bot only consumes orders.

## Background & external validation

Tokopedia Seller Center runs on the TikTok OEC backend. An **official** API exists but only via TikTok Shop Partner Center, requiring ISV onboarding, app registration, and approval — too heavy for a single-seller homelab, and the legacy Tokopedia Open API is being terminated. The pragmatic path is to replay authenticated browser requests using exported cookies (per `~/Downloads/tokopedia-seller-api-guide.md`). This is a reverse-engineered internal endpoint with **no stability contract** — the design is deliberately defensive: clear session management, honest failure detection, no aggressive polling.

Sources: TikTok Shop Partner (Tokopedia integration one-pager), "Tokopedia Open API Termination", Tokopedia Partner Seller API overview.

## Key decisions (from brainstorming)

- **Session managed in the dashboard only.** Cookies are pasted in Settings (session-gated). The bot has no session-management endpoints — it consumes orders with the stored session and, if the session is dead, returns a `SESSION_INVALID` error for the operator to fix from the dashboard.
- **Store session in the `Config` table** (key `tokopedia.session`), mirroring the `invoice.bankAccount` pattern. Cookie values are never returned to any client — only metadata.
- **One service layer, two output shapes (DRY):** the dashboard routes parse the raw Tokopedia response into a typed `TokopediaOrderSummary` server-side (consistent with the Shopee pattern); the bot routes return the raw Tokopedia `data` untouched (per the guide's passthrough contract). Parsing logic lives in exactly one place (`lib/tokopedia/parse.ts`) and the status map is one constant.
- **Two-layer session status:** cheap JWT `exp` decode always; an on-demand live probe (`count: 1` request) to catch sessions killed by IP rotation after a power outage, which JWT decode cannot detect.
- **Scope:** "Perlu Dikirim" tab + "Semua" tab + search-by-order-ID. No "Dibatalkan" (not available in this endpoint). No auto-refresh, no polling notifier.

## Architecture

```
Browser (login seller-id.tokopedia.com) → EditThisCookies export (array of {name,value,...})
        │  paste JSON  ▼
Settings card → POST /api/tokopedia/session (session-gated)
        ▼
Config row  key="tokopedia.session"  value=JSON{ cookies:{name:value}, sellerId, appId, userAgent?, updatedAt, tokenExpiry }
        ▼
lib/tokopedia/client.ts  tokopediaRequest(body)   ← the only place that builds the cookie string + headers and detects code 10000
   ├─ lib/tokopedia/session.ts  saveSession / getSessionStatus / getRawSession
   ├─ lib/tokopedia/orders.ts   listPerluDikirim / getOrderById  → returns RAW Tokopedia data
   └─ lib/tokopedia/parse.ts    parseOrder(raw) → TokopediaOrderSummary   (dashboard only)
        ▼
┌─ Dashboard routes (session-gated) → parse → typed summary
└─ Bot routes /api/bot/tokopedia/* (bearer BOT_API_TOKEN) → raw passthrough (no parse, no session mgmt)
```

## Components

### `lib/tokopedia/client.ts`
- `tokopediaRequest<T>(body: object): Promise<T>` — reads the session from Config; if missing → throw `TokopediaError("SESSION_MISSING")`. Builds the cookie header (`name=value; ...`) and the required headers (accept, content-type, origin, referer, user-agent from stored session or a default Chrome UA). POSTs to `https://seller-id.tokopedia.com/api/fulfillment/order/list?aid={appId}&locale=id-ID&oec_seller_id={sellerId}&seller_id={sellerId}`. On response `code === 10000` → throw `TokopediaError("SESSION_INVALID")`. On other non-zero `code` → throw `TokopediaError` with the raw message. Returns `json.data`.
- `class TokopediaError extends Error { code: "SESSION_MISSING"|"SESSION_INVALID"|"SESSION_EXPIRED"|"NOT_FOUND"|"UNKNOWN" }`.

### `lib/tokopedia/session.ts`
- `saveSession(cookies: {name:string;value:string}[]): Promise<SessionMeta>` — flattens the array to `{name:value}`, extracts `oec_seller_id_unified_seller_env`→sellerId and `app_id_unified_seller_env`→appId, decodes `SELLER_TOKEN` JWT payload for `exp`→tokenExpiry, upserts the Config row, returns metadata. Throws if `SELLER_TOKEN` or the seller-id cookie is absent.
- `getSessionStatus(): Promise<{ exists, sellerId, updatedAt, tokenExpiry, expired }>` — reads Config; `expired = tokenExpiry != null && tokenExpiry < now`. No network call. `{ exists:false }` when no row.
- `getRawSession()` — internal helper returning the stored `{cookies, sellerId, appId, userAgent}` for the client; not exported to routes.
- `decodeJwtExp(token): number | null` — base64-decode the JWT payload, return `exp` (seconds) or null.

### `lib/tokopedia/orders.ts`
- `listOrders(tab: "perlu-dikirim" | "semua", opts?: { count?; offset? }): Promise<TokopediaRawData>` — builds the request body. For `perlu-dikirim`: `order_status.value=["1"]`, `search_tab.value=["101"]`, `sort_info="11"`. For `semua`: omit the `order_status`/`search_tab` filters (guide: non-"1" values return all history). Calls `tokopediaRequest`.
- `getOrderById(id: string): Promise<TokopediaRawOrder | null>` — body with `main_order_id.value=[id]`, `count:1`. Returns the single order object from `data.main_orders[0]`, or `null` when `main_orders` is empty (→ the caller maps to NOT_FOUND).

### `lib/tokopedia/parse.ts` (dashboard only — single source of parsing truth)
- `SKU_DISPLAY_STATUS: Record<number,string>` — `{110:"Perlu Dikirim",120:"Dikirim",121:"Dikirim",130:"Dikirim",140:"Selesai"}`.
- `parseOrder(raw: TokopediaRawOrder): TokopediaOrderSummary` — maps modules to the summary shape; unknown status codes → `statusLabel:"Tidak diketahui"`; `price_val` strings → numbers; missing tracking → null.
- `TokopediaOrderSummary`: `{ orderId, statusCode, statusLabel, products:[{name,variant,qty,totalPrice}], courier, serviceType, trackingNo, latestLogistic:{msg,timestamp}|null, grandTotal, subTotal, buyerNickname, latestRtsTime, note }`.

### Routes — Dashboard (session-gated via `auth()`)
- `POST /api/tokopedia/session` — body `{cookies:[...]}` → `saveSession` → 200 `{ok:true, sellerId, updatedAt, tokenExpiry}`; 400 on malformed.
- `GET /api/tokopedia/session` — `getSessionStatus()`.
- `POST /api/tokopedia/session/test` — live probe: `listOrders("perlu-dikirim",{count:1})` in try/catch → `{ok:true}` or `{ok:false, error:<code>}`.
- `GET /api/tokopedia/orders?tab=perlu-dikirim|semua` — `listOrders` → `data.main_orders.map(parseOrder)` → `{orders, totalCount}`. Session errors → HTTP 409 `{error:<code>}`.
- `GET /api/tokopedia/orders/[id]` — `getOrderById` → `parseOrder` or 404.

### Routes — Bot (`requireBotToken`, raw passthrough)
- `GET /api/bot/tokopedia/orders?tab=` — `{ok:true, data:<raw>}`; session error → `{ok:false, error:"SESSION_INVALID"|"SESSION_MISSING"}`.
- `GET /api/bot/tokopedia/orders/[id]` — `{ok:true, data:<raw order>}` or `{ok:false, error:"not_found"}` or session error.

### UI
- **Order tab → new `"tokopedia"` channel** in `OrderSidebar` (`OrderChannel` union) + a `TokopediaOrderView` in `app/(dashboard)/order/page.tsx`: sub-tabs "Perlu Dikirim"/"Semua", an order-ID search box, a reusable table (mirroring `LgOrderTable`), row → detail (products, courier+tracking, latest logistics update, totals). A warning banner when the session status is invalid/expired, linking to Settings.
- **Settings → `TokopediaSessionCard`** (mirrors the bank/QRIS cards): JSON textarea to paste cookies, Save button, "Test koneksi" button, and a read-only status line (sellerId, updatedAt, tokenExpiry, status badge). Never renders cookie values.

## Error taxonomy

`code 10000` is ambiguous (expired OR IP-mismatch) — reported as `SESSION_INVALID` with a message advising to check both; we do not pretend to distinguish them.

| Condition | Error code | Dashboard HTTP | Bot body |
|---|---|---|---|
| No Config row | `SESSION_MISSING` | 409 | `{ok:false,error:"SESSION_MISSING"}` |
| Tokopedia `code 10000` | `SESSION_INVALID` | 409 | `{ok:false,error:"SESSION_INVALID"}` |
| JWT `exp` past | `SESSION_EXPIRED` | 409 | (surfaced via session GET; requests still attempt and usually return `SESSION_INVALID`) |
| `main_orders` empty on ID lookup | `not_found` | 404 | `{ok:false,error:"not_found"}` |
| Network/other | raw message | 500 | `{ok:false,error:<msg>}` |
| Unauthenticated (dashboard) | — | 401 | — |
| Bad/absent bearer (bot) | — | — | 401 |

## Testing

- `parse.ts`: raw fixture → summary; unknown status code → "Tidak diketahui"; `price_val` string→number; empty tracking → null; multi-product order.
- `session.ts`: `decodeJwtExp` on a known token; `saveSession` extracts sellerId/appId/expiry and throws when `SELLER_TOKEN` missing; `getSessionStatus` expired/not-expired/absent.
- `client.ts`: `code 10000` → `SESSION_INVALID`; missing session → `SESSION_MISSING`; success returns `data` (fetch mocked).
- Route tests (service mocked): dashboard orders success + 409 on session error + 404 on not-found; bot raw passthrough + auth 401 + session error body.

## Security

- Cookies stored in `Config` (homelab Postgres); never returned to any client (session GET returns only metadata). Save endpoint is session-gated. Bot endpoints are read-only and cannot touch the session. `userAgent` stored alongside the session (when present in the export) so the request fingerprint matches the browser that produced the cookies.

## Out of scope (YAGNI)

- Automatic session refresh (impossible — manual re-login required).
- A polling notifier for new Tokopedia orders (reverse-engineered endpoint + anti-bot risk; revisit later with backoff if needed).
- "Dibatalkan" orders (not exposed by this endpoint).
- Unmasking buyer names (always masked by Tokopedia).
- Shipping/label actions — read-only for now.
