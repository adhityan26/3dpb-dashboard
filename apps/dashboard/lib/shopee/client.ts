import crypto from "crypto"
import { prisma } from "@/lib/db"

const BASE_URL =
  process.env.SHOPEE_BASE_URL ?? "https://partner.shopeemobile.com"

// Shopee uses these error codes for invalid/expired tokens.
// Note: "invalid_acceess_token" is Shopee's own typo in their API responses.
const TOKEN_ERROR_CODES = new Set([
  "error_auth",
  "error_access_token",
  "invalid_access_token",
  "invalid_acceess_token",
])

// Transient server-side errors from Shopee that are worth retrying.
const TRANSIENT_ERROR_CODES = new Set([
  "error_server",
  "error_network",
  "error_inner",
])

const MAX_TRANSIENT_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hmacSign(partnerKey: string, base: string): string {
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex")
}

function signShopApi(
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: string,
): string {
  const partnerId = process.env.SHOPEE_PARTNER_ID!
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!
  return hmacSign(
    partnerKey,
    `${partnerId}${path}${timestamp}${accessToken}${shopId}`,
  )
}

function signPublicApi(path: string, timestamp: number): string {
  const partnerId = process.env.SHOPEE_PARTNER_ID!
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!
  return hmacSign(partnerKey, `${partnerId}${path}${timestamp}`)
}

async function getTokens() {
  const [accessRow, refreshRow] = await Promise.all([
    prisma.config.findUnique({ where: { key: "shopee_access_token" } }),
    prisma.config.findUnique({ where: { key: "shopee_refresh_token" } }),
  ])
  return {
    accessToken: accessRow?.value ?? null,
    refreshToken: refreshRow?.value ?? null,
  }
}

/**
 * Get the shop_id to use for signing.
 * Prefer the one saved during OAuth (authoritative — it matches the token owner),
 * fall back to env var for pre-auth contexts.
 */
async function getShopId(): Promise<string | null> {
  const row = await prisma.config.findUnique({
    where: { key: "shopee_shop_id" },
  })
  return row?.value ?? process.env.SHOPEE_SHOP_ID ?? null
}

async function saveTokens(accessToken: string, refreshToken: string) {
  const now = new Date()
  await Promise.all([
    prisma.config.upsert({
      where: { key: "shopee_access_token" },
      update: { value: accessToken, updatedAt: now },
      create: { key: "shopee_access_token", value: accessToken },
    }),
    prisma.config.upsert({
      where: { key: "shopee_refresh_token" },
      update: { value: refreshToken, updatedAt: now },
      create: { key: "shopee_refresh_token", value: refreshToken },
    }),
  ])
}

/**
 * Build the signed request URL shared by shopeeRequest and shopeeRequestPost.
 * Throws the same connection-state errors both callers need to surface.
 */
async function buildSignedUrl(
  path: string,
  params: Record<string, string | number>,
): Promise<{ url: URL; shopId: string; accessToken: string }> {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  if (!partnerId) {
    throw new Error("SHOPEE_PARTNER_ID is not set in env")
  }

  const shopId = await getShopId()
  if (!shopId) {
    throw new Error(
      "Shopee shop_id not found. Please connect Shopee via Settings.",
    )
  }

  const { accessToken } = await getTokens()
  if (!accessToken) {
    throw new Error("Shopee not authorized. Please connect via Settings.")
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const sign = signShopApi(path, timestamp, accessToken, shopId)

  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("partner_id", partnerId)
  url.searchParams.set("shop_id", shopId)
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("sign", sign)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  return { url, shopId, accessToken }
}

type ShopeeJsonResponse = {
  error?: string
  message?: string
} & Record<string, unknown>

/**
 * Shared error-branch handling for both shopeeRequest and shopeeRequestPost:
 * token-refresh-and-retry-once on error_auth-family codes, retry with
 * exponential backoff on transient server errors, else throw.
 * `retry` is called with the same args as options.transientAttempt bumped
 * (or unchanged, for the auth-refresh case) to re-issue the original call.
 */
async function handleShopeeErrorResponse<T>(
  json: ShopeeJsonResponse,
  path: string,
  shopId: string,
  options: { transientAttempt?: number },
  retry: (options: { transientAttempt?: number }) => Promise<T>,
): Promise<T | undefined> {
  // Token expired → refresh and retry once.
  if (json.error && TOKEN_ERROR_CODES.has(json.error)) {
    const { refreshToken } = await getTokens()
    if (!refreshToken) {
      throw new Error(
        "Refresh token missing. Please reconnect Shopee via Settings.",
      )
    }
    const newTokens = await refreshShopeeToken(refreshToken, shopId)
    await saveTokens(newTokens.accessToken, newTokens.refreshToken)
    return retry(options)
  }

  // Transient server errors → retry with exponential backoff.
  if (json.error && TRANSIENT_ERROR_CODES.has(json.error)) {
    const attempt = options.transientAttempt ?? 0
    if (attempt < MAX_TRANSIENT_RETRIES) {
      const delayMs = 500 * Math.pow(2, attempt) // 500ms, 1s, 2s
      console.warn(
        `Shopee transient error (${json.error}) on ${path}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_TRANSIENT_RETRIES})`,
      )
      await sleep(delayMs)
      return retry({ transientAttempt: attempt + 1 })
    }
  }

  if (json.error) {
    throw new Error(
      `Shopee API error: ${json.error} — ${json.message ?? "no message"}`,
    )
  }

  return undefined
}

/**
 * Call a Shopee Shop-scoped API. Handles signing and auto token refresh.
 * Throws if the shop isn't connected (no access token in DB).
 */
export async function shopeeRequest<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
  options: { transientAttempt?: number } = {},
): Promise<T> {
  const { url, shopId } = await buildSignedUrl(path, params)

  // Timeout 8s — prevents Shopee API hangs from blocking page renders
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
  const json = (await res.json()) as ShopeeJsonResponse

  if (json.error) {
    const retried = await handleShopeeErrorResponse<T>(
      json,
      path,
      shopId,
      options,
      (opts) => shopeeRequest<T>(path, params, opts),
    )
    if (retried !== undefined) return retried
  }

  return json as T
}

/**
 * Call a Shopee Shop-scoped API with a JSON body (POST). Shares the same
 * signing/token-refresh/transient-retry logic as shopeeRequest.
 */
export async function shopeeRequestPost<T = unknown>(
  path: string,
  params: Record<string, string | number>,
  body: Record<string, unknown>,
  options: { transientAttempt?: number } = {},
): Promise<T> {
  const { url, shopId } = await buildSignedUrl(path, params)

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const json = (await res.json()) as ShopeeJsonResponse

  if (json.error) {
    const retried = await handleShopeeErrorResponse<T>(
      json,
      path,
      shopId,
      options,
      (opts) => shopeeRequestPost<T>(path, params, body, opts),
    )
    if (retried !== undefined) return retried
  }

  return json as T
}

/**
 * Call a Shopee Shop-scoped API that returns a raw binary body (e.g. the
 * combined shipping-document PDF) instead of JSON. Cannot reuse
 * shopeeRequestPost, which always parses the response as JSON.
 */
export async function shopeeDownloadDocument(
  path: string,
  params: Record<string, string | number>,
  body: Record<string, unknown>,
): Promise<Buffer> {
  const { url } = await buildSignedUrl(path, params)
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })

  const contentType = res.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    // Shopee returns JSON instead of a PDF when the document isn't ready or the call errored.
    const json = await res.json()
    throw new Error(`Shopee API error (${json.error ?? "unknown"}): ${json.message ?? "document not ready"}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function refreshShopeeToken(
  refreshToken: string,
  shopId: string,
): Promise<{
  accessToken: string
  refreshToken: string
}> {
  const partnerId = process.env.SHOPEE_PARTNER_ID!
  const path = "/api/v2/auth/access_token/get"
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = signPublicApi(path, timestamp)

  const res = await fetch(
    `${BASE_URL}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        partner_id: Number(partnerId),
        shop_id: Number(shopId),
        refresh_token: refreshToken,
      }),
    },
  )

  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    error?: string
    message?: string
  }

  if (!json.access_token || !json.refresh_token) {
    throw new Error(
      `Shopee token refresh failed: ${json.error ?? "unknown"} — ${json.message ?? ""}`,
    )
  }

  return { accessToken: json.access_token, refreshToken: json.refresh_token }
}
