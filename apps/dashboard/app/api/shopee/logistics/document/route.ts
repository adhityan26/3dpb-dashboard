import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateShippingDocument } from "@/lib/shopee/logistics"
import { addPageMargin } from "@/lib/shopee/pdf-margin"

// Blank paper left on every side of each resi page. Shopee's thermal PDF is
// full-bleed, so without this the printer's unprintable band clips the edges.
const LABEL_MARGIN_MM = 4

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
    const { pdf: originalPdf, failedOrderSns } = await generateShippingDocument(body.orderSnList)
    // Cosmetic re-framing only — if it fails for any reason (unexpected PDF
    // structure), still hand back Shopee's original so the resi is printable.
    let pdf = originalPdf
    try {
      pdf = await addPageMargin(originalPdf, LABEL_MARGIN_MM)
    } catch (marginErr) {
      console.error("[shopee/logistics/document] addPageMargin failed, serving original PDF:", marginErr)
    }
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
