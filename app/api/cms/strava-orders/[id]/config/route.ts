import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { generateMap2ModelProject } from "@/lib/map2model"
import type { LayerName, LayerColors } from "@/lib/map2model"

const DEFAULT_COLORS: LayerColors = {
  gpxPath: "#FC4C02",
  road: "#D4C5A9",
  water: "#5BA4CF",
  green: "#8DB87A",
  building: "#B8A898",
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const order = await sanityRead.fetch<{
    _id: string
    name: string | null
    size: string | null
    shape: string | null
    enabledLayers: string[] | null
    colors: Partial<LayerColors> | null
    gpxGeoJson: string | null
    areaPolygon: string | null
  } | null>(
    `*[_type == "stravaMapOrder" && _id == $id][0]{
      _id, name, size, shape, enabledLayers, colors, gpxGeoJson, areaPolygon
    }`,
    { id }
  )

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let gpxGeoJson: Record<string, unknown> | undefined
  if (order.gpxGeoJson) {
    try { gpxGeoJson = JSON.parse(order.gpxGeoJson) as Record<string, unknown> } catch { /* ignore */ }
  }

  let areaPolygon: Record<string, unknown> | undefined
  if (order.areaPolygon) {
    try { areaPolygon = JSON.parse(order.areaPolygon) as Record<string, unknown> } catch { /* ignore */ }
  }

  const projectJson = generateMap2ModelProject({
    size: (order.size ?? "medium") as "small" | "medium" | "large",
    shape: (order.shape ?? "square") as "square" | "rectangle" | "circle" | "hexagon",
    colors: { ...DEFAULT_COLORS, ...(order.colors ?? {}) },
    enabledLayers: (order.enabledLayers ?? ["road", "water", "green", "building"]) as LayerName[],
    gpxGeoJson,
    areaPolygon,
  })

  const safeName = (order.name ?? "order").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
  const filename = `map2model-${safeName}-${id.slice(-6)}.json`

  return new NextResponse(JSON.stringify(projectJson, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
