import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { updateWorkingProject } from "@/lib/working-projects/service"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  const body = await req.json()
  const result = await updateWorkingProject(wp!.discordThreadId!, body)
  return NextResponse.json(result)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  await prisma.workingProject.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
