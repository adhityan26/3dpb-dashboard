import { auth } from "@/lib/auth"
import { listUsers, createUser } from "@/lib/users/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const users = await listUsers()
    return NextResponse.json({ users })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    email?: unknown
    name?: unknown
    password?: unknown
    role?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (
    typeof body.email !== "string" ||
    typeof body.name !== "string" ||
    typeof body.password !== "string" ||
    typeof body.role !== "string"
  ) {
    return NextResponse.json(
      { error: "email, name, password, role are required" },
      { status: 400 },
    )
  }

  if (body.password.length < 8) {
    return NextResponse.json(
      { error: "Password minimal 8 karakter" },
      { status: 400 },
    )
  }

  try {
    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
      role: body.role,
    })
    return NextResponse.json({ user })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
