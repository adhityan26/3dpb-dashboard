import crypto from "crypto"
import { prisma } from "@/lib/db"

/**
 * Shopee media / product-update helpers. These bypass the shared
 * `shopeeRequest` helper because they need POST with multipart or JSON body
 * (the shared helper is GET-only with URL params).
 */

const BASE_URL =
  process.env.SHOPEE_BASE_URL ?? "https://partner.shopeemobile.com"

interface ShopAuth {
  partnerId: string
  partnerKey: string
  shopId: string
  accessToken: string
}

async function getShopAuth(): Promise<ShopAuth> {
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
  if (!shopId) {
    throw new Error(
      "Shopee shop_id not found. Please connect Shopee via Settings.",
    )
  }
  if (!accessToken) {
    throw new Error("Shopee not authorized. Please connect via Settings.")
  }
  return { partnerId, partnerKey, shopId, accessToken }
}

function signShopApi(
  partnerKey: string,
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: string,
): string {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}${accessToken}${shopId}`)
    .digest("hex")
}

function buildSignedUrl(
  auth: ShopAuth,
  path: string,
  timestamp: number,
): string {
  const signature = signShopApi(
    auth.partnerKey,
    auth.partnerId,
    path,
    timestamp,
    auth.accessToken,
    auth.shopId,
  )
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("partner_id", auth.partnerId)
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("access_token", auth.accessToken)
  url.searchParams.set("shop_id", auth.shopId)
  url.searchParams.set("sign", signature)
  return url.toString()
}

export interface UploadedImage {
  imageId: string
  imageUrl: string
}

interface ShopeeUploadImageResponse {
  response?: {
    image_info?: {
      image_id?: string
      image_url_list?: Array<{ image_url_region: string; image_url: string }>
    }
  }
  error?: string
  message?: string
}

/**
 * Upload a single image to Shopee's media space.
 * Returns the new image_id (for use in update_item) and a CDN URL.
 */
export async function uploadImageToShopee(
  fileBuffer: Buffer,
  filename: string,
  contentType: string,
): Promise<UploadedImage> {
  const auth = await getShopAuth()
  const path = "/api/v2/media_space/upload_image"
  const timestamp = Math.floor(Date.now() / 1000)
  const url = buildSignedUrl(auth, path, timestamp)

  const formData = new FormData()
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: contentType })
  formData.append("image", blob, filename)

  const res = await fetch(url, { method: "POST", body: formData })
  const json = (await res.json()) as ShopeeUploadImageResponse

  if (json.error) {
    throw new Error(
      `Shopee upload_image error: ${json.error} — ${json.message ?? "no message"}`,
    )
  }

  const imageInfo = json.response?.image_info
  const imageId = imageInfo?.image_id
  const imageUrl = imageInfo?.image_url_list?.[0]?.image_url ?? ""

  if (!imageId) {
    throw new Error("Shopee upload_image response missing image_id")
  }

  return { imageId, imageUrl }
}

/**
 * Replace an item's image list with the provided image_ids.
 * Shopee will trigger its content moderation review if the change is
 * significant — the product status may transition to REVIEWING temporarily.
 */
export async function updateItemImages(
  itemId: number,
  imageIdList: string[],
): Promise<void> {
  const auth = await getShopAuth()
  const path = "/api/v2/product/update_item"
  const timestamp = Math.floor(Date.now() / 1000)
  const url = buildSignedUrl(auth, path, timestamp)

  const body = {
    item_id: itemId,
    image: {
      image_id_list: imageIdList,
    },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as {
    error?: string
    message?: string
  }

  if (json.error) {
    throw new Error(
      `Shopee update_item error: ${json.error} — ${json.message ?? "no message"}`,
    )
  }
}
