import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";

/**
 * Kembaran `requireAgentToken` (lib/agent-auth.ts) untuk route yang dipakai BROWSER (session
 * NextAuth), bukan agent (Bearer token). Bentuk return-nya sengaja sama persis
 * (`{ userId } | NextResponse`) supaya pola pemakaian di handler seragam:
 *
 *   const result = await requirePaidCore();
 *   if (result instanceof NextResponse) return result;
 *
 * Tinggal di file sendiri (bukan digabung ke lib/entitlement.ts) karena helper ini menarik
 * `@/lib/auth` → `next-auth`, sementara lib/entitlement.ts diimpor juga oleh unit test murni
 * (lib/entitlement.test.ts) yang tak boleh ikut menginisialisasi NextAuth saat import.
 */
export async function requirePaidCore(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ent = await getEntitlement(userId);
  if (!capabilities(ent).paidCore) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return { userId };
}
