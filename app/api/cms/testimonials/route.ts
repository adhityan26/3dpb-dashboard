import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.testimonials)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })
  if (!body.text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 })

  const doc = await sanityWrite.create({
    _type: "testimonial",
    name: body.name,
    text: body.text,
    tags: body.tags ?? [],
    order: body.order ?? 0,
    ...(body.imageRef && {
      image: { _type: "image", asset: { _type: "reference", _ref: body.imageRef }, alt: body.alt ?? "" }
    }),
  })
  return NextResponse.json({ _id: doc._id }, { status: 201 })
}
