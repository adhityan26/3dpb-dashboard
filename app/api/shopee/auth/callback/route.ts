import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForToken } from "@/lib/shopee/auth"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get("code")
  const shopId = searchParams.get("shop_id")

  if (!code || !shopId) {
    return NextResponse.redirect(
      new URL("/settings?error=missing_params", req.url),
    )
  }

  try {
    await exchangeCodeForToken(code, shopId)
    return NextResponse.redirect(
      new URL("/settings?shopee=connected", req.url),
    )
  } catch (err) {
    console.error("Shopee OAuth callback error:", err)
    return NextResponse.redirect(
      new URL("/settings?error=token_exchange", req.url),
    )
  }
}
