import { auth } from "@/lib/auth"
import { syncProductIndex, invalidateProductsCache } from "@/lib/products/service"
import { NextResponse } from "next/server"

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Invalidate in-memory cache so next full load is fresh too
  invalidateProductsCache()

  // Run sync in background — respond immediately
  syncProductIndex()
    .then(({ synced, deleted }) => {
      console.log(`[sync-index] synced=${synced} deleted=${deleted}`)
    })
    .catch((err) => {
      console.error("[sync-index] failed:", err)
    })

  return NextResponse.json({ ok: true })
}
