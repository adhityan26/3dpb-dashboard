import { signIn } from "@/lib/auth"
import { headers } from "next/headers"

// GET /api/auth/sso → trigger Authentik OAuth flow
// Pass the request headers so NextAuth reads the correct host
export async function GET() {
  // Read forwarded host from NPM proxy so NextAuth builds correct callback URL
  const headersList = await headers()
  const forwardedHost = headersList.get("x-forwarded-host")
  const forwardedProto = headersList.get("x-forwarded-proto") ?? "http"

  // If AUTH_TRUST_HOST is working, signIn picks up the host automatically.
  // Explicitly set the redirect callback URL to ensure correct domain.
  const callbackUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}/order`
    : "/order"

  await signIn("authentik", { redirectTo: callbackUrl })
}
