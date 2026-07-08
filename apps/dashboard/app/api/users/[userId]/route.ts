import { auth } from "@/lib/auth"
import { updateUserRole, deleteUser } from "@/lib/users/service"
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
  let body: { role?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.role !== "string") {
    return NextResponse.json({ error: "role must be string" }, { status: 400 })
  }

  try {
    await updateUserRole(userId, body.role)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await ctx.params

  if (session.user.id === userId) {
    return NextResponse.json(
      { error: "Tidak bisa hapus akun sendiri" },
      { status: 400 },
    )
  }

  try {
    await deleteUser(userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
