import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { saveSession, getSessionStatus } from "@/lib/tokopedia/session"

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth()
  if (session?.user) return true
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN
  const headerToken = req.headers.get("X-Internal-Token")
  return !!internalToken && !!headerToken && headerToken === internalToken
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await getSessionStatus())
}
