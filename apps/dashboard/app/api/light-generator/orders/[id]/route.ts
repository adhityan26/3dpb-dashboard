import { auth } from "@/lib/auth"
import { getLgOrder } from "@/lib/light-generator/service"
import { patchSanityOrderStatus } from "@/lib/light-generator/sanity-helpers"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await getLgOrder(id)
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(order)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const existing = await getLgOrder(id)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: {
    status?: string
    statusNote?: string | null
    notesOperator?: string | null
    configJsonOperator?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Build update payload — only include defined fields
  const data: Record<string, unknown> = {}
  if (body.status !== undefined) data.status = body.status
  if (body.statusNote !== undefined) data.statusNote = body.statusNote
  if (body.notesOperator !== undefined) data.notesOperator = body.notesOperator
  if (body.configJsonOperator !== undefined) data.configJsonOperator = body.configJsonOperator

  const updated = await prisma.lightGeneratorOrder.update({ where: { id }, data })

  // Sync status + statusNote back to Sanity if either changed
  const statusChanged = body.status !== undefined && body.status !== existing.status
  const statusNoteChanged = body.statusNote !== undefined && body.statusNote !== existing.statusNote
  if (statusChanged || statusNoteChanged) {
    let sanityDocId = existing.sanityDocId
    if (!sanityDocId) {
      // Fallback: GROQ lookup for migrated orders that have no sanityDocId stored
      const { sanityRead } = await import("@/lib/sanity/client")
      const doc = await sanityRead.fetch<{ _id: string } | null>(
        `*[_type == "lightGeneratorOrder" && orderId == $id][0]{ _id }`,
        { id },
      )
      sanityDocId = doc?._id ?? null
    }
    if (sanityDocId) {
      await patchSanityOrderStatus(
        sanityDocId,
        updated.status,
        statusNoteChanged ? (body.statusNote ?? null) : undefined,
      ).catch((err) => {
        // Log but don't fail the request if Sanity sync fails
        console.error("[LG PATCH] Sanity sync failed:", err)
      })
    }
  }

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}
