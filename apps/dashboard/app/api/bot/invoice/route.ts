import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { createQuotation } from "@/lib/invoice/service"

const BASE_URL = "https://dashboard.3dprintingbandung.my.id"

interface ItemInput { namaProduk?: unknown; qty?: unknown; hargaPerUnit?: unknown }

export async function POST(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { buyer?: unknown; items?: unknown; ongkir?: unknown } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

  const buyer = typeof body.buyer === "string" ? body.buyer.trim() : ""
  if (!buyer) return NextResponse.json({ error: "buyer wajib diisi" }, { status: 400 })

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items wajib berisi minimal 1 item" }, { status: 400 })
  }

  const items = []
  for (const raw of body.items as ItemInput[]) {
    const namaProduk = typeof raw.namaProduk === "string" ? raw.namaProduk.trim() : ""
    const qty = Number(raw.qty)
    const hargaPerUnit = Number(raw.hargaPerUnit)
    if (!namaProduk || !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty) ||
        !Number.isFinite(hargaPerUnit) || hargaPerUnit <= 0) {
      return NextResponse.json(
        { error: "setiap item butuh namaProduk, qty (int>0), hargaPerUnit (>0)" },
        { status: 400 },
      )
    }
    items.push({ namaProduk, qty, hargaPerUnit, channelHarga: "marketplace" as const })
  }

  const ongkir = typeof body.ongkir === "number" && body.ongkir >= 0 ? body.ongkir : 0

  try {
    const inv = await createQuotation({ buyerNama: buyer, ongkir, items })
    return NextResponse.json({ nomor: inv.nomor, total: inv.total, url: `${BASE_URL}/tagihan` })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat invoice" }, { status: 500 })
  }
}
