import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateShippingDocument } from "@/lib/shopee/logistics"

export interface ShippingDocumentInput {
  orderSnList: string[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: ShippingDocumentInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!Array.isArray(body.orderSnList) || body.orderSnList.length === 0) {
    return NextResponse.json({ error: "orderSnList wajib diisi" }, { status: 400 })
  }

  try {
    const { pdf, failedOrderSns } = await generateShippingDocument(body.orderSnList)
    const headers: Record<string, string> = { "Content-Type": "application/pdf" }
    if (failedOrderSns.length > 0) {
      headers["X-Failed-Orders"] = failedOrderSns.join(",")
    }
    return new NextResponse(new Uint8Array(pdf), { status: 200, headers })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat dokumen resi"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
