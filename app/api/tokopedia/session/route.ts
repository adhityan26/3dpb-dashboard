import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { saveSession, getSessionStatus } from "@/lib/tokopedia/session"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null) as { cookies?: unknown } | null
  if (!body || !Array.isArray(body.cookies)) {
    return NextResponse.json({ error: "cookies harus berupa array dari EditThisCookies" }, { status: 400 })
  }
  try {
    const meta = await saveSession(body.cookies as { name: string; value: string }[])
    return NextResponse.json({ ok: true, ...meta })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan session" }, { status: 400 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await getSessionStatus())
}
