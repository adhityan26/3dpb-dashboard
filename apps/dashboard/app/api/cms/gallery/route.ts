import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.gallery)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!body.category) return NextResponse.json({ error: "category required" }, { status: 400 })
  if (!body.imageRef) return NextResponse.json({ error: "imageRef required" }, { status: 400 })

  const doc = await sanityWrite.create({
    _type: "galleryItem",
    title: toLocalized(body.title ?? {}),
    image: { _type: "image", asset: { _type: "reference", _ref: body.imageRef }, alt: body.alt ?? "" },
    category: body.category,
    caption: toLocalized(body.caption ?? {}),
    order: body.order ?? 0,
  })
  return NextResponse.json({ _id: doc._id }, { status: 201 })
}
