import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForToken } from "@/lib/shopee/auth"

/**
 * Build an absolute redirect URL using NEXTAUTH_URL.
 *
 * We avoid `new URL(path, req.url)` because in Docker the server binds to
 * HOSTNAME=0.0.0.0, and `req.url` can end up with that host in some setups,
 * producing a broken redirect back to the browser.
 */
function redirectTo(path: string): NextResponse {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  return NextResponse.redirect(new URL(path, base))
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get("code")
  const shopId = searchParams.get("shop_id")

  if (!code || !shopId) {
    return redirectTo("/settings?error=missing_params")
  }

  try {
    await exchangeCodeForToken(code, shopId)
    return redirectTo("/settings?shopee=connected")
  } catch (err) {
    console.error("Shopee OAuth callback error:", err)
    return redirectTo("/settings?error=token_exchange")
  }
}
