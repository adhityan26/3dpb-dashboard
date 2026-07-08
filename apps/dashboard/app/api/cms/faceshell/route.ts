import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await sanityRead.fetch(Q.faceshell)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityRead.fetch<{ _id: string } | null>(`*[_type == "faceshellCollection"][0]{ _id }`)
  if (!doc) return NextResponse.json({ error: "faceshellCollection document not found" }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.headline !== undefined) patch.headline = toLocalized(body.headline)
  if (body.description !== undefined) patch.description = toLocalized(body.description)
  if (body.orderWhatsappMessage !== undefined) patch.orderWhatsappMessage = body.orderWhatsappMessage
  if (body.externalMeasurementUrl !== undefined) patch.externalMeasurementUrl = body.externalMeasurementUrl
  if (body.externalMeasurementLabel !== undefined) patch.externalMeasurementLabel = toLocalized(body.externalMeasurementLabel)
  if (body.items !== undefined) {
    patch.items = (body.items as { imageRef: string; alt: string; title: { id: string; en: string }; caption: { id: string; en: string } }[]).map((item) => ({
      _type: "collectionItem",
      _key: crypto.randomUUID(),
      image: { _type: "image", asset: { _type: "reference", _ref: item.imageRef }, alt: item.alt },
      title: toLocalized(item.title),
      caption: toLocalized(item.caption),
    }))
  }

  await sanityWrite.patch(doc._id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
