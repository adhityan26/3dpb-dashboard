import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getMinioClient, LG_BUCKET } from "@/lib/minio"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!order.stlPath) return NextResponse.json({ error: "No STL generated yet" }, { status: 404 })

  // Stream through this route instead of redirecting to a presigned MinIO URL —
  // the dashboard is served over HTTPS while MinIO is plain HTTP, so browsers
  // silently block the redirect as mixed content.
  const client = getMinioClient()
  const obj = await client.send(
    new GetObjectCommand({ Bucket: LG_BUCKET, Key: order.stlPath }),
  )
  if (!obj.Body) return NextResponse.json({ error: "STL object is empty" }, { status: 500 })

  return new NextResponse(obj.Body.transformToWebStream(), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${id}-casing.stl"`,
      ...(obj.ContentLength ? { "Content-Length": String(obj.ContentLength) } : {}),
    },
  })
}
