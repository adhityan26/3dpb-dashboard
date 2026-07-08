import { auth } from "@/lib/auth"
import { setLabelPrinted } from "@/lib/orders/service"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED_ROLES = ["OWNER", "ADMIN"]

interface RouteContext {
  params: Promise<{ orderSn: string }>
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { orderSn } = await ctx.params

  let body: { printed?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body.printed !== "boolean") {
    return NextResponse.json(
      { error: "body.printed must be boolean" },
      { status: 400 },
    )
  }

  try {
    await setLabelPrinted(
      orderSn,
      body.printed,
      session.user.email ?? session.user.id,
    )
    return NextResponse.json({ orderSn, printed: body.printed })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error(`PUT /api/orders/${orderSn}/label failed:`, err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
