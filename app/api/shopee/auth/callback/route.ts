import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForToken } from "@/lib/shopee/auth"

function redirectTo(path: string): NextResponse {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  return NextResponse.redirect(new URL(path, base))
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  // Log ALL received parameters for debugging
  const allParams: Record<string, string> = {}
  searchParams.forEach((v, k) => { allParams[k] = v })
  console.log("[shopee] callback received params:", JSON.stringify(allParams))

  const code = searchParams.get("code")
  // Shopee may use "shop_id" or "shopid" depending on API version/env
  const shopId = searchParams.get("shop_id") ?? searchParams.get("shopid") ?? searchParams.get("shop")

  if (!code || !shopId) {
    const detail = `got: ${JSON.stringify(allParams)}`
    console.error("[shopee] missing params:", detail)
    return redirectTo(`/settings?error=missing_params&detail=${encodeURIComponent(detail)}`)
  }

  try {
    await exchangeCodeForToken(code, shopId)
    console.log("[shopee] OAuth success — shop_id:", shopId)
    return redirectTo("/settings?shopee=connected")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[shopee] OAuth callback error:", msg, "| code:", code?.slice(0, 10), "| shop_id:", shopId)
    return redirectTo(`/settings?error=token_exchange&detail=${encodeURIComponent(msg)}`)
  }
}
