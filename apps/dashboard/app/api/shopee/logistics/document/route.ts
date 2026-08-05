import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateShippingDocument } from "@/lib/shopee/logistics"

export interface ShippingDocumentInput {
  orderSnList: string[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: ShippingDocumentInput = await req.json()
  if (!Array.isArray(body.orderSnList) || body.orderSnList.length === 0) {
    return NextResponse.json({ error: "orderSnList wajib diisi" }, { status: 400 })
  }

  try {
    const pdf = await generateShippingDocument(body.orderSnList)
    return new NextResponse(new Uint8Array(pdf), { status: 200, headers: { "Content-Type": "application/pdf" } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat dokumen resi"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
