import crypto from "crypto"
import { prisma } from "@/lib/db"

const BASE_URL = process.env.SHOPEE_BASE_URL ?? "https://partner.shopeemobile.com"

function hmacSign(partnerKey: string, base: string): string {
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex")
}

export function getShopeeAuthUrl(): string {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  const partnerKey = process.env.SHOPEE_PARTNER_KEY
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  if (!partnerId || !partnerKey) {
    throw new Error("SHOPEE_PARTNER_ID or SHOPEE_PARTNER_KEY is not set in env")
  }

  const path = "/api/v2/shop/auth_partner"
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = hmacSign(partnerKey, `${partnerId}${path}${timestamp}`)
  const redirectUrl = `${appUrl}/api/shopee/auth/callback`

  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("partner_id", partnerId)
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("sign", sign)
  url.searchParams.set("redirect", redirectUrl)

  return url.toString()
}

export async function exchangeCodeForToken(
  code: string,
  shopId: string,
): Promise<void> {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  const partnerKey = process.env.SHOPEE_PARTNER_KEY

  if (!partnerId || !partnerKey) {
    throw new Error("SHOPEE_PARTNER_ID or SHOPEE_PARTNER_KEY is not set in env")
  }

  const path = "/api/v2/auth/token/get"
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = hmacSign(partnerKey, `${partnerId}${path}${timestamp}`)

  const res = await fetch(
    `${BASE_URL}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        shop_id: Number(shopId),
        partner_id: Number(partnerId),
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
      `Shopee token exchange failed: ${json.error ?? "unknown"} — ${json.message ?? ""}`,
    )
  }

  const now = new Date()
  await Promise.all([
    prisma.config.upsert({
      where: { key: "shopee_access_token" },
      update: { value: json.access_token, updatedAt: now },
      create: { key: "shopee_access_token", value: json.access_token },
    }),
    prisma.config.upsert({
      where: { key: "shopee_refresh_token" },
      update: { value: json.refresh_token, updatedAt: now },
      create: { key: "shopee_refresh_token", value: json.refresh_token },
    }),
    prisma.config.upsert({
      where: { key: "shopee_shop_id" },
      update: { value: shopId, updatedAt: now },
      create: { key: "shopee_shop_id", value: shopId },
    }),
  ])
}
