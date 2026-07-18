import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({
      authenticated: false,
      lifetimeOwned: false,
      subActive: false,
      can: { paidCore: false, cloud: false },
    });
  }
  const ent = await getEntitlement(userId);
  return NextResponse.json({
    authenticated: true,
    lifetimeOwned: ent.lifetimeOwned,
    subActive: ent.subStatus === "ACTIVE",
    can: capabilities(ent),
  });
}
