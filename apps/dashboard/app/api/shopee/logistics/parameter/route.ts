import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getShippingParameter } from "@/lib/shopee/logistics"

/**
 * Exposes getShippingParameter for one order so the client can populate the
 * drop-off branch picker before arranging shipment (pickup needs no client
 * round-trip — the ship route resolves that itself). Only the FIRST selected
 * order in a batch is queried; branch lists are shop-wide in practice.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orderSn = new URL(req.url).searchParams.get("orderSn")
  if (!orderSn) {
    return NextResponse.json({ error: "orderSn wajib diisi" }, { status: 400 })
  }

  try {
    const param = await getShippingParameter(orderSn)
    return NextResponse.json(param)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal mengambil parameter pengiriman" },
      { status: 502 },
    )
  }
}
