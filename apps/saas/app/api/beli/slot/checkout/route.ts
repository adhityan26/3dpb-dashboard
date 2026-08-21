import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSlotCheckout } from "@/lib/payment/service";
import { InvalidQuantity, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const quantity = Number((body as { quantity?: unknown }).quantity);
  try {
    const p = await createSlotCheckout(userId, quantity);
    return NextResponse.json({ id: p.id, amount: p.amount, qrPayload: p.qrPayload, displayPrice: p.displayPrice, quantity: p.quantity });
  } catch (e) {
    if (e instanceof InvalidQuantity) return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    if (e instanceof PriceNotSet || e instanceof QrisNotSet || e instanceof CodePoolExhausted)
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
