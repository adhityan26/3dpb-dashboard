import { NextRequest, NextResponse } from "next/server"
import { NoSuchKey } from "@aws-sdk/client-s3"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadRingStl } from "@/lib/ring-resizer/storage"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const part = await prisma.ringPart.findUnique({ where: { id } })
  if (!part) return NextResponse.json({ error: "part not found" }, { status: 404 })

  let buf: Buffer
  try {
    buf = await downloadRingStl(part.modelId, part.id)
  } catch (err) {
    if (err instanceof NoSuchKey) {
      return NextResponse.json({ error: "file not found in storage" }, { status: 404 })
    }
    throw err
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "model/stl",
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=3600", // STL immutable per part id
    },
  })
}
