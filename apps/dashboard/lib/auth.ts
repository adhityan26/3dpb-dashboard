import NextAuth from "next-auth"
import Authentik from "next-auth/providers/authentik"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth } = NextAuth({
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
