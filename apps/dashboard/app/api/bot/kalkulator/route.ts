import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { loadRates } from "@/lib/kalkulator/rates"
import { hitungKalkulasi } from "@3pb/kalkulator-core"
import type { PrintTipe } from "@/lib/kalkulator/types"

export async function POST(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { gramasi?: unknown; jam?: unknown; tipe?: unknown } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

  const gramasi = Number(body.gramasi)
  const jam = Number(body.jam)
  if (!Number.isFinite(gramasi) || gramasi <= 0 || !Number.isFinite(jam) || jam <= 0) {
    return NextResponse.json({ error: "gramasi dan jam harus angka > 0" }, { status: 400 })
  }
  const tipe = (body.tipe === "SLA" ? "SLA" : "FDM") as PrintTipe

  const rates = await loadRates()
  const hasil = hitungKalkulasi(
    [{ tipe, gramasi, durasiJam: jam }],
    { switchQty: 0, hasLabel: false, komponenKustom: [] },
    1,
    rates,
  )
  return NextResponse.json({
    hppTotal: hasil.hppTotal,
    floorPrice: hasil.floorPrice,
    shopeeA: hasil.shopeeA,
    offlineA: hasil.offlineA,
    marginShopeeA: hasil.marginShopeeA,
  })
}
