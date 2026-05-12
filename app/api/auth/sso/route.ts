import { signIn } from "@/lib/auth"

// GET /api/auth/sso → trigger Authentik OAuth flow
export async function GET() {
  await signIn("authentik", { redirectTo: "/order" })
}
