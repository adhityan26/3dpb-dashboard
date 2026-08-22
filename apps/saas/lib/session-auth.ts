import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { hasActiveSlotGrant } from "@/lib/printer-slots/capacity";

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

/**
 * Kembaran `requirePaidCore`, tapi buat rute yang mengontrol PEMAKAIAN kapasitas printer-slot
 * yang SUDAH dibeli (pairing/edit device, download Agent, layout CYD, issue agent token) --
 * BUKAN buat rute pembelian (checkout slot/CYD tetap `requirePaidCore` murni) atau fitur Pro
 * kalkulator (tak tersentuh sama sekali). paidCore sekarang bisa lapse (Subscribe berhenti
 * bayar), tapi grant permanen (SLOT_PURCHASE/CYD_PURCHASE/PROMO) yang sudah dibayar tak pernah
 * ikut lapse -- kalau digate paidCore doang, user kehilangan akses ke kapasitas yang SUDAH lunas
 * begitu subscribe-nya telat, walau FIFO suspension (lihat capacity.ts) semestinya cukup
 * mengurangi kapasitas 5, bukan mematikan semuanya. Ledger jadi sumber kebenaran akses juga,
 * bukan cuma sumber kebenaran kapasitas.
 */
export async function requireAgentAccess(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ent = await getEntitlement(userId);
  if (capabilities(ent).paidCore) return { userId };
  if (await hasActiveSlotGrant(userId)) return { userId };
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
