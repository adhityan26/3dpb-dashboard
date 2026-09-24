import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { updateWorkingProject } from "@/lib/working-projects/service"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  if (!wp) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!wp.discordThreadId) {
    return NextResponse.json(
      { error: "no_discord_thread", message: "This project has not synced to a Discord thread yet" },
      { status: 409 },
    )
  }
  const body = await req.json()
  try {
    const result = await updateWorkingProject(wp.discordThreadId, body)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Error && err.message.includes("unknown patch field")) {
      return NextResponse.json({ error: "unknown_patch_field", message: err.message }, { status: 400 })
    }
    if (err instanceof Error && err.message.includes("invalid patch value")) {
      return NextResponse.json({ error: "invalid_patch_value", message: err.message }, { status: 400 })
    }
    throw err
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    await prisma.workingProject.delete({ where: { id } })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    throw err
  }
  return NextResponse.json({ ok: true })
}
