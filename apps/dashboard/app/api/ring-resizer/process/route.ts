import { NextRequest, NextResponse } from "next/server"
import { zipSync } from "fflate"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { computeScale } from "@/lib/ring-resizer/sizing"
import { parseProcessRequest } from "@/lib/ring-resizer/validate"
import { processPart, sanitizeLabel } from "@/lib/ring-resizer/mesh/pipeline"
import { downloadRingStl } from "@/lib/ring-resizer/storage"
import type { AnchorInput } from "@/lib/ring-resizer/types"

// Boolean ops on 1.7M-triangle meshes take tens of seconds.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = parseProcessRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { modelId, mode, value, clearanceMm, text } = parsed.req

  const model = await prisma.ringModel.findUnique({
    where: { id: modelId },
    include: { parts: { include: { anchors: true }, orderBy: { createdAt: "asc" } } },
  })
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 })
  if (model.parts.length === 0) return NextResponse.json({ error: "model has no parts" }, { status: 400 })

  const { scale } = computeScale({ mode, value, clearanceMm, baseBoreMm: model.baseBoreMm })
  const label = sanitizeLabel(text) || "resized"

  const files: Record<string, Uint8Array> = {}
  const warnings: string[] = []
  for (const part of model.parts) {
    const stl = await downloadRingStl(model.id, part.id)
    const anchors: AnchorInput[] = part.anchors.map((a) => ({
      pos: [a.posX, a.posY, a.posZ],
      normal: [a.normX, a.normY, a.normZ],
      up: [a.upX, a.upY, a.upZ],
      textHeightMm: a.textHeightMm,
      depthMm: a.depthMm,
    }))
    const result = await processPart({ stl, scale, anchors, text })
    files[`${sanitizeLabel(part.name)}_${label}.stl`] = result.stl // Buffer is already a Uint8Array subclass
    if (result.warning) warnings.push(`${part.name}: ${result.warning}`)
  }

  const zip = zipSync(files, { level: 0 }) // STL barely compresses; skip the CPU
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sanitizeLabel(model.name)}_${label}.zip"`,
      // URI-encoded: raw JSON can contain non-Latin1 chars (e.g. the em-dash in
      // engrave.ts fallback warnings), which throws when assigned as a header
      // value. Consumers must JSON.parse(decodeURIComponent(...)).
      "X-Ring-Warnings": encodeURIComponent(JSON.stringify(warnings)),
    },
  })
}
