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
 * Call a Shopee Shop-scoped API. Handles signing and auto token refresh.
 * Throws if the shop isn't connected (no access token in DB).
 */
export async function shopeeRequest<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
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

  const res = await fetch(url.toString())
  const json = (await res.json()) as {
    error?: string
    message?: string
  } & Record<string, unknown>

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
    return shopeeRequest<T>(path, params)
  }

  if (json.error) {
    throw new Error(
      `Shopee API error: ${json.error} — ${json.message ?? "no message"}`,
    )
  }

  return json as T
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
