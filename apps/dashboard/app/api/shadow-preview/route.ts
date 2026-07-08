import { stlPreview } from "@/lib/stl-service"
import { sanityAssetRefToUrl } from "@/lib/light-generator/sanity-helpers"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? ""
  const secret = process.env.OPS_API_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json() as {
    imageAssetId?: string
    config?: { diameter?: number; offsetX?: number; offsetY?: number }
  }
  const { imageAssetId, config } = body
  if (!imageAssetId) {
    return NextResponse.json({ error: "Missing imageAssetId" }, { status: 400 })
  }

  // Download image from Sanity CDN
  const imageUrl = sanityAssetRefToUrl(imageAssetId)
  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 })
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
  const ct = imageRes.headers.get("content-type") ?? "image/png"
  const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png"

  // Build config in STL service format
  const stlConfig = {
    shadow: {
      diameter: config?.diameter ?? 15,
      offsetX: config?.offsetX ?? 0,
      offsetY: config?.offsetY ?? 0,
    },
  }

  // Call STL service /preview — returns PNG bytes
  const pngBytes = await stlPreview(imageBuffer, `silhouette.${ext}`, stlConfig)

  return new NextResponse(new Uint8Array(pngBytes), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  })
}
