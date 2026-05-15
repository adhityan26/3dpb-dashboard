import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForToken } from "@/lib/shopee/auth"

function redirectTo(path: string): NextResponse {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  return NextResponse.redirect(new URL(path, base))
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const allParams: Record<string, string> = {}
  searchParams.forEach((v, k) => { allParams[k] = v })
  console.log("[shopee] callback params:", JSON.stringify(allParams))

  const code = searchParams.get("code")

  // Shop-level auth returns shop_id; In-House System returns main_account_id
  const shopId = searchParams.get("shop_id") ?? searchParams.get("shopid")
  const mainAccountId = searchParams.get("main_account_id")

  if (!code) {
    return redirectTo(`/settings?error=missing_params&detail=${encodeURIComponent("no code: " + JSON.stringify(allParams))}`)
  }

  // For In-House System apps, use main_account_id; for shop apps, use shop_id
  // Fall back to env SHOPEE_SHOP_ID if neither present
  const effectiveShopId = shopId ?? process.env.SHOPEE_SHOP_ID ?? ""

  try {
    await exchangeCodeForToken(code, effectiveShopId, mainAccountId ?? undefined)
    console.log("[shopee] OAuth success — shop_id:", effectiveShopId, "main_account_id:", mainAccountId)
    return redirectTo("/settings?shopee=connected")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[shopee] OAuth callback error:", msg)
    return redirectTo(`/settings?error=token_exchange&detail=${encodeURIComponent(msg)}`)
  }
}
