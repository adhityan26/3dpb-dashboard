import { prisma } from "@/lib/db";

const HOUR_MS = 60 * 60_000;
const IP_HOURLY_CAP = 20;
const GLOBAL_HOURLY_CAP = 100;
const GLOBAL_ID = "global";

// Cap longgar per-IP -- NAT kantor/rumah bisa dipakai banyak orang jujur sekaligus,
// jadi ini bukan proteksi utama, cuma lapis kedua setelah WaOtp's per-phone limit.
export async function canSendFromIp(ip: string, now = new Date()): Promise<{ ok: boolean; waitSec?: number }> {
  const row = await prisma.waOtpIpLimit.findUnique({ where: { ip } });
  if (!row) return { ok: true };
  const windowElapsed = now.getTime() - row.windowStart.getTime();
  if (windowElapsed <= HOUR_MS && row.sentCount >= IP_HOURLY_CAP) {
    return { ok: false, waitSec: Math.ceil((HOUR_MS - windowElapsed) / 1000) };
  }
  return { ok: true };
}

export async function recordIpSent(ip: string, now = new Date()): Promise<void> {
  const existing = await prisma.waOtpIpLimit.findUnique({ where: { ip } });
  const inWindow = existing ? now.getTime() - existing.windowStart.getTime() <= HOUR_MS : false;
  const windowStart = inWindow ? existing!.windowStart : now;
  const sentCount = (inWindow ? existing!.sentCount : 0) + 1;
  await prisma.waOtpIpLimit.upsert({
    where: { ip },
    create: { ip, sentCount: 1, windowStart: now },
    update: { sentCount, windowStart },
  });
}

// Circuit-breaker keras, satu baris (id="global") -- jaring pengaman terakhir kalau
// attacker rotasi IP untuk lolos dari canSendFromIp di atas. Lindungi kuota/reputasi
// akun WA Omni terlepas dari sebaran IP-nya.
export async function canSendGlobal(now = new Date()): Promise<{ ok: boolean; waitSec?: number }> {
  const row = await prisma.waOtpGlobalLimit.findUnique({ where: { id: GLOBAL_ID } });
  if (!row) return { ok: true };
  const windowElapsed = now.getTime() - row.windowStart.getTime();
  if (windowElapsed <= HOUR_MS && row.sentCount >= GLOBAL_HOURLY_CAP) {
    return { ok: false, waitSec: Math.ceil((HOUR_MS - windowElapsed) / 1000) };
  }
  return { ok: true };
}

export async function recordGlobalSent(now = new Date()): Promise<void> {
  const existing = await prisma.waOtpGlobalLimit.findUnique({ where: { id: GLOBAL_ID } });
  const inWindow = existing ? now.getTime() - existing.windowStart.getTime() <= HOUR_MS : false;
  const windowStart = inWindow ? existing!.windowStart : now;
  const sentCount = (inWindow ? existing!.sentCount : 0) + 1;
  await prisma.waOtpGlobalLimit.upsert({
    where: { id: GLOBAL_ID },
    create: { id: GLOBAL_ID, sentCount: 1, windowStart: now },
    update: { sentCount, windowStart },
  });
}

// Homelab deploy ini di belakang nginx-proxy-manager -- x-forwarded-for's FIRST entry
// adalah IP client asli (entry berikutnya = hop-hop proxy internal). Header absen
// (dev/test langsung tanpa proxy) -> "unknown", satu bucket bersama, bukan throw.
export function getClientIp(req: Request): string {
  const header = req.headers.get("x-forwarded-for");
  if (!header) return "unknown";
  return header.split(",")[0].trim();
}
