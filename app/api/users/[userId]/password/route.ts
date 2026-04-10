import { auth } from "@/lib/auth"
import { resetUserPassword } from "@/lib/users/service"
import { NextRequest, NextResponse } from "next/server"

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await ctx.params
  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.password !== "string") {
    return NextResponse.json(
      { error: "password must be string" },
      { status: 400 },
    )
  }

  try {
    await resetUserPassword(userId, body.password)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
