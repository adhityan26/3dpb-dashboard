import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { fetchSanityOrderById, sanityAssetRefToUrl } from "@/lib/light-generator/sanity-helpers"
import { uploadToMinio } from "@/lib/lg-storage"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/light-generator/orders/[id]/sync-sanity
 *
 * Re-fetches the order from Sanity and updates the local DB with the latest
 * customer data + images. Preserves: status, configJsonOperator, stlPath,
 * notesOperator.
 *
 * Only works for orders that are already confirmed (exist in local DB).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Order not found in local DB (not confirmed yet)" }, { status: 404 })
  }

  // 1. Fetch latest data from Sanity
  const sanityOrder = await fetchSanityOrderById(id)
  if (!sanityOrder) {
    return NextResponse.json({ error: "Order not found in Sanity" }, { status: 404 })
  }

  // 2. Re-download & re-upload silhouette image
  const silhouetteUrl = sanityAssetRefToUrl(sanityOrder.silhouetteImage.asset._ref)
  const silhouetteRes = await fetch(silhouetteUrl)
  if (!silhouetteRes.ok) {
    return NextResponse.json({ error: "Failed to download silhouette from Sanity CDN" }, { status: 502 })
  }
  const silhouetteBuffer = Buffer.from(await silhouetteRes.arrayBuffer())
  const ct = silhouetteRes.headers.get("content-type") ?? "image/png"
  const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png"
  const imagePath = `orders/${id}/input.${ext}`
  await uploadToMinio(imagePath, silhouetteBuffer, ct)

  // 3. Re-download & re-upload floor insert image (optional)
  let additionalImagePath: string | null = existing.additionalImagePath
  if (sanityOrder.floorInsertImage?.asset._ref) {
    const floorUrl = sanityAssetRefToUrl(sanityOrder.floorInsertImage.asset._ref)
    const floorRes = await fetch(floorUrl)
    if (floorRes.ok) {
      const floorBuffer = Buffer.from(await floorRes.arrayBuffer())
      const floorCt = floorRes.headers.get("content-type") ?? "image/png"
      additionalImagePath = `orders/${id}/additional.png`
      await uploadToMinio(additionalImagePath, floorBuffer, floorCt)
    }
  } else {
    additionalImagePath = null
  }

  // 4. Rebuild configJson from Sanity fields (customer data only)
  const configJson = JSON.stringify({
    size: sanityOrder.size,
    shape: sanityOrder.shape,
    shapeRatio: sanityOrder.shapeRatio ?? null,
    shadowDiameter: sanityOrder.shadowDiameter,
    shadowOffsetX: sanityOrder.shadowOffsetX,
    shadowOffsetY: sanityOrder.shadowOffsetY,
    supportStems: sanityOrder.supportStems,
  })

  // 5. Update local DB — preserve: status, configJsonOperator, stlPath, notesOperator
  const updated = await prisma.lightGeneratorOrder.update({
    where: { id },
    data: {
      customerName: sanityOrder.customerName,
      customerContact: sanityOrder.customerContact,
      notesCustomer: sanityOrder.customerNotes ?? null,
      configJson,
      imagePath,
      additionalImagePath,
    },
  })

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}
