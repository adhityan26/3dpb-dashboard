import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createWorkingProject, createWorkingProjectsForOrder, summarizeOrderCreate } from "@/lib/working-projects/service"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const projects = await prisma.workingProject.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!body.source || !body.forumChannelId || !body.customer || !body.product) {
    return NextResponse.json({ error: "source, forumChannelId, customer, product are required" }, { status: 400 })
  }

  if ((body.source === 'shopee' || body.source === 'tokopedia') && body.sourceOrderNo) {
    if (!Array.isArray(body.units) || body.units.length === 0) {
      return NextResponse.json({ error: 'units wajib untuk order marketplace' }, { status: 400 })
    }
    const { units, forumChannelId, ...rest } = body
    const batch = await createWorkingProjectsForOrder({
      source: body.source,
      sourceOrderNo: body.sourceOrderNo,
      units,
      base: { ...rest, forumChannelIdFor: () => forumChannelId },
    })
    return NextResponse.json(summarizeOrderCreate(batch), { status: 201 })
  }

  const result = await createWorkingProject(body)
  return NextResponse.json(result, { status: 201 })
}
