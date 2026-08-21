import { NextResponse } from "next/server";
import { requirePaidCore } from "@/lib/session-auth";
import { createOrReuseCydCheckout } from "@/lib/payment/service";
import { InvalidQuantity, InvalidShippingAddress, InvalidCydVariant, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export async function POST(req: Request) {
  const gate = await requirePaidCore();
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => ({}));
  const { cydVariantId, quantity, shippingAddress } = body as { cydVariantId?: unknown; quantity?: unknown; shippingAddress?: unknown };
  try {
    const p = await createOrReuseCydCheckout(
      gate.userId,
      String(cydVariantId ?? ""),
      Number(quantity),
      String(shippingAddress ?? "")
    );
    return NextResponse.json({
      id: p.id, amount: p.amount, qrPayload: p.qrPayload, displayPrice: p.displayPrice,
      quantity: p.quantity, cydVariantId: p.cydVariantId, shippingAddress: p.shippingAddress,
    });
  } catch (e) {
    if (e instanceof InvalidQuantity || e instanceof InvalidShippingAddress || e instanceof InvalidCydVariant)
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    if (e instanceof PriceNotSet || e instanceof QrisNotSet || e instanceof CodePoolExhausted)
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
