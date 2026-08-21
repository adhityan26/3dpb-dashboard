import crypto from "crypto";
import { prisma } from "@/lib/db";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function generateToken(userId: string): Promise<{ id: string; rawToken: string }> {
  const rawToken = `slz_${crypto.randomBytes(32).toString("base64url")}`;
  const row = await prisma.agentToken.create({
    data: { userId, tokenHash: hashToken(rawToken) },
  });
  return { id: row.id, rawToken };
}

export async function listTokens(userId: string) {
  const rows = await prisma.agentToken.findMany({ where: { userId } });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt, agentVersion: r.agentVersion }));
}

export async function revokeToken(userId: string, id: string): Promise<void> {
  await prisma.agentToken.update({ where: { id, userId }, data: { revokedAt: new Date() } });
}

/**
 * Resolve token mentah -> userId. null kalau tak ketemu/revoked. Update lastUsedAt sekalian
 * (best-effort). `agentVersion` opsional (header X-Agent-Version dari apps/agent) -- HANYA
 * ditulis kalau dikirim, biar request lama/tanpa header tidak menghapus versi terakhir yang
 * sudah tercatat.
 */
export async function resolveToken(rawToken: string, agentVersion?: string | null): Promise<{ userId: string } | null> {
  const row = await prisma.agentToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.revokedAt) return null;
  await prisma.agentToken.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date(), ...(agentVersion ? { agentVersion } : {}) },
  });
  return { userId: row.userId };
}
