import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await sanityRead.fetch(Q.siteSettings)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityRead.fetch<{ _id: string } | null>(`*[_type == "siteSettings"][0]{ _id }`)
  if (!doc) return NextResponse.json({ error: "siteSettings document not found" }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.brandName !== undefined) patch.brandName = body.brandName
  if (body.tagline !== undefined) patch.tagline = toLocalized(body.tagline)
  if (body.contact !== undefined) {
    const c = body.contact
    if (c.whatsapp !== undefined) patch["contact.whatsapp"] = c.whatsapp
    if (c.instagram !== undefined) patch["contact.instagram"] = c.instagram
    if (c.email !== undefined) patch["contact.email"] = c.email
    if (c.address !== undefined) patch["contact.address"] = toLocalized(c.address)
    if (c.operatingHours !== undefined) patch["contact.operatingHours"] = toLocalized(c.operatingHours)
  }
  if (body.marketplaceLinks !== undefined) {
    const m = body.marketplaceLinks
    if (m.shopee !== undefined) patch["marketplaceLinks.shopee"] = m.shopee
    if (m.tokopedia !== undefined) patch["marketplaceLinks.tokopedia"] = m.tokopedia
    if (m.tiktokShop !== undefined) patch["marketplaceLinks.tiktokShop"] = m.tiktokShop
  }
  if (body.seo !== undefined) {
    if (body.seo.defaultTitle !== undefined) patch["seo.defaultTitle"] = toLocalized(body.seo.defaultTitle)
    if (body.seo.defaultDescription !== undefined) patch["seo.defaultDescription"] = toLocalized(body.seo.defaultDescription)
  }

  await sanityWrite.patch(doc._id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
