import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadFromMinio } from "@/lib/lg-storage"
import { stlPreview } from "@/lib/stl-service"
import { MissingFlooringImageError, resolveFlooringImage } from "@/lib/light-generator/flooring-image"
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

  const imageBuffer = await downloadFromMinio(order.imagePath)
  const filename = order.imagePath.split("/").pop() ?? "input.png"
  const configJson = JSON.parse(order.configJsonOperator ?? order.configJson) as object

  let effectiveConfig: object
  let flooringImage
  try {
    ;({ config: effectiveConfig, flooringImage } = await resolveFlooringImage(
      configJson,
      order.additionalImagePath,
    ))
  } catch (err) {
    if (err instanceof MissingFlooringImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const pngBytes = await stlPreview(imageBuffer, filename, effectiveConfig, flooringImage)
  return new NextResponse(new Uint8Array(pngBytes), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  })
}
