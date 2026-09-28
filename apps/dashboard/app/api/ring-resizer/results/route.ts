import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listRingResults, presignRingZipUrl } from "@/lib/ring-resizer/storage"
import { labelFromEntries } from "@/lib/ring-resizer/zip-index"
import { sanitizeLabel } from "@/lib/ring-resizer/mesh/pipeline"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/** Recent processed ZIPs, so results survive a page refresh mid-batch. */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const raw = Number(req.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT)
  const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT

  const results = await listRingResults(limit)
  const items = await Promise.all(
    results.map(async (r) => {
      const label = r.label ?? labelFromEntries(r.entries)
      const fileName = sanitizeLabel(r.fileName ?? `ring_${label ?? r.id.slice(0, 8)}.zip`)
      let directUrl: string | null = null
      try {
        directUrl = await presignRingZipUrl(r.id, fileName)
      } catch {
        // presign failure is non-fatal — proxy path still works
      }
      return {
        id: r.id,
        createdAt: r.lastModified,
        sizeBytes: r.sizeBytes,
        entries: r.entries,
        model: r.model,
        label,
        fileName,
        downloadUrl: `/api/ring-resizer/results/${r.id}?name=${encodeURIComponent(fileName)}`,
        directUrl,
      }
    }),
  )
  return NextResponse.json({ items })
}
