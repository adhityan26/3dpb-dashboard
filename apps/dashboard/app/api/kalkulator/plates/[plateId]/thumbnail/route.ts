import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { uploadToMinio, getPresignedUrl } from "@/lib/lg-storage"

function thumbnailKeyFor(plateId: string): string {
  return `kalkulator-thumbnails/${plateId}.png`
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ plateId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { plateId } = await params
  const plate = await prisma.kalkulasiPlate.findUnique({ where: { id: plateId } })
  if (!plate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = thumbnailKeyFor(plateId)
  await uploadToMinio(key, buffer, "image/png")
  await prisma.kalkulasiPlate.update({ where: { id: plateId }, data: { thumbnailKey: key } })

  return NextResponse.json({ thumbnailKey: key })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ plateId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { plateId } = await params
  const plate = await prisma.kalkulasiPlate.findUnique({ where: { id: plateId } })
  if (!plate?.thumbnailKey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Proxy lewat Next.js — presigned URL / IP internal MinIO tidak pernah kena expose ke browser
  const url = await getPresignedUrl(plate.thumbnailKey)
  const upstream = await fetch(url)
  if (!upstream.ok) return NextResponse.json({ error: "Image not found" }, { status: 404 })

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  })
}
