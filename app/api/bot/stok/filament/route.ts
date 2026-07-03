import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { listSpools } from "@/lib/filamen/spool-service"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const brand = (new URL(req.url).searchParams.get("brand") ?? "").trim().toLowerCase()
  const { spools } = await listSpools()
  const filtered = brand ? spools.filter(s => s.brand.toLowerCase().includes(brand)) : spools

  const groups = new Map<string, number>()
  for (const s of filtered) {
    if (s.status === "empty") continue
    const key = `${s.brand} ${s.material}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const list = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }))
  return NextResponse.json({ groups: list })
}
