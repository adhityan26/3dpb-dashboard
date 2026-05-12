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
            // User authenticated via Authentik but not in our DB — deny
            token.error = "UserNotInDB"
            return token
          }
          token.role = dbUser.role
          token.id = dbUser.id
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
