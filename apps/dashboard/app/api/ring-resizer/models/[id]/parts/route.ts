import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseBinaryStl } from "@/lib/ring-resizer/mesh/stl"
import { detectBoreMm, isPlausibleRingBore } from "@/lib/ring-resizer/mesh/bore"
import { uploadRingStl } from "@/lib/ring-resizer/storage"

// STL uploads run to ~130MB — keep this handler on the Node runtime.
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: modelId } = await params

  const model = await prisma.ringModel.findUnique({ where: { id: modelId } })
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file")
  const name = typeof form.get("name") === "string" ? (form.get("name") as string).trim() : ""
  if (!(file instanceof File) || !name) {
    return NextResponse.json({ error: "file (STL) and name required" }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())

  let triCount: number
  let boreMm: number | null
  try {
    const mesh = parseBinaryStl(buf)
    triCount = mesh.triVerts.length / 3
    boreMm = detectBoreMm(mesh)
  } catch (err) {
    return NextResponse.json(
      { error: `invalid STL: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    )
  }

  const part = await prisma.ringPart.create({
    data: { modelId, name, sizeBytes: buf.length, triCount, boreMm },
  })
  try {
    await uploadRingStl(modelId, part.id, buf)
  } catch (err) {
    // Storage upload failed — the part row would otherwise be an orphan with
    // no backing STL and no way to delete it later. Roll it back.
    await prisma.ringPart.delete({ where: { id: part.id } }).catch(() => {})
    return NextResponse.json(
      { error: `failed to store STL: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }
  // First part with a detected hole becomes the model's base bore (the band
  // is normally uploaded first); the UI offers per-part override afterwards.
  if (model.baseBoreMm == null && boreMm != null && isPlausibleRingBore(boreMm)) {
    await prisma.ringModel.update({ where: { id: modelId }, data: { baseBoreMm: boreMm } })
  }
  return NextResponse.json({ part }, { status: 201 })
}
