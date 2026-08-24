import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const models = await prisma.ringModel.findMany({
    orderBy: { createdAt: "desc" },
    include: { parts: { include: { anchors: true }, orderBy: { createdAt: "asc" } } },
  })
  return NextResponse.json({ models })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json()
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const baseBoreMm = typeof body?.baseBoreMm === "number" ? body.baseBoreMm : NaN
  if (!name || !(baseBoreMm > 0)) {
    return NextResponse.json({ error: "name and baseBoreMm (> 0) required" }, { status: 400 })
  }
  const model = await prisma.ringModel.create({ data: { name, baseBoreMm } })
  return NextResponse.json({ model }, { status: 201 })
}
