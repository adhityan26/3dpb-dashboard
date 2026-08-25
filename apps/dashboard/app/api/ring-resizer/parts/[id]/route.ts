import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { deleteRingStl } from "@/lib/ring-resizer/storage"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const existing = await prisma.ringPart.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "part not found" }, { status: 404 })

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })

  const part = await prisma.ringPart.update({ where: { id }, data: { name } })
  return NextResponse.json({ part })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const existing = await prisma.ringPart.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "part not found" }, { status: 404 })

  // DB row first (anchors cascade), then best-effort MinIO cleanup — an
  // orphaned blob is harmless, an orphaned DB row breaks the file proxy.
  await prisma.ringPart.delete({ where: { id } })
  await Promise.allSettled([deleteRingStl(existing.modelId, existing.id)])
  return NextResponse.json({ ok: true })
}
