import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { patchKeycapOrderStatus } from "@/lib/keycap/sanity-helpers"
import type { KeycapStatus } from "@/lib/sanity/types"

const VALID_STATUSES: KeycapStatus[] = ["pending", "confirmed", "printing", "done", "cancelled"]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  await patchKeycapOrderStatus(id, body.status, body.statusNote)
  return NextResponse.json({ ok: true })
}
