import { prisma } from "@/lib/db";

const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const HOURLY_CAP = 5;

// Mirror lib/wa/otp.ts's canSend, minus code/expiry -- NextAuth's own VerificationToken
// table already handles the magic-link token itself, this only gates the SEND.
export async function canSendMagicLink(email: string, now = new Date()): Promise<{ ok: boolean; waitSec?: number }> {
  const row = await prisma.magicLinkRequest.findUnique({ where: { email } });
  if (!row) return { ok: true };
  const sinceSent = now.getTime() - row.lastSentAt.getTime();
  if (sinceSent < COOLDOWN_MS) return { ok: false, waitSec: Math.ceil((COOLDOWN_MS - sinceSent) / 1000) };
  const windowElapsed = now.getTime() - row.windowStart.getTime();
  if (windowElapsed <= HOUR_MS && row.sentCount >= HOURLY_CAP) {
    return { ok: false, waitSec: Math.ceil((HOUR_MS - windowElapsed) / 1000) };
  }
  return { ok: true };
}

// Called right before the email is actually sent -- separate from canSendMagicLink
// (a read-only check) since NextAuth's sendVerificationRequest is the "send" step itself,
// there's no separate issue-then-send flow like WA OTP's issueOtp/sendWA pair.
export async function recordMagicLinkSent(email: string, now = new Date()): Promise<void> {
  const existing = await prisma.magicLinkRequest.findUnique({ where: { email } });
  const inWindow = existing ? now.getTime() - existing.windowStart.getTime() <= HOUR_MS : false;
  const windowStart = inWindow ? existing!.windowStart : now;
  const sentCount = (inWindow ? existing!.sentCount : 0) + 1;
  await prisma.magicLinkRequest.upsert({
    where: { email },
    create: { email, lastSentAt: now, sentCount: 1, windowStart: now },
    update: { lastSentAt: now, sentCount, windowStart },
  });
}
