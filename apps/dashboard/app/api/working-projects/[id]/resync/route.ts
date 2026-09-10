import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resyncWorkingProject } from "@/lib/working-projects/service"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  return NextResponse.json(await resyncWorkingProject(id))
}
