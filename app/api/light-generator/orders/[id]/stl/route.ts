import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getPresignedUrl } from "@/lib/lg-storage"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!order.stlPath) return NextResponse.json({ error: "No STL generated yet" }, { status: 404 })

  const url = await getPresignedUrl(order.stlPath, 3600)
  return NextResponse.redirect(url, 302)
}
