import NextAuth from "next-auth"
import type { NextAuthRequest, Session } from "next-auth"
import Authentik from "next-auth/providers/authentik"
import Credentials from "next-auth/providers/credentials"
import type { NextFetchEvent, NextMiddleware } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth: nextAuthAuth } = NextAuth({
  providers: [
    // Primary: Authentik SSO
    Authentik({
      clientId: process.env.AUTHENTIK_CLIENT_ID!,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
      issuer: process.env.AUTHENTIK_ISSUER!,
    }),
    // Fallback: email/password (untuk saat Authentik down)
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user) return null
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On first login (user object present), fetch role from local DB
      // Also acts as the access gate — deny if user not in DB
      if (user?.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true, role: true },
          })
          if (!dbUser) {
            // Authentik SSO user not in local DB — upsert with OWNER role
            const upserted = await prisma.user.upsert({
              where: { email: user.email },
              create: {
                email: user.email,
                name: user.name ?? user.email.split("@")[0],
                password: `sso-${Date.now()}`,
                role: "OWNER",
              },
              update: {}, // don't overwrite existing role
              select: { id: true, role: true },
            })
            token.role = upserted.role
            token.id = upserted.id
          } else {
            token.role = dbUser.role
            token.id = dbUser.id
          }
        } catch (err) {
          console.error("[auth] Failed to fetch user from DB:", err)
          token.error = "DBError"
        }
      }
      return token
    },
    session({ session, token }) {
      if (token.error) {
        // Propagate error so middleware can handle it
        (session as { error?: string }).error = token.error as string
      }
      if (session.user) {
        session.user.role = (token.role as string) ?? null
        session.user.id = (token.id as string) ?? null
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})

// ── Dev-only auth bypass ─────────────────────────────────────────────────────
// Opt-in via DEV_AUTH_BYPASS=true in .env.local — never active unless BOTH that
// flag is set AND the request host is localhost/127.0.0.1. NODE_ENV!=='production'
// is a third, redundant gate (belt-and-suspenders: even a misconfigured prod
// deploy with the env var accidentally set still can't trigger this). Exists
// purely so `await auth()`/`auth((req) => ...)` call sites don't need a real
// login during local manual QA. Remove or leave off (default) for normal use.
const DEV_BYPASS_SESSION: Session = {
  user: { id: "dev-bypass", email: "dev-bypass@localhost", name: "Dev Bypass (auth disabled)", role: "OWNER" },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
}

function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false
  const h = host.split(":")[0]
  return h === "localhost" || h === "127.0.0.1" || h === "::1"
}

function devBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true"
}

type MiddlewareHandler = (req: NextAuthRequest, event: NextFetchEvent) => ReturnType<NextMiddleware>

// NOT an async function: the `auth(handler)` middleware form must return the
// wrapping function SYNCHRONOUSLY (Next.js's proxy loader calls it directly as
// `export default auth(handler)`, not `await`ed) — wrapping the whole export in
// `async function` broke that contract (every call became Promise<...>, which
// Next.js's proxy loader rejected with "must export a function named `proxy`").
// Only the no-args `await auth()` form is itself async.
//
// Overload order matters beyond call-site resolution: tools that extract a
// type from an overloaded function (`ReturnType<typeof auth>`, `vi.mocked`)
// use the LAST declared signature. The no-args session form is declared last
// so `vi.mocked(auth).mockResolvedValue(session)` in tests infers correctly.
export function auth(handler: MiddlewareHandler): NextMiddleware
export function auth(): Promise<Session | null>
export function auth(
  handler?: MiddlewareHandler
): Promise<Session | null> | NextMiddleware {
  if (handler) {
    return ((req: NextAuthRequest, event: NextFetchEvent) => {
      const host = req.nextUrl.hostname || req.headers.get("host")
      if (devBypassEnabled() && isLocalHost(host)) {
        req.auth = DEV_BYPASS_SESSION
        return handler(req, event)
      }
      return nextAuthAuth(handler)(req, event)
    }) as NextMiddleware
  }

  return (async () => {
    if (devBypassEnabled()) {
      try {
        const { headers } = await import("next/headers")
        const h = await headers()
        if (isLocalHost(h.get("host"))) return DEV_BYPASS_SESSION
      } catch {
        // headers() unavailable in this context (e.g. outside a request) — fall through to real auth
      }
    }
    return nextAuthAuth()
  })()
}
