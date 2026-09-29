import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getShippingTableGroups, setShippingTableGroups, type ShippingTableGroup } from "@/lib/working-projects/service"
import { findDuplicateShippingKeyword } from "@/lib/working-projects/shipping-schedule"

const VALID_ROW_BY = new Set(["variant", "produk"])

function isValidGroups(body: unknown): body is ShippingTableGroup[] {
  return (
    Array.isArray(body) &&
    body.every(
      (g) =>
        g && typeof g === "object" &&
        typeof (g as ShippingTableGroup).title === "string" && (g as ShippingTableGroup).title.trim() &&
        Array.isArray((g as ShippingTableGroup).keywords) &&
        (g as ShippingTableGroup).keywords.every((k) => typeof k === "string") &&
        VALID_ROW_BY.has((g as ShippingTableGroup).rowBy),
    )
  )
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const groups = await getShippingTableGroups()
  return NextResponse.json({ groups })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const groups = body?.groups
  if (!isValidGroups(groups)) {
    return NextResponse.json({ error: "groups must be an array of { title: string, keywords: string[], rowBy: 'variant' | 'produk' }" }, { status: 400 })
  }

  // "1 produk hanya bisa 1 table" — reject a keyword reused across two
  // different groups before it ever reaches the pivot logic, rather than
  // silently letting group order decide the winner.
  const duplicate = findDuplicateShippingKeyword(groups)
  if (duplicate) {
    return NextResponse.json({ error: `duplicate_keyword`, message: `Kata kunci "${duplicate}" dipakai di lebih dari satu tabel` }, { status: 400 })
  }

  await setShippingTableGroups(groups)
  return NextResponse.json({ ok: true })
}
