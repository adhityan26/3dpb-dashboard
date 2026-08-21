import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { updateCydShipping } from "@/lib/payment/service";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const updated = await updateCydShipping(id, body as { shippingCost?: number; shippingStatus?: string });
    return NextResponse.json({ ok: true, shippingCost: updated.shippingCost, shippingStatus: updated.shippingStatus });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
