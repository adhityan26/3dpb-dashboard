import { auth } from "@/lib/auth"
import { getShopeeAuthUrl } from "@/lib/shopee/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const url = getShopeeAuthUrl()
    return Response.redirect(url, 302)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return new Response(`Shopee OAuth error: ${msg}`, { status: 500 })
  }
}
