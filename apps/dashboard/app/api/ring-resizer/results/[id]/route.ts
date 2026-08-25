import { NextRequest, NextResponse } from "next/server"
import { NoSuchKey } from "@aws-sdk/client-s3"
import { auth } from "@/lib/auth"
import { downloadRingZip } from "@/lib/ring-resizer/storage"
import { sanitizeLabel } from "@/lib/ring-resizer/mesh/pipeline"

const ID_RE = /^[0-9a-f-]{36}$/

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!ID_RE.test(id)) return NextResponse.json({ error: "invalid result id" }, { status: 400 })

  let buf: Buffer
  try {
    buf = await downloadRingZip(id)
  } catch (err) {
    if (err instanceof NoSuchKey) {
      return NextResponse.json({ error: "result not found (expired?)" }, { status: 404 })
    }
    throw err
  }

  // Display name comes from the query string; re-sanitize server-side so it is
  // always header-safe regardless of what the client passed.
  const rawName = req.nextUrl.searchParams.get("name") ?? "ring.zip"
  const fileName = sanitizeLabel(rawName) || "ring.zip"

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}
