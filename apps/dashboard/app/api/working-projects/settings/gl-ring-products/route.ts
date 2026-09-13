import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getGLRingProductIds, setGLRingProductIds } from "@/lib/working-projects/service"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const productIds = await getGLRingProductIds()
  return NextResponse.json({ productIds })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!Array.isArray(body.productIds) || !body.productIds.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json({ error: "productIds must be an array of strings" }, { status: 400 })
  }

  await setGLRingProductIds(body.productIds)
  return NextResponse.json({ ok: true })
}
