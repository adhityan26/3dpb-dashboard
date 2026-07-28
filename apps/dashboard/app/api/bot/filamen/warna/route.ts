import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { cariWarnaKatalog, parseLimit, bersihkan } from "@/lib/filamen/color-lookup"

/** Lookup warna filament dari katalog SpoolmanDB.
 *  - nama → hex   : ?brand=eSUN&q=red
 *  - hex → nama   : ?hex=000000
 *  - hex → terdekat: ?hex=aa67eb&brand=bambu
 *  - browse merek : ?brand=bambu */
export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = new URL(req.url).searchParams
  const q = bersihkan(params.get("q"))
  const hex = bersihkan(params.get("hex"))
  const brand = bersihkan(params.get("brand"))
  const material = bersihkan(params.get("material"))

  // `material` sendirian tidak cukup: "warna PLA apa saja" lintas semua merek
  // bukan pertanyaan yang bisa dijawab bermakna dalam 20 baris.
  if (!q && !hex && !brand) {
    return NextResponse.json({ error: "butuh minimal salah satu: q, hex, atau brand" }, { status: 400 })
  }

  const hasil = await cariWarnaKatalog({ q, hex, brand, material, limit: parseLimit(params.get("limit")) })
  if (!hasil) return NextResponse.json({ error: "hex tidak valid" }, { status: 400 })

  return NextResponse.json(hasil)
}
