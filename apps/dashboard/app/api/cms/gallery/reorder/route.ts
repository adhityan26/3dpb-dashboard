import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: { id: string; order: number }[] = await req.json()
  const tx = sanityWrite.transaction()
  for (const { id, order } of body) {
    tx.patch(id, (p) => p.set({ order }))
  }
  await tx.commit()
  return NextResponse.json({ ok: true })
}
