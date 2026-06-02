import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { uploadToMinio, getPresignedUrl } from "@/lib/lg-storage"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order?.imagePath) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Proxy through Next.js so the internal MinIO IP is never exposed to the browser
  const url = await getPresignedUrl(order.imagePath)
  const upstream = await fetch(url)
  if (!upstream.ok) return NextResponse.json({ error: "Image not found" }, { status: 404 })

  const ext = order.imagePath.endsWith(".jpg") ? "image/jpeg" : "image/png"
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? ext,
      "Cache-Control": "private, max-age=3600",
    },
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type.includes("jpeg") || file.type.includes("jpg") ? "jpg" : "png"
  const key = `orders/${id}/input.${ext}`
  await uploadToMinio(key, buffer, file.type)

  const updated = await prisma.lightGeneratorOrder.update({
    where: { id },
    data: { imagePath: key },
  })
  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}
