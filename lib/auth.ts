import NextAuth from "next-auth"
import Authentik from "next-auth/providers/authentik"
import { prisma } from "@/lib/db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Authentik({
      clientId: process.env.AUTHENTIK_CLIENT_ID!,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
      issuer: process.env.AUTHENTIK_ISSUER!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow users that exist in local DB
      if (!user.email) return false
      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      })
      return !!dbUser
    },
    async jwt({ token, user }) {
      // On first login, fetch role from local DB
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, role: true },
        })
        if (dbUser) {
          token.role = dbUser.role
          token.id = dbUser.id
        }
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
