import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseAnchorsBody } from "@/lib/ring-resizer/validate"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: partId } = await params
  const part = await prisma.ringPart.findUnique({ where: { id: partId } })
  if (!part) return NextResponse.json({ error: "part not found" }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = parseAnchorsBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const anchors = await prisma.$transaction(async (tx) => {
    await tx.ringAnchor.deleteMany({ where: { partId } })
    await tx.ringAnchor.createMany({
      data: parsed.anchors.map((a) => ({
        partId,
        posX: a.pos[0], posY: a.pos[1], posZ: a.pos[2],
        normX: a.normal[0], normY: a.normal[1], normZ: a.normal[2],
        upX: a.up[0], upY: a.up[1], upZ: a.up[2],
        textHeightMm: a.textHeightMm, depthMm: a.depthMm,
      })),
    })
    return tx.ringAnchor.findMany({ where: { partId } })
  })
  return NextResponse.json({ anchors })
}
