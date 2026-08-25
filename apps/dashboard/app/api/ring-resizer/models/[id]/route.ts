import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { deleteRingStl } from "@/lib/ring-resizer/storage"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const existing = await prisma.ringModel.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "model not found" }, { status: 404 })

  let body: { name?: unknown; baseBoreMm?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
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
  const existing = await prisma.ringModel.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "model not found" }, { status: 404 })

  const parts = await prisma.ringPart.findMany({ where: { modelId: id }, select: { id: true } })
  // Delete the DB row first (cascades parts + anchors) so the file proxy never
  // references a part whose blob is already gone; an orphaned MinIO blob after
  // a failed cleanup below is harmless, an orphaned DB row is not.
  await prisma.ringModel.delete({ where: { id } })
  await Promise.allSettled(parts.map((p) => deleteRingStl(id, p.id)))
  return NextResponse.json({ ok: true })
}
