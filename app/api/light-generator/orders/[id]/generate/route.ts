import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadFromMinio, uploadToMinio } from "@/lib/lg-storage"
import { stlGenerate } from "@/lib/stl-service"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Mark as generating
  await prisma.lightGeneratorOrder.update({ where: { id }, data: { status: "generating" } })

  try {
    // 1. Download silhouette from MinIO
    const imageBuffer = await downloadFromMinio(order.imagePath)
    const filename = order.imagePath.split("/").pop() ?? "input.png"

    // 2. Parse effective config (operator override if set, else customer config)
    const configJson = JSON.parse(order.configJsonOperator ?? order.configJson) as object

    // 3. Call STL service
    const stlBytes = await stlGenerate(imageBuffer, filename, configJson)

    // 4. Upload STL to MinIO
    const stlKey = `orders/${id}/casing.stl`
    await uploadToMinio(stlKey, stlBytes, "model/stl")

    // 5. Update order
    await prisma.lightGeneratorOrder.update({
      where: { id },
      data: { stlPath: stlKey, status: "ready" },
    })

    return NextResponse.json({ ok: true, stlSize: stlBytes.byteLength })
  } catch (err) {
    // Reset status on failure
    await prisma.lightGeneratorOrder.update({ where: { id }, data: { status: "paid" } })
    const msg = err instanceof Error ? err.message : "Generation failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
