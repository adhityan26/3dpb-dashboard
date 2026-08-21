import { NextResponse } from "next/server";
import { resolveToken } from "@/lib/agent-tokens/service";
import { getEntitlement, capabilities } from "@/lib/entitlement";

/**
 * Helper per-route (BUKAN Next.js middleware — Edge runtime tak bisa akses Postgres
 * lewat @prisma/adapter-pg, dan apps/saas cuma boleh 1 middleware.ts yang berpotensi
 * bentrok NextAuth nanti). Panggil manual di baris pertama tiap handler /api/agent/*.
 */
export async function requireAgentToken(req: Request): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const agentVersion = req.headers.get("X-Agent-Version");
  const resolved = await resolveToken(match[1], agentVersion);
  if (!resolved) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const ent = await getEntitlement(resolved.userId);
  if (!capabilities(ent).paidCore) {
    return NextResponse.json({ error: "entitlement_expired" }, { status: 403 });
  }

  return { userId: resolved.userId };
}
