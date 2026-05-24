import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

const VALID_STATUSES = ["new", "in-progress", "done", "cancelled"] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    patch.status = body.status
  }
  if (body.adminNotes !== undefined) patch.adminNotes = body.adminNotes

  await sanityWrite.patch(id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
