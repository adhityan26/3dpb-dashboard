import crypto from "crypto"
import { prisma } from "@/lib/db"
import { shopeeRequest } from "./client"
import type {
  ShopeeCategory,
  ShopeeCategoryAttribute,
  ShopeeLogisticChannel,
  ShopeeAddItemPayload,
  ShopeeAddItemResult,
} from "./types"

const BASE_URL = process.env.SHOPEE_BASE_URL ?? "https://partner.shopeemobile.com"

// ── POST signing (mirrors pattern from media.ts) ─────────────────────────────

interface ShopPostAuth {
  partnerId: string
  partnerKey: string
  shopId: string
  accessToken: string
}

async function getPostAuth(): Promise<ShopPostAuth> {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  const partnerKey = process.env.SHOPEE_PARTNER_KEY
  if (!partnerId || !partnerKey) {
    throw new Error("SHOPEE_PARTNER_ID or SHOPEE_PARTNER_KEY is not set")
  }
  const [shopIdRow, accessRow] = await Promise.all([
    prisma.config.findUnique({ where: { key: "shopee_shop_id" } }),
    prisma.config.findUnique({ where: { key: "shopee_access_token" } }),
  ])
  const shopId = shopIdRow?.value ?? process.env.SHOPEE_SHOP_ID ?? null
  const accessToken = accessRow?.value ?? null
  if (!shopId) throw new Error("Shopee shop_id not found. Please connect via Settings.")
  if (!accessToken) throw new Error("Shopee not authorized. Please connect via Settings.")
  return { partnerId, partnerKey, shopId, accessToken }
}

function buildSignedPostUrl(auth: ShopPostAuth, path: string, timestamp: number): string {
  const sig = crypto
    .createHmac("sha256", auth.partnerKey)
    .update(`${auth.partnerId}${path}${timestamp}${auth.accessToken}${auth.shopId}`)
    .digest("hex")
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("partner_id", auth.partnerId)
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("access_token", auth.accessToken)
  url.searchParams.set("shop_id", auth.shopId)
  url.searchParams.set("sign", sig)
  return url.toString()
}

// ── GET helpers ───────────────────────────────────────────────────────────────

interface ShopeeCategoryListResponse {
  response: {
    category_list: Array<{
      category_id: number
      parent_category_id: number
      category_name: string
      has_children: boolean
    }>
  }
  error?: string
  message?: string
}

export async function shopeeGetCategories(
  parentCategoryId: number,
): Promise<ShopeeCategory[]> {
  const json = await shopeeRequest<ShopeeCategoryListResponse>(
    "/api/v2/product/get_category",
    { language: "id", parent_category_id: parentCategoryId },
  )
  if (json.error) throw new Error(`Shopee get_category: ${json.error} — ${json.message}`)
  return json.response.category_list ?? []
}

interface ShopeeAttributeListResponse {
  response: {
    attribute_list: Array<{
      attribute_id: number
      attribute_name: string
      is_mandatory: boolean
      input_type: ShopeeCategoryAttribute["input_type"]
      attribute_value_list: Array<{ value_id: number; original_value_name: string }>
    }>
  }
  error?: string
  message?: string
}

export async function shopeeGetAttributes(
  categoryId: number,
): Promise<ShopeeCategoryAttribute[]> {
  const json = await shopeeRequest<ShopeeAttributeListResponse>(
    "/api/v2/product/get_attributes",
    { language: "id", category_id: categoryId },
  )
  if (json.error) throw new Error(`Shopee get_attributes: ${json.error} — ${json.message}`)
  return json.response.attribute_list ?? []
}

interface ShopeeChannelListResponse {
  response: {
    logistics_channel_list: Array<{
      logistics_channel_id: number
      logistics_channel_name: string
      enabled: boolean
    }>
  }
  error?: string
  message?: string
}

export async function shopeeGetLogistics(): Promise<ShopeeLogisticChannel[]> {
  const json = await shopeeRequest<ShopeeChannelListResponse>(
    "/api/v2/logistics/get_channel_list",
  )
  if (json.error) throw new Error(`Shopee get_channel_list: ${json.error} — ${json.message}`)
  return (json.response.logistics_channel_list ?? []).map(c => ({
    logistic_id: c.logistics_channel_id,
    logistic_name: c.logistics_channel_name,
    enabled: c.enabled,
  }))
}

// ── POST add_item ─────────────────────────────────────────────────────────────

interface ShopeeAddItemResponse {
  response?: { item_id?: number }
  error?: string
  message?: string
}

export async function shopeeAddItem(
  payload: ShopeeAddItemPayload,
): Promise<ShopeeAddItemResult> {
  const auth = await getPostAuth()
  const path = "/api/v2/product/add_item"
  const timestamp = Math.floor(Date.now() / 1000)
  const url = buildSignedPostUrl(auth, path, timestamp)

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const json = (await res.json()) as ShopeeAddItemResponse

  if (json.error) {
    throw new Error(`Shopee add_item: ${json.error} — ${json.message ?? "no message"}`)
  }
  const itemId = json.response?.item_id
  if (!itemId) throw new Error("Shopee add_item response missing item_id")
  return { item_id: itemId }
}
