import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await sanityRead.fetch(Q.generator)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityRead.fetch<{ _id: string } | null>(`*[_type == "silhouetteGenerator"][0]{ _id }`)
  if (!doc) return NextResponse.json({ error: "silhouetteGenerator document not found" }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.headline !== undefined) patch.headline = toLocalized(body.headline)
  if (body.description !== undefined) patch.description = toLocalized(body.description)
  if (body.launchStatus !== undefined) patch.launchStatus = body.launchStatus
  if (body.estimatedLaunch !== undefined) patch.estimatedLaunch = body.estimatedLaunch
  if (body.orderUrl !== undefined) patch.orderUrl = body.orderUrl
  if (body.orderLabel !== undefined) patch.orderLabel = toLocalized(body.orderLabel)
  if (body.devScreenshots !== undefined) {
    patch.devScreenshots = (body.devScreenshots as { imageRef: string; alt: string }[]).map((s) => ({
      _type: "image",
      _key: crypto.randomUUID(),
      asset: { _type: "reference", _ref: s.imageRef },
      alt: s.alt,
    }))
  }

  await sanityWrite.patch(doc._id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
