import { NextRequest, NextResponse } from "next/server"
import { zipSync } from "fflate"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { computeScale } from "@/lib/ring-resizer/sizing"
import { parseProcessRequest } from "@/lib/ring-resizer/validate"
import { processPart, sanitizeLabel } from "@/lib/ring-resizer/mesh/pipeline"
import { downloadRingStl, uploadRingZip, presignRingZipUrl } from "@/lib/ring-resizer/storage"
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
  if (model.baseBoreMm == null) {
    return NextResponse.json(
      { error: "base bore belum terdeteksi/di-set untuk model ini — upload part band atau isi manual" },
      { status: 400 },
    )
  }

  // scaleCeil = whole-percent round-up, matching the legacy slicer workflow
  const { scaleCeil: scale } = computeScale({ mode, value, clearanceMm, baseBoreMm: model.baseBoreMm })
  const label = sanitizeLabel(text) || "resized"

  const files: Record<string, Uint8Array> = {}
  const usedKeys = new Set<string>()
  const warnings: string[] = []
  for (const part of model.parts) {
    let stl: Buffer
    try {
      stl = await downloadRingStl(model.id, part.id)
    } catch {
      warnings.push(`${part.name}: file STL tidak ditemukan di storage — part dilewati`)
      continue
    }
    const anchors: AnchorInput[] = part.anchors.map((a) => ({
      pos: [a.posX, a.posY, a.posZ],
      normal: [a.normX, a.normY, a.normZ],
      up: [a.upX, a.upY, a.upZ],
      textHeightMm: a.textHeightMm,
      depthMm: a.depthMm,
    }))
    const result = await processPart({
      stl, scale, anchors, text,
      rotationDeg: [part.rotXDeg, part.rotYDeg, part.rotZDeg],
    })

    // Part names have no uniqueness constraint — dedupe sanitized keys so two
    // parts with the same (or same-sanitized) name don't silently overwrite
    // each other's ZIP entry.
    const baseKey = sanitizeLabel(part.name)
    let key = `${baseKey}_${label}.stl`
    let suffix = 2
    while (usedKeys.has(key)) {
      key = `${baseKey}-${suffix}_${label}.stl`
      suffix++
    }
    usedKeys.add(key)

    files[key] = result.stl // Buffer is already a Uint8Array subclass
    if (result.warning) warnings.push(`${part.name}: ${result.warning}`)
  }

  if (Object.keys(files).length === 0) {
    return NextResponse.json(
      { error: "all parts failed to process — no STL files available for this model", warnings },
      { status: 500 },
    )
  }

  const zip = zipSync(files, { level: 0 }) // STL barely compresses; skip the CPU

  // Large fetch() bodies proved fragile through the reverse proxy (Chrome
  // aborted mid-body while nginx reported a fully-sent 200). Instead of
  // returning the ZIP inline, store it and hand back a small JSON payload —
  // the browser then downloads via a plain GET (cookies included, native
  // progress, and the same code path as the STL file proxy that works).
  const resultId = crypto.randomUUID()
  const fileName = `${sanitizeLabel(model.name)}_${label}.zip`
  // Metadata lets the "recent results" list name the file after a page
  // refresh, when the browser has lost this response.
  await uploadRingZip(resultId, zip, { fileName, model: sanitizeLabel(model.name), label })
  // directUrl: presigned MinIO link — LAN clients download straight from the
  // NAS, skipping the app (and any tunnel). The client probes reachability
  // and falls back to downloadUrl (app-proxied) automatically.
  let directUrl: string | null = null
  try {
    directUrl = await presignRingZipUrl(resultId, fileName)
  } catch {
    // presign failure is non-fatal — proxy path still works
  }
  return NextResponse.json({
    resultId,
    downloadUrl: `/api/ring-resizer/results/${resultId}?name=${encodeURIComponent(fileName)}`,
    directUrl,
    fileName,
    warnings,
  })
}
