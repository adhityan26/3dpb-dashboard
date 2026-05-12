import { signOut } from "@/lib/auth"

const AUTHENTIK_LOGOUT_URL =
  "http://auth.homelab.lan/application/o/shopee-dashboard/end-session/" +
  "?post_logout_redirect_uri=http%3A%2F%2Fshopee.homelab.lan%2Flogin"

// GET /api/auth/logout
// 1. Clear NextAuth JWT session
// 2. Redirect to Authentik end-session (clears Authentik SSO session)
export async function GET() {
  await signOut({ redirect: false })
  // After clearing NextAuth session, send browser to Authentik logout
  return Response.redirect(AUTHENTIK_LOGOUT_URL, 302)
}
