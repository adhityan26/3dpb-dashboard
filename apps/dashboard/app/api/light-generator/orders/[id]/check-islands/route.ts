import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadFromMinio } from "@/lib/lg-storage"
import { stlCheckIslands } from "@/lib/stl-service"
import { MissingFlooringImageError, resolveFlooringImage } from "@/lib/light-generator/flooring-image"
import { NextRequest, NextResponse } from "next/server"

// Session-authed route for the v2 editor's live island check (distinct from
// /api/island-check, which is an unrelated Sanity/OPS_API_SECRET flow).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const imageBuffer = await downloadFromMinio(order.imagePath)
  const filename = order.imagePath.split("/").pop() ?? "input.png"

  // Optional { config } body overrides the persisted config, same rule as
  // the preview route, so island checks reflect unsaved edits.
  const body = await req.json().catch(() => ({} as { config?: unknown }))
  const configJson = (
    body && typeof body === "object" && body.config && typeof body.config === "object"
      ? body.config
      : JSON.parse(order.configJsonOperator ?? order.configJson)
  ) as object

  // stlCheckIslands takes a config object, not a flooring image — resolve
  // the flooring image so "custom" is stripped from the config (it would
  // otherwise fail GeneratorConfig validation), but discard the image itself.
  let effectiveConfig: object
  try {
    ;({ config: effectiveConfig } = await resolveFlooringImage(configJson, order.additionalImagePath))
  } catch (err) {
    if (err instanceof MissingFlooringImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const result = await stlCheckIslands(imageBuffer, filename, effectiveConfig)
  return NextResponse.json({ has_floating_islands: result.has_floating_islands })
}
