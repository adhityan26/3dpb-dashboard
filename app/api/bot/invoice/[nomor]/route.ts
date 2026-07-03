import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getQuotationByNomor } from "@/lib/invoice/service"

export async function GET(req: NextRequest, { params }: { params: Promise<{ nomor: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { nomor } = await params
  const inv = await getQuotationByNomor(nomor)
  if (!inv) return NextResponse.json({ error: `Invoice ${nomor} tidak ditemukan` }, { status: 404 })
  return NextResponse.json({
    nomor: inv.nomor,
    status: inv.status,
    total: inv.total,
    totalPaid: inv.totalPaid,
    sisaBayar: inv.sisaBayar,
  })
}
