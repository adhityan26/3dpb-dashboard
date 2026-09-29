import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCincinTableGroups, setCincinTableGroups, type CincinTableGroup } from "@/lib/working-projects/service"
import { findDuplicateCincinKeyword } from "@/lib/working-projects/shipping-schedule"

function isValidGroups(body: unknown): body is CincinTableGroup[] {
  return (
    Array.isArray(body) &&
    body.every(
      (g) =>
        g && typeof g === "object" &&
        typeof (g as CincinTableGroup).title === "string" && (g as CincinTableGroup).title.trim() &&
        Array.isArray((g as CincinTableGroup).keywords) &&
        (g as CincinTableGroup).keywords.every((k) => typeof k === "string"),
    )
  )
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const groups = await getCincinTableGroups()
  return NextResponse.json({ groups })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const groups = body?.groups
  if (!isValidGroups(groups)) {
    return NextResponse.json({ error: "groups must be an array of { title: string, keywords: string[] }" }, { status: 400 })
  }

  // "1 produk hanya bisa 1 table" — reject a keyword reused across two
  // different groups before it ever reaches the pivot logic, rather than
  // silently letting group order decide the winner.
  const duplicate = findDuplicateCincinKeyword(groups)
  if (duplicate) {
    return NextResponse.json({ error: `duplicate_keyword`, message: `Kata kunci "${duplicate}" dipakai di lebih dari satu tabel` }, { status: 400 })
  }

  await setCincinTableGroups(groups)
  return NextResponse.json({ ok: true })
}
