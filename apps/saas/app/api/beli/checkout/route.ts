import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOrReuseCheckout } from "@/lib/payment/service";
import { AlreadyOwned, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const p = await createOrReuseCheckout(userId);
    return NextResponse.json({ id: p.id, amount: p.amount, qrPayload: p.qrPayload, displayPrice: p.displayPrice });
  } catch (e) {
    if (e instanceof AlreadyOwned) return NextResponse.json({ owned: true });
    if (e instanceof PriceNotSet || e instanceof QrisNotSet || e instanceof CodePoolExhausted)
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
