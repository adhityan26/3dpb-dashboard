import { signIn } from "@/lib/auth"
import { headers } from "next/headers"

// GET /api/auth/sso?callbackUrl=/some/path → trigger Authentik OAuth flow
export async function GET(req: Request) {
  const headersList = await headers()
  const forwardedHost = headersList.get("x-forwarded-host")
  const forwardedProto = headersList.get("x-forwarded-proto") ?? "http"

  // Read callbackUrl from query param — must be a relative path (security check)
  const url = new URL(req.url)
  const rawCallback = url.searchParams.get("callbackUrl") ?? ""
  const relativePath =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/order"

  // Build absolute URL for Authentik callback (required by OAuth)
  const redirectTo = forwardedHost
    ? `${forwardedProto}://${forwardedHost}${relativePath}`
    : relativePath

  await signIn("authentik", { redirectTo })
}
