import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

// Links/unlinks the invoice of a marketplace order.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { quotationId?: unknown }
  const q = body.quotationId
  if (!(q === null || (typeof q === "string" && q.length > 0))) {
    return NextResponse.json({ error: "invalid_quotation_id" }, { status: 400 })
  }
  const order = await prisma.marketplaceOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const updated = await prisma.marketplaceOrder.update({ where: { id }, data: { quotationId: q } })
  return NextResponse.json(updated)
}
