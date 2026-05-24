import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.text !== undefined) patch.text = body.text
  if (body.tags !== undefined) patch.tags = body.tags
  if (body.order !== undefined) patch.order = body.order
  if (body.imageRef !== undefined) patch.image = { _type: "image", asset: { _type: "reference", _ref: body.imageRef }, alt: body.alt ?? "" }

  await sanityWrite.patch(id).set(patch).commit()
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  await sanityWrite.delete(id)
  return NextResponse.json({ ok: true })
}
