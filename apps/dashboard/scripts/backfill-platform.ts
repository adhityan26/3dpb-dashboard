// One-off backfill (2026-10-04): auto-create never passed `platform`, so every
// WP it created since 2026-09-27 had a blank Platform column. For marketplace
// WPs the value follows directly from `source`, so no API call is needed.
// Goes through updateWorkingProject so the Discord starter post is re-synced.
import { prisma } from "@/lib/db"
import { updateWorkingProject } from "@/lib/working-projects/service"

const PLATFORM_BY_SOURCE: Record<string, string> = { shopee: "Shopee", tokopedia: "Tokopedia" }

async function main() {
  const rows = await prisma.workingProject.findMany({
    where: { source: { in: Object.keys(PLATFORM_BY_SOURCE) }, OR: [{ platform: null }, { platform: "" }] },
    select: { source: true, sourceOrderNo: true, discordThreadId: true },
  })
  console.log(`total to backfill: ${rows.length}`)

  let updated = 0
  let skippedNoThread = 0
  let failed = 0
  for (const r of rows) {
    if (!r.discordThreadId) { skippedNoThread++; continue }
    try {
      await updateWorkingProject(r.discordThreadId, { platform: PLATFORM_BY_SOURCE[r.source] })
      updated++
    } catch (err) {
      failed++
      console.error(`${r.source}:${r.sourceOrderNo}: ${(err as Error).message}`)
    }
  }
  console.log(`updated: ${updated}  skippedNoThread: ${skippedNoThread}  failed: ${failed}`)
}

main().finally(() => prisma.$disconnect())
