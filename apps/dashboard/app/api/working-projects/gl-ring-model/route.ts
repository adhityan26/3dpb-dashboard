import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

// The GL Ring tab's Scale % column needs the real Ring Resizer formula
// (see lib/ring-resizer/sizing.ts), which is keyed off a per-model
// baseBoreMm rather than a fixed table. This returns the baseBoreMm for the
// "Green Lantern 2026" model specifically — the one the tab's product name
// match is built around. Ring models for OTHER Green Lantern variants
// (Guy Gardner, Hal Jordan v2, ...) exist with their own baseBoreMm, but the
// tab has no per-row way to tell which model a given order actually used,
// so it applies this one model's figure uniformly. If that turns out wrong
// for a meaningful share of orders, this needs a real per-row model
// assignment instead of a single global figure.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const model = await prisma.ringModel.findFirst({
    where: { name: { contains: "2026", mode: "insensitive" } },
    select: { baseBoreMm: true },
  })
  return NextResponse.json({ baseBoreMm: model?.baseBoreMm ?? null })
}
