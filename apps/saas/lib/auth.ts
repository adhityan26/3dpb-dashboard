import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { sendVerificationRequest } from "@/lib/email/send-verification-request";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    // sendVerificationRequest override gates every send through canSendMagicLink (go-public
    // #10) -- see lib/email/send-verification-request.ts for why this duplicates rather
    // than delegates to the provider's own default email-sending logic.
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      sendVerificationRequest,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  events: {
    // Auto-create entitlement default aman saat user pertama dibuat (spec §5/§6).
    async createUser({ user }) {
      if (user.id) {
        await prisma.entitlement.create({ data: { userId: user.id } }).catch(() => {});
      }
    },
  },
});
