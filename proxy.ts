import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login"]

// Akses per role
const ROLE_ACCESS: Record<string, string[]> = {
  OWNER: ["/order", "/iklan", "/analisa", "/produk", "/settings"],
  ADMIN: ["/order", "/produk"],
  TEST_USER: ["/order", "/iklan", "/analisa", "/produk"],
}

// Next.js 16 `proxy.ts` convention. NextAuth v5 `auth` wrapper is still
// valid here — same pattern that worked as `middleware.ts` in Next 14/15.
export default auth((req) => {
  const { nextUrl, auth: session } = req
  const path = nextUrl.pathname

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.next()
  }

  // Belum login → redirect ke /login
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const role = session.user.role
  const allowed = ROLE_ACCESS[role] ?? []
  const hasAccess = allowed.some((p) => path.startsWith(p))

  if (!hasAccess) {
    // Redirect ke halaman pertama yang boleh diakses
    const firstAllowed = allowed[0] ?? "/login"
    return NextResponse.redirect(new URL(firstAllowed, req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
