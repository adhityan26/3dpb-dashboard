import { stlCheckIslands } from "@/lib/stl-service"
import { sanityAssetRefToUrl } from "@/lib/light-generator/sanity-helpers"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  // Auth: Bearer OPS_API_SECRET
  const authHeader = req.headers.get("authorization") ?? ""
  const secret = process.env.OPS_API_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { hasFloatingIslands: null, fallback: true },
      { status: 200 },
    )
  }

  try {
    const body = await req.json() as { imageAssetId?: string }
    const { imageAssetId } = body
    if (!imageAssetId) {
      return NextResponse.json({ hasFloatingIslands: null, fallback: true })
    }

    // Download image from Sanity CDN
    const imageUrl = sanityAssetRefToUrl(imageAssetId)
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      return NextResponse.json({ hasFloatingIslands: null, fallback: true })
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
    const ct = imageRes.headers.get("content-type") ?? "image/png"
    const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png"

    // Call STL service
    const result = await stlCheckIslands(imageBuffer, `silhouette.${ext}`, {})
    return NextResponse.json({ hasFloatingIslands: result.has_floating_islands })
  } catch {
    return NextResponse.json({ hasFloatingIslands: null, fallback: true })
  }
}
