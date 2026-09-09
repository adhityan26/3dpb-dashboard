import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getOrderById } from "@/lib/tokopedia/orders"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  if (!wp?.sourceOrderNo) return NextResponse.json({ error: "no_source" }, { status: 404 })

  if (wp.source === "shopee") {
    const [detail] = await getOrderDetail([wp.sourceOrderNo])
    if (!detail) return NextResponse.json({ error: "no_source" }, { status: 404 })
    return NextResponse.json(detail)
  }

  if (wp.source === "tokopedia") {
    const detail = await getOrderById(wp.sourceOrderNo)
    if (!detail) return NextResponse.json({ error: "no_source" }, { status: 404 })
    return NextResponse.json(detail)
  }

  return NextResponse.json({ error: "no_source" }, { status: 404 })
}
