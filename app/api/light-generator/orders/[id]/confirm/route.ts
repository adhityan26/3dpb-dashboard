import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { fetchSanityOrderById, sanityAssetRefToUrl, patchSanityOrderStatus } from "@/lib/light-generator/sanity-helpers"
import { uploadToMinio } from "@/lib/lg-storage"
import { sendNotification } from "@/lib/notifications/senders"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Check if already confirmed
  const existing = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (existing) {
    return NextResponse.json({ error: "Order already confirmed" }, { status: 409 })
  }

  // 1. Fetch from Sanity
  const sanityOrder = await fetchSanityOrderById(id)
  if (!sanityOrder) {
    return NextResponse.json({ error: "Order not found in Sanity" }, { status: 404 })
  }

  // 2. Download silhouette from Sanity CDN → upload to MinIO
  const silhouetteUrl = sanityAssetRefToUrl(sanityOrder.silhouetteImage.asset._ref)
  const silhouetteRes = await fetch(silhouetteUrl)
  if (!silhouetteRes.ok) {
    return NextResponse.json({ error: "Failed to download silhouette from Sanity CDN" }, { status: 502 })
  }
  const silhouetteBuffer = Buffer.from(await silhouetteRes.arrayBuffer())
  // Detect extension from Content-Type
  const ct = silhouetteRes.headers.get("content-type") ?? "image/png"
  const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png"
  const imagePath = `orders/${id}/input.${ext}`
  await uploadToMinio(imagePath, silhouetteBuffer, ct)

  // 3. Download floor insert image (optional)
  let additionalImagePath: string | null = null
  if (sanityOrder.floorInsertImage?.asset._ref) {
    const floorUrl = sanityAssetRefToUrl(sanityOrder.floorInsertImage.asset._ref)
    const floorRes = await fetch(floorUrl)
    if (floorRes.ok) {
      const floorBuffer = Buffer.from(await floorRes.arrayBuffer())
      const floorCt = floorRes.headers.get("content-type") ?? "image/png"
      additionalImagePath = `orders/${id}/additional.png`
      await uploadToMinio(additionalImagePath, floorBuffer, floorCt)
    }
  }

  // 4. Build configJson from Sanity fields
  const configJson = JSON.stringify({
    size: sanityOrder.size,
    shape: sanityOrder.shape,
    shapeRatio: sanityOrder.shapeRatio ?? null,
    shadowDiameter: sanityOrder.shadowDiameter,
    shadowOffsetX: sanityOrder.shadowOffsetX,
    shadowOffsetY: sanityOrder.shadowOffsetY,
    supportStems: sanityOrder.supportStems,
  })

  // 5. Create in local DB
  await prisma.lightGeneratorOrder.create({
    data: {
      id,
      sanityDocId: sanityOrder._id,
      status: "paid",
      customerName: sanityOrder.customerName,
      customerContact: sanityOrder.customerContact,
      notesCustomer: sanityOrder.customerNotes ?? null,
      configJson,
      imagePath,
      additionalImagePath,
    },
  })

  // 6. Send notification
  await sendNotification(`✅ New LG order confirmed: ${id} (${sanityOrder.customerName})`)

  // 7. Update Sanity status → 'paid'
  await patchSanityOrderStatus(sanityOrder._id, "paid").catch((err) => {
    console.error("[LG confirm] Sanity status update failed:", err)
  })

  return NextResponse.json({ ok: true, id })
}
