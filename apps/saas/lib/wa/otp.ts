import crypto from "crypto";
import { prisma } from "@/lib/db";

const EXPIRY_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const HOURLY_CAP = 5;
const MAX_ATTEMPTS = 5;

function hashCode(phone: string, code: string): string {
  return crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export async function canSend(phone: string, now = new Date()): Promise<{ ok: boolean; waitSec?: number }> {
  const row = await prisma.waOtp.findUnique({ where: { phone } });
  if (!row) return { ok: true };
  const sinceSent = now.getTime() - row.lastSentAt.getTime();
  if (sinceSent < COOLDOWN_MS) return { ok: false, waitSec: Math.ceil((COOLDOWN_MS - sinceSent) / 1000) };
  const windowElapsed = now.getTime() - row.windowStart.getTime();
  if (windowElapsed <= HOUR_MS && row.sentCount >= HOURLY_CAP) {
    return { ok: false, waitSec: Math.ceil((HOUR_MS - windowElapsed) / 1000) };
  }
  return { ok: true };
}

export async function issueOtp(phone: string, now = new Date()): Promise<{ code: string }> {
  const code = String(crypto.randomInt(100000, 1000000)); // 6 digit
  const existing = await prisma.waOtp.findUnique({ where: { phone } });
  const inWindow = existing ? now.getTime() - existing.windowStart.getTime() <= HOUR_MS : false;
  const windowStart = inWindow ? existing!.windowStart : now;
  const sentCount = (inWindow ? existing!.sentCount : 0) + 1;
  const codeHash = hashCode(phone, code);
  const expires = new Date(now.getTime() + EXPIRY_MS);
  await prisma.waOtp.upsert({
    where: { phone },
    create: { phone, codeHash, expires, attempts: 0, lastSentAt: now, sentCount: 1, windowStart: now },
    update: { codeHash, expires, attempts: 0, lastSentAt: now, sentCount, windowStart },
  });
  return { code };
}

export async function verifyOtp(
  phone: string, code: string, now = new Date(),
): Promise<"ok" | "invalid" | "expired" | "locked"> {
  const row = await prisma.waOtp.findUnique({ where: { phone } });
  if (!row || row.expires.getTime() < now.getTime()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  if (row.codeHash === hashCode(phone, code)) {
    await prisma.waOtp.delete({ where: { phone } });
    return "ok";
  }
  await prisma.waOtp.update({ where: { phone }, data: { attempts: row.attempts + 1 } });
  return "invalid";
}
