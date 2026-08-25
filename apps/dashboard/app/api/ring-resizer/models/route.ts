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
  let body: { name?: unknown; baseBoreMm?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 })
  }
  // baseBoreMm is optional — normally auto-detected from the first uploaded
  // part that has a hole; an explicit value is accepted as a manual override.
  const baseBoreMm = typeof body?.baseBoreMm === "number" && body.baseBoreMm > 0 ? body.baseBoreMm : null
  const model = await prisma.ringModel.create({ data: { name, baseBoreMm } })
  return NextResponse.json({ model }, { status: 201 })
}
