import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { deleteRingStl } from "@/lib/ring-resizer/storage"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const data: { name?: string; baseBoreMm?: number } = {}
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.baseBoreMm === "number" && body.baseBoreMm > 0) data.baseBoreMm = body.baseBoreMm
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 })
  const model = await prisma.ringModel.update({ where: { id }, data })
  return NextResponse.json({ model })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const parts = await prisma.ringPart.findMany({ where: { modelId: id }, select: { id: true } })
  await Promise.all(parts.map((p) => deleteRingStl(id, p.id)))
  await prisma.ringModel.delete({ where: { id } }) // cascades parts + anchors
  return NextResponse.json({ ok: true })
}
