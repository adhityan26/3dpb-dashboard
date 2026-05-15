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
    console.log("[shopee] OAuth success — shop_id:", shopId)
    return redirectTo("/settings?shopee=connected")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[shopee] OAuth callback error:", msg, "| code:", code?.slice(0, 10), "| shop_id:", shopId)
    return redirectTo(`/settings?error=token_exchange&detail=${encodeURIComponent(msg)}`)
  }
}
