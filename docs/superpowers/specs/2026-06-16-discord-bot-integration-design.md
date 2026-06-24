# Discord Bot Integration — Design

**Date:** 2026-06-16
**Status:** Approved (pending spec review)

## Goal

Expose key dashboard operations as Discord slash commands for internal/operator use, so daily ops (create invoice, look up a Shopee order, quick price calc, find a product, check print queue and filament stock) can be done from Discord without opening the dashboard.

## Decisions (from brainstorming)

- **Internal-only** — single operator / small team server. No customer/public commands.
- **Transport: HTTP interactions webhook into the dashboard.** Discord posts signed slash interactions to a Next.js route in the dashboard; the handler calls existing `lib/*` service functions directly. No separate bot process, no internal token API layer (the session-auth problem is bypassed because handlers run in-process).
- **Settings: read-only status card.** Secrets live in env; the card shows connection/registration status only.
- **/kalkulator: quick single-plate calc** (flat options), not saved-kalkulasi lookup.
- **/invoice buat items: parsed from a string** `nama|qty|harga; nama|qty|harga`.

## Architecture

```
Discord ──(slash interaction, ed25519-signed)──▶ POST /api/discord/interactions  (dashboard)
                                                     │ 1. verify ed25519 signature (401 if bad)
                                                     │ 2. PING(type 1) → PONG(type 1)
                                                     │ 3. access check: guild_id ∈ allowed AND user id ∈ allowlist
                                                     │ 4. dispatch by command/subcommand
                                                     ▼
                                              lib/discord/commands/* → call lib/* services directly
                                              (createQuotation, getQuotation, getEscrowDetail,
                                               hitungKalkulasi, getProductsPage, listSpools, …)
```

### Access control
- Reject (HTTP 401) if the ed25519 signature is invalid or headers missing.
- After signature passes: if `guild_id` ∉ `DISCORD_GUILD_ID` set OR invoking user id ∉ `DISCORD_ALLOWED_USER_IDS`, reply ephemeral "Tidak diizinkan" (interaction response type 4, flag 64) and do not execute.

### Deferred responses
Commands that may exceed Discord's 3s ACK window (invoice buat, shopee order, produk cari) use:
1. Return deferred response (type 5, ephemeral flag 64) immediately from the route.
2. Kick off the work WITHOUT awaiting before returning (the dashboard node server stays alive), then `PATCH /webhooks/{appId}/{interactionToken}/messages/@original` with the result.
3. On error after defer, PATCH with a clear error message.

Fast commands (kalkulator) may reply directly (type 4).

All replies are **ephemeral** (flag 64) — responses contain internal pricing/HPP/escrow data.

### Secrets (env, added to deploy.sh)
- `DISCORD_PUBLIC_KEY` — ed25519 verification
- `DISCORD_APP_ID` — command registration + follow-up webhook
- `DISCORD_BOT_TOKEN` — command registration + reading registered commands for the status card
- `DISCORD_GUILD_ID` — guild-scoped registration + access check
- `DISCORD_ALLOWED_USER_IDS` — comma-separated Discord user IDs allowed to invoke

## Commands

Discord names are single lowercase tokens (`^[-_\p{L}\p{N}]{1,32}$`); the "space" in display is the parent→subcommand separator.

| Display | Command / sub | Options | Reply |
|---|---|---|---|
| `/invoice buat` | invoice / buat | `buyer` (string, req), `items` (string, req), `ongkir` (int, opt) | Nomor invoice + link + total |
| `/invoice status` | invoice / status | `nomor` (string, req) | Status, total, sudah bayar, sisa |
| `/shopee order` | shopee / order | `sn` (string, req) | Status, item, buyer paid, diterima (escrow), link order Shopee |
| `/kalkulator` | kalkulator | `gramasi` (number, req), `jam` (number, req), `tipe` (choice FDM/SLA), `tier` (choice A/B/C) | HPP, floor price, harga shopee/offline, margin |
| `/produk cari` | produk / cari | `kata` (string, req) | Top N hasil: nama, harga, HPP, margin, stok |
| `/order perlu-cetak` | order / perlu-cetak | — | List order siap cetak |
| `/stok filament` | stok / filament | `brand` (string, opt) | Spool per brand/material + jumlah |

### `/invoice buat` items parsing
- Format: `nama|qty|harga` per item, items separated by `;`. Example: `Keychain|2|15000; Stand|1|50000`.
- Parser trims whitespace, validates qty/harga are positive numbers. On any malformed item → reply ephemeral with the expected format and which item failed; do NOT create a partial invoice.
- Creates the invoice (status DRAFT) via the existing invoice-create service; reply includes nomor, total, and a link to the invoice list page (`https://dashboard.3dprintingbandung.my.id/tagihan`) where the operator opens/finishes it. (Exact service function name and any deep-link to the specific invoice pinned during planning against `lib/invoice`.)

### `/shopee order` link
- Includes a link to the order in Shopee Seller Center. Exact URL format verified during implementation (Seller Center order detail).

## Settings status card (read-only)

- New component `components/settings/DiscordStatusCard.tsx` rendered on the Settings page.
- New session-gated API `GET /api/settings/discord-status` returns:
  - `configured`: whether `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` are all set
  - `endpointUrl`: the interactions endpoint to paste into the Discord portal
  - `guildId`
  - `commands`: list of registered commands fetched live from Discord (`GET /applications/{appId}/guilds/{guildId}/commands` using bot token); empty/`null` if not configured or fetch fails
- Card shows: configured ✓/✗, the endpoint URL (copyable), guild id, and the registered command list (or "belum terdaftar — jalankan script registrasi"). No secrets shown, no mutations.

## Command registration

- `scripts/register-discord-commands.mjs` — one-shot Node script. Reads `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` from env; `PUT /applications/{appId}/guilds/{guildId}/commands` with the full command definitions (guild-scoped = instant). The command definitions live in a shared module `lib/discord/command-defs.ts` so the route's dispatch and the registration script use one source of truth (DRY).

## File structure

- `app/api/discord/interactions/route.ts` — verify signature, PING/PONG, access check, dispatch
- `lib/discord/verify.ts` — ed25519 signature verification (tweetnacl)
- `lib/discord/respond.ts` — helpers: deferred reply, ephemeral reply, follow-up PATCH to `@original`
- `lib/discord/command-defs.ts` — slash command definitions (single source for route + registration)
- `lib/discord/format.ts` — rupiah/number + reply text builders
- `lib/discord/parse-items.ts` — `/invoice buat` items parser (pure, unit-tested)
- `lib/discord/commands/invoice.ts` · `shopee.ts` · `kalkulator.ts` · `produk.ts` · `order.ts` · `stok.ts` — thin handlers calling existing `lib/*` services
- `app/api/settings/discord-status/route.ts` — status for the card
- `components/settings/DiscordStatusCard.tsx` + hook in `lib/hooks/use-settings` (or use-cms pattern)
- `scripts/register-discord-commands.mjs` — registration
- `docs/discord-bot-setup.md` — step-by-step setup (Developer Portal, endpoint URL, env, register, invite)

## Dependencies

- `tweetnacl` (ed25519 verification) — add to package.json. (Avoid heavier `discord.js`; we only need verification + REST calls via fetch.)

## Error handling

- Invalid/missing signature → 401 (Discord requires this to verify the endpoint).
- Disallowed guild/user → ephemeral "tidak diizinkan", no execution.
- Malformed `items`, invoice/order not found, service throw → ephemeral error message (PATCH after defer for slow commands). Never crash the route; always return a valid interaction response.
- Discord follow-up PATCH failure → logged server-side; nothing else to do.

## Testing

- Unit (vitest): `parse-items` (valid + each malformed case), `format` rupiah/builders, `verify` (valid signature passes, tampered fails).
- Handlers are thin adapters over already-tested `lib/*` services; test the adapter logic (parse → call service → format) where it has real branching (invoice parse failure path, not-found paths). No need to re-test the underlying services.

## Out of scope (YAGNI)

- Customer/public commands, role-based per-command permissions (single allowlist suffices).
- Saved-kalkulasi lookup, modal-based invoice input, editing invoices/orders from Discord.
- Separate bot process / gateway features (presence, reactions, message commands).
- Mutations from the status card.
