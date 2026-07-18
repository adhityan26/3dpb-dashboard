import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
// Auth.js v5: nama cookie sesi. Build note: verifikasi via cookie login email sukses.
const SESSION_COOKIE = "authjs.session-token";

export async function upsertUserByPhone(phone: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.phoneVerified) {
      return prisma.user.update({ where: { phone }, data: { phoneVerified: new Date() } });
    }
    return existing;
  }
  const user = await prisma.user.create({ data: { phone, phoneVerified: new Date() } });
  await prisma.entitlement.create({ data: { userId: user.id } }).catch(() => {});
  return user;
}

export async function createUserSession(userId: string, now = new Date()): Promise<void> {
  const sessionToken = crypto.randomUUID();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_MS);
  await prisma.session.create({ data: { sessionToken, userId, expires } });
  const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const jar = await cookies();
  jar.set(secure ? `__Secure-${SESSION_COOKIE}` : SESSION_COOKIE, sessionToken, {
    httpOnly: true, sameSite: "lax", path: "/", secure, expires,
  });
}
