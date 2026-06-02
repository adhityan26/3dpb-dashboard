// Quick probe: check get_shipping_document_result response for recent orders
// Run from inside the Docker container:
//   docker exec shopee-dashboard node scripts/probe-logistics.mjs

import crypto from "crypto"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const BASE_URL = process.env.SHOPEE_BASE_URL ?? "https://partner.shopeemobile.com"
const PARTNER_ID = process.env.SHOPEE_PARTNER_ID
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY

function sign(path, timestamp, accessToken, shopId) {
  return crypto.createHmac("sha256", PARTNER_KEY)
    .update(`${PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`)
    .digest("hex")
}

async function call(path, params) {
  const [tokenRow, shopIdRow] = await Promise.all([
    prisma.config.findUnique({ where: { key: "shopee_access_token" } }),
    prisma.config.findUnique({ where: { key: "shopee_shop_id" } }),
  ])
  const accessToken = tokenRow?.value
  const shopId = shopIdRow?.value ?? process.env.SHOPEE_SHOP_ID

  const timestamp = Math.floor(Date.now() / 1000)
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("partner_id", PARTNER_ID)
  url.searchParams.set("shop_id", shopId)
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("sign", sign(path, timestamp, accessToken, shopId))
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  const res = await fetch(url.toString())
  return res.json()
}

// Step 1: get some recent order SNs
const now = Math.floor(Date.now() / 1000)
const from = now - 15 * 24 * 60 * 60

const listRes = await call("/api/v2/order/get_order_list", {
  time_range_field: "create_time",
  time_from: from,
  time_to: now,
  order_status: "PROCESSED",
  page_size: 5,
})

const sns = (listRes.response?.order_list ?? []).map(o => o.order_sn)
console.log("Sample PROCESSED order SNs:", sns)

if (sns.length === 0) {
  console.log("No PROCESSED orders found")
  process.exit(0)
}

// Step 2: probe get_shipping_document_result
const docRes = await call("/api/v2/logistics/get_shipping_document_result", {
  order_sn_list: sns.join(","),
})

console.log("\n=== get_shipping_document_result response ===")
console.log(JSON.stringify(docRes, null, 2))

await prisma.$disconnect()
