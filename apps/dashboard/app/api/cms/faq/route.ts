import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.faq)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityWrite.create({
    _type: "faq",
    question: toLocalized(body.question ?? {}),
    answer: toLocalized(body.answer ?? {}),
    tags: body.tags ?? [],
    order: body.order ?? 0,
  })
  return NextResponse.json({ _id: doc._id }, { status: 201 })
}
